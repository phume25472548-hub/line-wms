import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const LINE_LOGIN_CHANNEL_ID = "2012121135";
const APP_NAME = "LINE WMS";
const APP_VERSION = "1.2.0";
const PUBLIC_SETTING_KEYS = [
  "COMPANY_NAME",
  "TIMEZONE",
  "SCAN_MODE",
  "STOCK_IN_TYPES",
  "WRITE_OFF_REASONS",
  "SUPPLIER_RETURN_REASONS",
  "ADJUST_REASONS",
  "CANCEL_REASONS",
  "PAPER_SIZE",
  "SHOP_NAME",
  "SHOP_ADDRESS",
  "SHOP_PHONE",
  "SHOP_TAX_ID",
  "BILL_FOOTER",
];

const allowedOrigins = new Set([
  "https://phume25472548-hub.github.io",
]);

function corsHeaders(origin: string | null): Record<string, string> {
  return {
    "Access-Control-Allow-Origin": origin && allowedOrigins.has(origin) ? origin : "https://phume25472548-hub.github.io",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
}

function response(body: unknown, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

class ApiError extends Error {
  code: string;
  details: unknown;
  status: number;
  constructor(code: string, message: string, status = 400, details: unknown = null) {
    super(message);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

function serviceClient() {
  const url = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !serviceKey) throw new ApiError("SERVER_CONFIG", "การตั้งค่า Supabase ยังไม่ครบ", 500);
  return createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
}

async function verifyLineIdToken(idToken: unknown) {
  if (typeof idToken !== "string" || idToken.length < 20 || idToken.length > 4096) {
    throw new ApiError("AUTH_REQUIRED", "กรุณาเปิดระบบผ่าน LINE เพื่อเข้าสู่ระบบ", 401);
  }

  const form = new URLSearchParams({ id_token: idToken, client_id: LINE_LOGIN_CHANNEL_ID });
  const res = await fetch("https://api.line.me/oauth2/v2.1/verify", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form,
    signal: AbortSignal.timeout(8000),
  });
  const claims = await res.json().catch(() => ({}));
  const now = Math.floor(Date.now() / 1000);
  if (!res.ok || String(claims.aud || "") !== LINE_LOGIN_CHANNEL_ID ||
      (claims.iss && claims.iss !== "https://access.line.me") ||
      !claims.sub || Number(claims.exp) <= now) {
    const expired = Number(claims.exp) > 0 && Number(claims.exp) <= now;
    throw new ApiError(expired ? "AUTH_EXPIRED" : "AUTH_INVALID",
      expired ? "การเข้าสู่ระบบหมดอายุ กรุณาเปิด LINE ใหม่" : "ยืนยันตัวตนกับ LINE ไม่สำเร็จ", 401);
  }
  return {
    id: String(claims.sub),
    name: String(claims.name || ""),
    picture: String(claims.picture || ""),
  };
}

async function getOrRegisterUser(db: ReturnType<typeof serviceClient>, claims: { id: string; name: string; picture: string }) {
  const { data: existing, error: readError } = await db.from("wms_users")
    .select("line_user_id,name,role,active,line_display_name")
    .eq("line_user_id", claims.id)
    .maybeSingle();
  if (readError) throw new ApiError("DATABASE_ERROR", "อ่านข้อมูลผู้ใช้ไม่สำเร็จ", 500);

  let user = existing;
  if (!user) {
    const now = new Date().toISOString();
    const displayName = claims.name.slice(0, 60) || "ผู้ใช้ใหม่";
    const { error: insertError } = await db.from("wms_users").upsert({
      line_user_id: claims.id,
      name: displayName,
      role: "STAFF",
      active: false,
      created_at: now,
      line_display_name: displayName,
      last_login_at: now,
    }, { onConflict: "line_user_id", ignoreDuplicates: true });
    if (insertError) throw new ApiError("DATABASE_ERROR", "ลงทะเบียนผู้ใช้ไม่สำเร็จ", 500);
    const { data: afterInsert, error: rereadError } = await db.from("wms_users")
      .select("line_user_id,name,role,active,line_display_name")
      .eq("line_user_id", claims.id)
      .single();
    if (rereadError) throw new ApiError("DATABASE_ERROR", "อ่านข้อมูลผู้ใช้หลังลงทะเบียนไม่สำเร็จ", 500);
    user = afterInsert;
    await db.from("wms_audit_log").insert({
      log_id: `USR-${crypto.randomUUID()}`,
      event_at: now,
      user_id: claims.id,
      user_name: displayName,
      action: "USER_SELF_REGISTER",
      target: claims.id,
      details: "ลงทะเบียนจาก LINE และรออนุมัติ",
    });
  } else {
    await db.from("wms_users").update({ last_login_at: new Date().toISOString() })
      .eq("line_user_id", claims.id);
  }

  if (!user.active) {
    throw new ApiError("USER_PENDING", "บัญชีของคุณยังไม่ได้รับอนุมัติ กรุณาแจ้งผู้ดูแลระบบ", 403,
      { userId: claims.id, name: user.name || claims.name });
  }
  const role = String(user.role || "").toUpperCase();
  if (!new Set(["ADMIN", "STAFF", "VIEWER"]).has(role)) {
    throw new ApiError("FORBIDDEN", "บทบาทผู้ใช้ไม่ถูกต้อง กรุณาแจ้งผู้ดูแลระบบ", 403);
  }
  return { id: claims.id, name: user.name || claims.name || "ไม่ระบุชื่อ", role, picture: claims.picture };
}

async function bootstrap(db: ReturnType<typeof serviceClient>, user: { id: string; name: string; role: string; picture: string }) {
  const [{ data: settings, error: settingError }, { data: channels, error: channelError }] = await Promise.all([
    db.from("wms_settings").select("key,value").in("key", PUBLIC_SETTING_KEYS),
    db.from("channels").select("channel_id,channel_name,order_mode,prefix,active,sort_order")
      .eq("active", true).order("sort_order", { ascending: true }),
  ]);
  if (settingError || channelError) throw new ApiError("DATABASE_ERROR", "โหลดค่าตั้งต้นไม่สำเร็จ", 500);

  const settingsMap: Record<string, string> = {};
  for (const row of settings || []) settingsMap[row.key] = row.value || "";
  return {
    app: { name: APP_NAME, version: APP_VERSION },
    user,
    perms: {
      read: true,
      write: user.role === "ADMIN" || user.role === "STAFF",
      admin: user.role === "ADMIN",
    },
    settings: settingsMap,
    channels: (channels || []).map((channel) => ({
      channelId: channel.channel_id,
      name: channel.channel_name,
      mode: channel.order_mode,
      prefix: channel.prefix || "",
      active: channel.active,
      sortOrder: channel.sort_order,
      kind: channel.order_mode === "AUTO" ? "DIRECT" : "PLATFORM",
    })),
    serverTime: new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Asia/Bangkok",
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false,
    }).format(new Date()),
  };
}

type WmsUser = { id: string; name: string; role: string; picture: string };
type Row = Record<string, any>;

async function rows(db: ReturnType<typeof serviceClient>, table: string): Promise<Row[]> {
  const out: Row[] = [];
  for (let start = 0; ; start += 1000) {
    const { data, error } = await db.from(table).select("*").range(start, start + 999);
    if (error) throw new ApiError("DATABASE_ERROR", `อ่านข้อมูล ${table} ไม่สำเร็จ`, 500);
    out.push(...(data || []));
    if (!data || data.length < 1000) return out;
    if (out.length >= 50000) throw new ApiError("RESULT_TOO_LARGE", "ข้อมูลมีจำนวนมากเกินไป กรุณาระบุช่วงวันที่", 413);
  }
}

function n(v: unknown): number { const x = Number(v); return Number.isFinite(x) ? x : 0; }
function text(v: unknown): string { return v == null ? "" : String(v); }
function round(v: number): number { return Math.round((v + Number.EPSILON) * 100) / 100; }
function dayInBangkok(d = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Bangkok", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}
function txView(t: Row) {
  return { id: t.transaction_id, type: t.transaction_type, subType: t.sub_type, ref: t.reference_id,
    channelId: t.channel_id, sku: t.sku, name: t.product_name, qty: n(t.quantity_change),
    status: t.stock_status, balanceAfter: n(t.balance_after), reason: t.reason, note: t.note,
    user: t.user_name, userId: t.user_id, at: t.event_at };
}
function channelView(c: Row) {
  return { channelId: c.channel_id, name: c.channel_name, mode: c.order_mode, prefix: c.prefix || "",
    active: !!c.active, sortOrder: n(c.sort_order), kind: c.order_mode === "AUTO" ? "DIRECT" : "PLATFORM" };
}
function orderView(o: Row, all: Record<string, Row>, channels: Record<string, Row>, products: Record<string, Row>, includeItems: boolean) {
  const c = channels[o.channel_id];
  const v: Row = { internalOrderId: o.internal_order_id, channelId: o.channel_id,
    channelName: c?.channel_name || o.channel_id, orderNo: o.external_order_id, status: o.order_status,
    lineCount: n(o.line_count), totalQty: n(o.total_qty), createdBy: o.created_by_name,
    createdAt: o.created_at, completedAt: o.completed_at, cancelledAt: o.cancelled_at,
    cancelReason: o.cancel_reason, note: o.note };
  if (includeItems) v.items = all.items.filter((it: Row) => it.internal_order_id === o.internal_order_id).map((it: Row) => ({
    orderItemId: it.order_item_id, sku: it.sku, name: it.product_name, unit: products[it.sku]?.unit || "ชิ้น",
    qty: n(it.quantity), returnedQty: n(it.returned_qty), returnableQty: n(it.quantity) - n(it.returned_qty),
  }));
  return v;
}
function recordView(r: Row, orders: Record<string, Row>, channels: Record<string, Row>) {
  if (!r) return null;
  const c = channels[r.channel_id]; const o = orders[r.internal_order_id];
  return { internalOrderId: r.internal_order_id, channelId: r.channel_id, channelName: c?.channel_name || r.channel_id,
    orderNo: r.external_order_id, orderStatus: o?.order_status || "", salePrice: round(n(r.sale_price)),
    receivedAmount: round(n(r.received_amount)), feeAmount: round(n(r.fee_amount)), costAmount: round(n(r.cost_amount)),
    profit: round(n(r.profit)), marginPct: round(n(r.margin_pct)), receivedDate: r.received_date,
    costDetail: r.cost_detail, note: r.note, updatedBy: r.updated_by, updatedAt: r.updated_at };
}

async function readAction(db: ReturnType<typeof serviceClient>, action: string, p: Row, user: WmsUser): Promise<unknown> {
  const allowed = new Set(["product.get", "product.search", "product.history", "order.check", "order.get", "history.search",
    "dashboard", "users.options", "request.status", "reconcile", "admin.users", "admin.settings", "admin.channels", "finance.summary",
    "finance.pending", "finance.order", "finance.records", "finance.costs", "finance.legacy.monthly", "product.prices", "pos.bill", "pos.bills"]);
  if (!allowed.has(action)) throw new ApiError("ACTION_NOT_MIGRATED", "คำสั่งนี้ยังไม่ได้ย้ายจาก Apps Script", 501);
  const adminActions = new Set(["admin.users", "admin.settings", "admin.channels", "finance.summary", "finance.pending",
    "finance.order", "finance.records", "finance.costs", "finance.legacy.monthly"]);
  if (adminActions.has(action) && user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์ใช้งานคำสั่งนี้", 403);

  const need = async (...names: string[]) => Object.fromEntries(await Promise.all(names.map(async (name) => [name, await rows(db, name)])));
  const keyBy = (arr: Row[], key: string) => Object.fromEntries(arr.map((r) => [r[key], r]));
  const today = dayInBangkok();
  if (action === "request.status") {
    const requestId = text(p.requestId).trim();
    if (!requestId) throw new ApiError("INVALID_REQUEST", "ไม่พบรหัสคำขอ");
    const { data, error } = await db.from("request_log").select("request_id,action,user_id,status,operation_id,result_json,created_at")
      .eq("request_id", requestId).maybeSingle();
    if (error) throw new ApiError("DATABASE_ERROR", "ตรวจสอบสถานะรายการไม่สำเร็จ", 500);
    if (!data) return { status: "NONE" };
    if (data.user_id !== user.id) throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์ตรวจสอบรายการนี้", 403);
    return { status: data.status || "PENDING", action: data.action, operationId: data.operation_id,
      data: data.result_json || {}, createdAt: data.created_at };
  }
  if (action === "product.get" || action === "product.search") {
    const all = await need("products", "stock_balance", "prices");
    const bal = keyBy(all.stock_balance, "sku"), price = keyBy(all.prices, "sku");
    const view = (x: Row) => ({ sku: x.sku, name: x.product_name, category: x.category, unit: x.unit || "ชิ้น",
      minStock: n(x.min_stock), active: !!x.active,
      balance: { available: n(bal[x.sku]?.available_qty), inspection: n(bal[x.sku]?.inspection_qty),
        total: n(bal[x.sku]?.total_qty), updatedAt: bal[x.sku]?.updated_at || "" },
      price: price[x.sku] ? n(price[x.sku].sale_price) : null });
    if (action === "product.get") {
      const sku = text(p.sku).trim().toUpperCase(); const item = all.products.find((x: Row) => x.sku === sku);
      return item ? { found: true, product: view(item) } : { found: false, sku };
    }
    const q = text(p.q).trim().toLowerCase();
    const items = all.products.filter((x: Row) => (p.includeInactive || x.active) && (!q ||
      [x.sku, x.product_name, x.category].some((v) => text(v).toLowerCase().includes(q)))).slice(0, 30).map(view);
    return { items, total: all.products.length };
  }
  if (action === "product.history") {
    const sku = text(p.sku).trim().toUpperCase(); const limit = Math.min(Math.max(n(p.limit) || 30, 1), 200);
    const { data, error } = await db.from("wms_transactions").select("*").eq("sku", sku).order("event_at", { ascending: false }).limit(limit);
    if (error) throw new ApiError("DATABASE_ERROR", "โหลดประวัติสินค้าไม่สำเร็จ", 500);
    return { sku, items: (data || []).map(txView) };
  }
  if (action === "order.check" || action === "order.get") {
    const all = await need("orders", "order_items", "products", "channels");
    const channels = keyBy(all.channels, "channel_id"), products = keyBy(all.products, "sku");
    const ch = channels[text(p.channelId).toUpperCase()];
    if (action === "order.check" && ch?.order_mode === "AUTO") return { exists: false, auto: true };
    const no = text(p.orderNo).trim().replace(/\s+/g, "").toUpperCase();
    let o = no.startsWith("ORD-") ? all.orders.find((x: Row) => x.internal_order_id === no) : null;
    o ||= all.orders.slice().reverse().find((x: Row) => (action === "order.get" || x.order_status !== "CANCELLED") &&
      x.channel_id === text(p.channelId).toUpperCase() && (x.external_order_id === no || x.order_key === `${text(p.channelId).toUpperCase()}|${no}`));
    if (action === "order.check") return o ? { exists: true, orderNo: no,
      message: `ออเดอร์ ${no} ถูกบันทึกและตัดสต๊อกไปแล้ว เมื่อ ${o.completed_at} โดย ${o.created_by_name}`,
      order: orderView(o, all, channels, products, true) } : { exists: false, orderNo: no };
    if (!o) throw new ApiError("ORDER_NOT_FOUND", `ไม่พบออเดอร์ ${no} ในช่องทางที่เลือก`);
    return { order: orderView(o, all, channels, products, true) };
  }
  if (action === "history.search") {
    const from = text(p.dateFrom) || dayInBangkok(new Date(Date.now() - 6 * 86400000)); const to = text(p.dateTo) || today;
    let q = db.from("wms_transactions").select("*", { count: "exact" }).gte("event_at", `${from}T00:00:00+07:00`).lte("event_at", `${to}T23:59:59.999+07:00`).order("event_at", { ascending: false });
    if (p.sku) q = q.eq("sku", text(p.sku).toUpperCase());
    if (p.channelId) q = q.eq("channel_id", text(p.channelId).toUpperCase());
    if (p.type) q = q.eq("transaction_type", text(p.type));
    if (p.userId) q = q.eq("user_id", text(p.userId));
    const limit = Math.min(Math.max(n(p.limit) || 200, 1), 500);
    const { data, count, error } = await q.limit(limit);
    if (error) throw new ApiError("DATABASE_ERROR", "ค้นหาประวัติไม่สำเร็จ", 500);
    const txs = data || []; const sumIn = txs.filter((t: Row) => n(t.quantity_change) > 0).reduce((s: number, t: Row) => s + n(t.quantity_change), 0);
    const sumOut = txs.filter((t: Row) => n(t.quantity_change) < 0).reduce((s: number, t: Row) => s - n(t.quantity_change), 0);
    return { items: txs.map(txView), matched: count || txs.length, truncated: (count || 0) > txs.length, sumIn, sumOut, dateFrom: from, dateTo: to };
  }
  if (action === "dashboard") {
    const from = text(p.dateFrom) || dayInBangkok(new Date(Date.now() - 6 * 86400000)); const to = text(p.dateTo) || today;
    const all = await need("products", "stock_balance", "channels");
    const [{ data: tx, error: te }, { data: orders, error: oe }] = await Promise.all([
      db.from("wms_transactions").select("*").gte("event_at", `${from}T00:00:00+07:00`).lte("event_at", `${to}T23:59:59.999+07:00`).order("event_at", { ascending: false }).limit(5000),
      db.from("orders").select("*").gte("created_at", `${from}T00:00:00+07:00`).lte("created_at", `${to}T23:59:59.999+07:00`).order("created_at", { ascending: false }).limit(5000),
    ]);
    if (te || oe) throw new ApiError("DATABASE_ERROR", "โหลดข้อมูลแดชบอร์ดไม่สำเร็จ", 500);
    const balances = keyBy(all.stock_balance || await rows(db, "stock_balance"), "sku");
    const products = all.products.filter((x: Row) => x.active); const totals = { skuCount: products.length, available: 0, inspection: 0, total: 0 };
    const low: Row[] = [];
    for (const x of products) { const b = balances[x.sku] || {}; const a = n(b.available_qty), i = n(b.inspection_qty); totals.available += a; totals.inspection += i; totals.total += a+i;
      if (n(x.min_stock) > 0 && a <= n(x.min_stock)) low.push({ sku:x.sku, name:x.product_name, unit:x.unit||"ชิ้น", available:a, minStock:n(x.min_stock) }); }
    low.sort((a,b) => (a.available-a.minStock)-(b.available-b.minStock));
    const todayStats: Row = { ordersToday:0,soldToday:0,inToday:0,returnToday:0,writeOffToday:0,cancelToday:0,adjustToday:0 };
    const by = keyBy(all.channels.map((c: Row) => ({ channelId:c.channel_id,name:c.channel_name,ordersToday:0,qtyToday:0,orders7d:0,qty7d:0 })), "channelId");
    for (const t of tx || []) { const d = text(t.event_at).slice(0,10); if (d === today) { const q=n(t.quantity_change); if(t.transaction_type==="OUT")todayStats.soldToday-=q; else if(t.transaction_type==="IN")todayStats.inToday+=q; else if(t.transaction_type==="RETURN")todayStats.returnToday+=q; else if(t.transaction_type==="WRITE_OFF")todayStats.writeOffToday-=q; else if(t.transaction_type==="CANCEL")todayStats.cancelToday+=q; else if(t.transaction_type==="ADJUST")todayStats.adjustToday+=q; } }
    for (const o of orders || []) { if(o.order_status==="CANCELLED")continue; const c=by[o.channel_id] ||= {channelId:o.channel_id,name:o.channel_id,ordersToday:0,qtyToday:0,orders7d:0,qty7d:0}; c.orders7d++; c.qty7d+=n(o.total_qty); if(text(o.created_at).slice(0,10)===today){c.ordersToday++;c.qtyToday+=n(o.total_qty);todayStats.ordersToday++;} }
    return { today, dateFrom:from, dateTo:to, totals, todayStats, lowStock:low.slice(0,50), lowStockCount:low.length,
      byChannel:Object.values(by), recent:(tx||[]).slice(0,15).map(txView) };
  }
  if (action === "users.options" || action === "admin.users") {
    const { data, error } = await db.from("wms_users").select("line_user_id,name,role,active,created_at,line_display_name").order("name");
    if (error) throw new ApiError("DATABASE_ERROR", "โหลดรายชื่อผู้ใช้ไม่สำเร็จ", 500);
    const users = (data || []).map((u: Row) => action === "users.options" ? { id:u.line_user_id,name:u.name } : { userId:u.line_user_id,name:u.name,role:u.role,active:!!u.active,createdAt:u.created_at,lineName:u.line_display_name });
    return action === "users.options" ? { users } : { users };
  }
  if (action === "admin.settings") {
    const { data, error } = await db.from("wms_settings").select("key,value,description").order("key");
    if (error) throw new ApiError("DATABASE_ERROR", "โหลดการตั้งค่าไม่สำเร็จ", 500);
    const editable = new Set(["COMPANY_NAME","SCAN_MODE","ORDER_RUNNING_DIGITS","DEFAULT_MIN_STOCK","STOCK_IN_TYPES","WRITE_OFF_REASONS","SUPPLIER_RETURN_REASONS","ADJUST_REASONS","CANCEL_REASONS","BACKUP_KEEP_DAYS","PAPER_SIZE","SHOP_NAME","SHOP_ADDRESS","SHOP_PHONE","SHOP_TAX_ID","BILL_FOOTER"]);
    return { settings: (data||[]).map((s: Row)=>({key:s.key,value:s.value,description:s.description||"",editable:editable.has(s.key)})) };
  }
  if (action === "admin.channels") {
    const { data, error } = await db.from("channels").select("*").order("sort_order");
    if (error) throw new ApiError("DATABASE_ERROR", "โหลดช่องทางขายไม่สำเร็จ", 500);
    return { channels:(data||[]).map(channelView) };
  }
  if (action === "reconcile") {
    const all = await need("wms_transactions", "stock_balance"); const sums: Record<string,{a:number;i:number}> = {};
    for (const t of all.wms_transactions) { const s=sums[t.sku] ||= {a:0,i:0}; if(t.stock_status==="INSPECTION")s.i+=n(t.quantity_change); else s.a+=n(t.quantity_change); }
    const mismatches: Row[]=[];
    for (const b of all.stock_balance) { const s=sums[b.sku]||{a:0,i:0}; if(n(b.available_qty)!==s.a||n(b.inspection_qty)!==s.i||n(b.total_qty)!==s.a+s.i)mismatches.push({sku:b.sku,balance:{available:n(b.available_qty),inspection:n(b.inspection_qty),total:n(b.total_qty)},transactions:{available:s.a,inspection:s.i,total:s.a+s.i}}); delete sums[b.sku]; }
    for(const [sku,s] of Object.entries(sums)) if(s.a||s.i)mismatches.push({sku,balance:{available:0,inspection:0,total:0},transactions:{available:s.a,inspection:s.i,total:s.a+s.i}});
    return { ok:mismatches.length===0, checked:all.stock_balance.length, mismatchCount:mismatches.length, mismatches:mismatches.slice(0,100) };
  }
  if (action === "product.prices" || action === "finance.costs") {
    const all = await need("products", action === "product.prices" ? "prices" : "fin_costs"); const table=action === "product.prices" ? "prices" : "fin_costs"; const map=keyBy(all[table],"sku");
    const q=text(p.q).toLowerCase(), onlyMissing=!!p.onlyMissing; let total=0, missing=0;
    const items=all.products.filter((pr: Row)=>{if(!pr.active)return false;const r=map[pr.sku];if(!r)missing++;if(onlyMissing&&r)return false;return !q||text(pr.sku).toLowerCase().includes(q)||text(pr.product_name).toLowerCase().includes(q);}).map((pr: Row)=>{const r=map[pr.sku];total++;return action==="product.prices"?{sku:pr.sku,name:pr.product_name,unit:pr.unit||"ชิ้น",category:pr.category,salePrice:r?round(n(r.sale_price)):null,updatedAt:r?.updated_at||"",updatedBy:r?.updated_by||"",note:r?.note||""}:{sku:pr.sku,name:pr.product_name,unit:pr.unit||"ชิ้น",category:pr.category,unitCost:r?round(n(r.unit_cost)):null,updatedAt:r?.updated_at||"",updatedBy:r?.updated_by||"",note:r?.note||""};}).slice(0,300);
    return action==="product.prices"?{items,total,missing}:{items,total,truncated:total>items.length};
  }
  if (action === "finance.summary") {
    const all=await need("fin_orders","fin_costs","orders","products","channels");
    const fin=keyBy(all.fin_orders,"internal_order_id"), costs=keyBy(all.fin_costs,"sku"), orders=keyBy(all.orders,"internal_order_id"), channels=keyBy(all.channels,"channel_id");
    const pending=all.orders.filter((o:Row)=>!new Set(["CANCELLED","RETURNED_FULL"]).has(o.order_status)&&!fin[o.internal_order_id]).length;
    const active=all.products.filter((x:Row)=>x.active); const loss=all.fin_orders.filter((r:Row)=>n(r.profit)<0).length;
    const recent=all.fin_orders.slice().sort((a:Row,b:Row)=>text(b.updated_at).localeCompare(text(a.updated_at))).slice(0,10).map((r:Row)=>recordView(r,orders,channels));
    return {pendingCount:pending,missingCostCount:active.filter((x:Row)=>!costs[x.sku]).length,activeProductCount:active.length,
      recordedCount:all.fin_orders.length,lossCount:loss,recent};
  }
  if (action === "finance.pending") {
    const all=await need("orders","fin_orders","channels"); const fin=keyBy(all.fin_orders,"internal_order_id"), channels=keyBy(all.channels,"channel_id");
    const q=text(p.q).toUpperCase().replace(/\s+/g, ""), channel=text(p.channelId).toUpperCase(), limit=Math.min(Math.max(n(p.limit)||100,1),300);
    const pending=all.orders.slice().reverse().filter((o:Row)=>!new Set(["CANCELLED","RETURNED_FULL"]).has(o.order_status)&&!fin[o.internal_order_id]&&(!channel||o.channel_id===channel)&&(!q||text(o.external_order_id).includes(q)||o.internal_order_id===q));
    const items=pending.slice(0,limit).map((o:Row)=>({internalOrderId:o.internal_order_id,channelId:o.channel_id,channelName:channels[o.channel_id]?.channel_name||o.channel_id,
      orderNo:o.external_order_id,status:o.order_status,totalQty:n(o.total_qty),createdAt:o.created_at,days:Math.max(0,Math.round((Date.now()-new Date(text(o.created_at)).getTime())/86400000))}));
    return {items,total:pending.length,truncated:pending.length>items.length};
  }
  if (action === "finance.records") {
    const all=await need("fin_orders","orders","channels"); const orders=keyBy(all.orders,"internal_order_id"), channels=keyBy(all.channels,"channel_id");
    const q=text(p.q).toUpperCase().replace(/\s+/g,""), channel=text(p.channelId).toUpperCase(), from=text(p.dateFrom), to=text(p.dateTo), limit=Math.min(Math.max(n(p.limit)||200,1),500);
    const matched=all.fin_orders.slice().sort((a:Row,b:Row)=>text(b.received_date).localeCompare(text(a.received_date))||text(b.updated_at).localeCompare(text(a.updated_at))).filter((r:Row)=>
      (!channel||r.channel_id===channel)&&(!q||text(r.external_order_id).includes(q)||r.internal_order_id===q)&&(!from||text(r.received_date)>=from)&&(!to||text(r.received_date)<=to)&&(!p.onlyLoss||n(r.profit)<0));
    const items=matched.slice(0,limit).map((r:Row)=>recordView(r,orders,channels)); return {items,total:matched.length,truncated:matched.length>items.length};
  }
  if (action === "finance.legacy.monthly") {
    const year = text(p.year).trim();
    if (!/^\d{4}$/.test(year) || Number(year) < 2000 || Number(year) > 2100) throw new ApiError("INVALID_DATE", "ปีรายงานไม่ถูกต้อง");
    const from = `${year}-01-01`, to = `${Number(year) + 1}-01-01`;
    const { data, error } = await db.from("legacy_monthly_financial_totals").select("month_start,summary_kind,category,amount,entry_count,source_name")
      .gte("month_start", from).lt("month_start", to).order("month_start").order("summary_kind").order("category");
    if (error) throw new ApiError("DATABASE_ERROR", "โหลดสรุปยอดย้อนหลังไม่สำเร็จ", 500);
    return { items: (data || []).map((r: Row) => ({ month: text(r.month_start).slice(0, 7), kind: r.summary_kind,
      category: r.category, amount: round(n(r.amount)), count: n(r.entry_count), source: r.source_name })) };
  }
  if (action === "finance.order") {
    const all=await need("orders","order_items","products","channels","fin_orders","fin_costs","sales_bills");
    const channels=keyBy(all.channels,"channel_id"), products=keyBy(all.products,"sku"), orders=keyBy(all.orders,"internal_order_id");
    let o=all.orders.find((x:Row)=>x.internal_order_id===text(p.internalOrderId).toUpperCase());
    if(!o){const no=text(p.orderNo).trim().replace(/\s+/g,"").toUpperCase();o=all.orders.slice().reverse().find((x:Row)=>x.channel_id===text(p.channelId).toUpperCase()&&x.external_order_id===no);}
    if(!o)throw new ApiError("ORDER_NOT_FOUND",`ไม่พบออเดอร์ ${text(p.orderNo||p.internalOrderId)} ในระบบ`);
    const lines:Row[]=[], missing:string[]=[];let cost=0;
    for(const it of all.order_items.filter((x:Row)=>x.internal_order_id===o.internal_order_id)){const qty=n(it.quantity)-n(it.returned_qty),c=all.fin_costs.find((x:Row)=>x.sku===it.sku);const unit=c?n(c.unit_cost):null;
      lines.push({sku:it.sku,name:it.product_name,unit:products[it.sku]?.unit||"ชิ้น",qtySold:n(it.quantity),qtyReturned:n(it.returned_qty),qty,unitCost:unit,lineCost:unit==null?null:round(unit*qty)});if(unit==null&&qty>0)missing.push(it.sku);if(unit!=null)cost+=unit*qty;}
    const bill=all.sales_bills.find((b:Row)=>b.internal_order_id===o.internal_order_id);const rec=all.fin_orders.find((r:Row)=>r.internal_order_id===o.internal_order_id);
    return {order:orderView(o,all,channels,products,false),lines,missingCost:missing,costAmount:round(cost),record:recordView(rec,orders,channels),bill:bill?{billNo:bill.bill_no,total:round(n(bill.total)),paymentMethod:bill.payment_method,billDate:bill.bill_date}:null};
  }
  if (action === "pos.bill" || action === "pos.bills") {
    const all=await need("sales_bills","sales_bill_items","orders","channels","fin_orders");
    const orders=keyBy(all.orders,"internal_order_id"),channels=keyBy(all.channels,"channel_id"),fin=keyBy(all.fin_orders,"internal_order_id");
    const view=(b:Row)=>{let header:Row={};try{header=typeof b.header_json==="string"?JSON.parse(b.header_json||"{}"):b.header_json||{};}catch{header={};}
      const items=all.sales_bill_items.filter((i:Row)=>i.internal_order_id===b.internal_order_id).map((i:Row)=>({sku:i.sku,name:i.product_name,unit:i.unit||"ชิ้น",qty:n(i.qty),listPrice:n(i.list_price)||null,unitPrice:round(n(i.unit_price),),lineDiscount:round(n(i.line_discount)),lineTotal:round(n(i.line_total))}));
      return {internalOrderId:b.internal_order_id,billNo:b.bill_no,channelId:b.channel_id,channelName:channels[b.channel_id]?.channel_name||b.channel_id,billDate:b.bill_date,createdAt:b.created_at,
        customerName:b.customer_name,customerPhone:b.customer_phone,seller:b.seller_name,itemCount:n(b.item_count),totalQty:n(b.total_qty),subtotal:round(n(b.subtotal)),lineDiscount:round(n(b.line_discount)),billDiscount:round(n(b.bill_discount)),total:round(n(b.total)),
        paymentMethod:b.payment_method,paymentLabel:b.payment_method==="CASH"?"เงินสด":"โอน",cashReceived:round(n(b.cash_received)),change:round(n(b.change_amount)),priceEdited:!!b.price_edited,note:b.note,status:orders[b.internal_order_id]?.order_status||"",header,items};};
    if(action==="pos.bill") {let b=all.sales_bills.find((x:Row)=>x.internal_order_id===text(p.internalOrderId).toUpperCase());if(!b&&p.billNo)b=all.sales_bills.slice().reverse().find((x:Row)=>x.bill_no===text(p.billNo).toUpperCase().replace(/\s+/g,""));if(!b)throw new ApiError("BILL_NOT_FOUND",`ไม่พบบิล ${text(p.billNo||p.internalOrderId)}`);return {bill:view(b)};}
    const date=text(p.date)||today,q=text(p.q).toUpperCase().replace(/\s+/g,""),channel=text(p.channelId).toUpperCase();const selected=all.sales_bills.slice().reverse().filter((b:Row)=>!channel||b.channel_id===channel);
    const sum:Row={billCount:0,cancelledCount:0,cash:0,transfer:0,total:0,discount:0,qty:0,profit:0,profitCount:0,noProfitCount:0}; const items:Row[]=[];
    for(const b of selected){const status=orders[b.internal_order_id]?.order_status||"",total=n(b.total);if(b.bill_date===date){if(status==="CANCELLED")sum.cancelledCount++;else{sum.billCount++;sum.total+=total;sum.qty+=n(b.total_qty);sum.discount+=n(b.bill_discount)+n(b.line_discount);if(b.payment_method==="CASH")sum.cash+=total;else sum.transfer+=total;if(user.role==="ADMIN"){if(fin[b.internal_order_id]){sum.profit+=n(fin[b.internal_order_id].profit);sum.profitCount++;}else sum.noProfitCount++;}}}
      if((q?text(b.bill_no).toUpperCase().includes(q)||text(b.customer_name).toUpperCase().includes(q):b.bill_date===date)&&items.length<300)items.push({internalOrderId:b.internal_order_id,billNo:b.bill_no,channelId:b.channel_id,channelName:channels[b.channel_id]?.channel_name||b.channel_id,createdAt:b.created_at,billDate:b.bill_date,total:round(total),paymentMethod:b.payment_method,paymentLabel:b.payment_method==="CASH"?"เงินสด":"โอน",customerName:b.customer_name,seller:b.seller_name,totalQty:n(b.total_qty),status,priceEdited:!!b.price_edited});}
    for(const k of ["cash","transfer","total","discount","profit"])sum[k]=round(sum[k]);if(user.role!=="ADMIN"){delete sum.profit;delete sum.profitCount;delete sum.noProfitCount;}
    return {date,q,summary:sum,items,showProfit:user.role==="ADMIN"};
  }
  throw new ApiError("ACTION_NOT_MIGRATED", "คำสั่งนี้ยังไม่ได้ย้ายจาก Apps Script", 501);
}

function writeText(value: unknown, max: number, label: string, required = false): string {
  const valueText = text(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "").trim();
  if (required && !valueText) throw new ApiError("INVALID_TEXT", `กรุณาระบุ${label}`);
  if (valueText.length > max) throw new ApiError("INVALID_TEXT", `${label}ยาวเกิน ${max} ตัวอักษร`);
  return valueText;
}
function writeSku(value: unknown): string {
  const sku = text(value).trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._-]{0,39}$/.test(sku)) throw new ApiError("INVALID_SKU", "รหัส SKU ไม่ถูกต้อง");
  return sku;
}
function writeMoney(value: unknown, label: string): number {
  const raw = text(value).replace(/[ ,฿]/g, "");
  if (!/^\d+(\.\d+)?$/.test(raw)) throw new ApiError("INVALID_MONEY", `${label}ต้องเป็นตัวเลข 0 ขึ้นไป`);
  const amount = Number(raw);
  if (!Number.isFinite(amount) || amount > 100000000 || Math.abs(Math.round(amount * 100) - amount * 100) > 1e-6) {
    throw new ApiError("INVALID_MONEY", `${label}ใส่ทศนิยมได้ไม่เกิน 2 ตำแหน่ง`);
  }
  return round(amount);
}
function writeNonNegInt(value: unknown, label: string): number {
  const raw = text(value).trim(); const valueNumber = Number(raw);
  if (!raw || !Number.isInteger(valueNumber) || valueNumber < 0 || valueNumber > 10000000) {
    throw new ApiError("INVALID_QTY", `${label}ต้องเป็นจำนวนเต็ม 0 ขึ้นไป`);
  }
  return valueNumber;
}
function bangkokTimestamp(): string {
  return new Date().toISOString();
}
function requireWrite(user: WmsUser, admin = false) {
  if (admin && user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์ใช้งานคำสั่งนี้", 403);
  if (!admin && !new Set(["ADMIN", "STAFF"]).has(user.role)) throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์บันทึกรายการ", 403);
}
async function fullUpsertRow(db: ReturnType<typeof serviceClient>, table: string, key: string, value: string, fields: Row, defaults: Row = {}): Promise<Row> {
  const { data, error } = await db.from(table).select("*").eq(key, value).maybeSingle();
  if (error) throw new ApiError("DATABASE_ERROR", "อ่านข้อมูลก่อนบันทึกไม่สำเร็จ", 500);
  return { ...defaults, ...(data || {}), ...fields, [key]: value };
}
async function commitWritePlan(db: ReturnType<typeof serviceClient>, requestId: string, action: string, user: WmsUser,
  counterKeys: string[], appends: Row[], upserts: Row[], moves: Row[], result: Row, eventAt = bangkokTimestamp(), existingReservation: Row | null = null) {
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw new ApiError("INVALID_REQUEST", "คำขอไม่ถูกต้อง (ไม่มีรหัสคำขอ) กรุณาเปิดหน้าจอใหม่");
  let reservation = existingReservation;
  if (!reservation) {
    const { data, error: reserveError } = await db.rpc("wms_reserve_write", {
      p_request_id: requestId, p_action: action, p_user_id: user.id, p_counter_keys: counterKeys,
    });
    if (reserveError) throw new ApiError(reserveError.message || "DATABASE_ERROR", "จองเลขรายการไม่สำเร็จ", 500);
    reservation = data;
  }
  if (reservation?.replay) return { data: reservation.data || {}, replay: true };
  const operationId = text(reservation?.operationId);
  if (!operationId) throw new ApiError("DATABASE_ERROR", "ระบบไม่สามารถจองเลขปฏิบัติการได้", 500);
  const fullResult = { ...result, operationId };
  const finalizedAppends = appends.map((group) => group.table === "wms_audit_log"
    ? { ...group, rows: group.rows.map((row: Row, index: number) => ({ ...row,
      log_id: `${operationId}-A${index + 1}`, operation_id: operationId })) }
    : group);
  const finalizedUpserts = upserts.map((item) => item.table === "stock_balance"
    ? { ...item, row: { ...item.row, updated_at: item.row.updated_at || eventAt,
      last_operation_id: item.row.last_operation_id || operationId } }
    : item.table === "fin_orders" ? { ...item, row: { ...item.row, operation_id: operationId } } : item);
  const { data, error } = await db.rpc("wms_commit_write_plan", {
    p_request_id: requestId, p_action: action, p_user_id: user.id, p_operation_id: operationId,
    p_event_at: eventAt, p_appends: finalizedAppends, p_upserts: finalizedUpserts, p_moves: moves, p_result: fullResult,
  });
  if (error) throw new ApiError(error.message || "DATABASE_ERROR", "บันทึกรายการไม่สำเร็จ", 500, error.details || null);
  return { data: data?.data || fullResult, replay: !!data?.replay };
}
function auditGroup(operationId: string, eventAt: string, user: WmsUser, rowsIn: Row[]): Row | null {
  if (!rowsIn.length) return null;
  return { table: "wms_audit_log", rows: rowsIn.map((r, i) => ({
    log_id: `${operationId}-A${i + 1}`, event_at: eventAt, user_id: user.id, user_name: user.name,
    action: r.action, target: r.target, details: typeof r.details === "string" ? r.details : JSON.stringify(r.details || {}), operation_id: operationId,
  })) };
}

async function writeAction(db: ReturnType<typeof serviceClient>, action: string, p: Row, user: WmsUser, requestId: string): Promise<unknown> {
  const eventAt = bangkokTimestamp();
  const date = dayInBangkok(); const stamp = date.replace(/-/g, "");
  const pad = (value: unknown, size: number) => String(value).padStart(size, "0");
  const appendGroups: Row[] = []; const upserts: Row[] = []; const audits: Row[] = []; const moves: Row[] = [];
  let counterKeys: string[] = [];
  let result: Row = {};
  if (!/^[A-Za-z0-9_-]{8,64}$/.test(requestId)) throw new ApiError("INVALID_REQUEST", "คำขอไม่ถูกต้อง (ไม่มีรหัสคำขอ) กรุณาเปิดหน้าจอใหม่");
  const docPrefixes: Record<string,string> = { "stock.in":"IN", "return.supplier":"SR", writeoff:"WO", transfer:"TF", adjust:"ADJ", "return.customer":"RT" };
  if (docPrefixes[action]) counterKeys.push(`${docPrefixes[action]}-${stamp}`);
  if (action === "order.create" || action === "pos.sale") {
    counterKeys.push(`ORD-${stamp}`);
    const channelId = writeText(p.channelId, 30, "ช่องทางขาย", true).toUpperCase();
    const { data: channel, error: channelError } = await db.from("channels").select("channel_id,order_mode,prefix,active").eq("channel_id",channelId).maybeSingle();
    if (channelError) throw new ApiError("DATABASE_ERROR", "อ่านช่องทางขายไม่สำเร็จ", 500);
    if (channel?.order_mode === "AUTO") {
      const dstr = stamp;
      counterKeys.push(`ORDNO-${text(channel.prefix || channel.channel_id).toUpperCase()}-${dstr}`);
    }
  }
  const { data: reservation, error: reservationError } = await db.rpc("wms_reserve_write", {
    p_request_id: requestId, p_action: action, p_user_id: user.id, p_counter_keys: counterKeys,
  });
  if (reservationError) throw new ApiError(reservationError.message || "DATABASE_ERROR", "จองเลขรายการไม่สำเร็จ", 500);
  if (reservation?.replay) return { data: reservation.data || {}, replay: true };
  const counter = (key: string) => n(reservation?.counters?.[key]);
  const docNo = (prefix: string, digits = 4) => `${prefix}-${stamp}-${pad(counter(`${prefix}-${stamp}`),digits)}`;
  const autoNo = async (channel: Row) => {
    const prefix = text(channel.prefix || channel.channel_id).toUpperCase();
    const dstr = stamp;
    const setting = await db.from("wms_settings").select("value").eq("key","ORDER_RUNNING_DIGITS").maybeSingle();
    const digits = Math.min(Math.max(n(setting.data?.value) || 4, 3), 8);
    return `${prefix}-${dstr}-${pad(counter(`ORDNO-${prefix}-${dstr}`),digits)}`;
  };
  const loadProducts = async (lines: Row[], allowInactive = false) => {
    if (!Array.isArray(lines) || !lines.length) throw new ApiError("EMPTY_LINES", "กรุณาระบุสินค้าอย่างน้อย 1 รายการ");
    if (lines.length > 50) throw new ApiError("TOO_MANY_LINES", "รายการมากเกินไป");
    const checked = lines.map((line: Row, i: number) => ({ sku:writeSku(line?.sku), qty:writeNonNegInt(line?.qty,`จำนวนบรรทัดที่ ${i+1}`) }));
    if (checked.some((line) => line.qty < 1)) throw new ApiError("INVALID_QTY", "จำนวนสินค้าต้องมากกว่า 0");
    const skus = [...new Set(checked.map((line) => line.sku))];
    const [{data:products,error:productError},{data:balances,error:balanceError}] = await Promise.all([
      db.from("products").select("*").in("sku",skus), db.from("stock_balance").select("*").in("sku",skus),
    ]);
    if (productError || balanceError) throw new ApiError("DATABASE_ERROR", "อ่านสินค้าและยอดคงเหลือไม่สำเร็จ",500);
    const productBy = Object.fromEntries((products||[]).map((row:Row)=>[row.sku,row]));
    const balanceBy = Object.fromEntries((balances||[]).map((row:Row)=>[row.sku,row]));
    for (const sku of skus) if (!productBy[sku] || (!allowInactive && !productBy[sku].active)) throw new ApiError("SKU_NOT_FOUND", `ไม่พบสินค้าที่ใช้งานได้ ${sku}`);
    return { checked, productBy, balanceBy };
  };
  const admin = action.startsWith("admin.") || action === "finance.cost.save" || action === "finance.payment.save" || action === "product.price.save";
  requireWrite(user, admin);

  if (action === "product.save") {
    const sku = writeSku(p.sku), isNew = !!p.isNew;
    const { data: existing, error } = await db.from("products").select("*").eq("sku", sku).maybeSingle();
    if (error) throw new ApiError("DATABASE_ERROR", "อ่านข้อมูลสินค้าไม่สำเร็จ", 500);
    if (isNew && existing) throw new ApiError("DUPLICATE_SKU", `SKU ${sku} มีอยู่ในระบบแล้ว`);
    if (!isNew && !existing) throw new ApiError("SKU_NOT_FOUND", `ไม่พบสินค้า ${sku}`);
    const name = writeText(p.name, 120, "ชื่อสินค้า", true), category = writeText(p.category, 60, "หมวดหมู่");
    const unit = writeText(p.unit, 20, "หน่วย") || "ชิ้น";
    const defaultStock = await db.from("wms_settings").select("value").eq("key", "DEFAULT_MIN_STOCK").maybeSingle();
    const minStock = p.minStock == null || p.minStock === "" ? (Number(defaultStock.data?.value) || 0) : writeNonNegInt(p.minStock, "จุดแจ้งเตือน");
    const active = p.active == null ? true : !!p.active;
    if (!active && existing) {
      const { data: balance } = await db.from("stock_balance").select("total_qty").eq("sku", sku).maybeSingle();
      if (n(balance?.total_qty) > 0) throw new ApiError("HAS_STOCK", `ปิดใช้งานไม่ได้ เพราะยังมีสต๊อกคงเหลือ ${n(balance?.total_qty)} ${unit}`);
    }
    const fields = { product_name:name, category:category || null, unit, min_stock:minStock, active, updated_at:eventAt,
      ...(isNew ? { created_at:eventAt, created_by:user.name } : {}) };
    upserts.push({ table:"products", keyColumn:"sku", row:await fullUpsertRow(db,"products","sku",sku,fields,{created_at:eventAt,created_by:user.name}) });
    let price: number | null = null;
    if (p.salePrice !== undefined && p.salePrice !== null && text(p.salePrice).trim() !== "") {
      price = writeMoney(p.salePrice, "ราคาขายหลัก");
      const { data: currentPrice } = await db.from("prices").select("*").eq("sku", sku).maybeSingle();
      if (n(currentPrice?.sale_price) !== price) {
        if (user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "เฉพาะผู้ดูแลระบบ (ADMIN) ที่ตั้งหรือแก้ราคาขายหลักได้", 403);
        upserts.push({ table:"prices", keyColumn:"sku", row:{ ...(currentPrice || {}), sku, sale_price:price, updated_at:eventAt, updated_by:user.name, note:currentPrice?.note || "" } });
        audits.push({ action:"PRICE_UPDATE", target:sku, details:{ before:currentPrice?.sale_price ?? null, after:price, note:"" } });
      }
    }
    if (isNew) {
      upserts.push({ table:"stock_balance", keyColumn:"sku", row:{ sku, available_qty:0, inspection_qty:0, total_qty:0, updated_at:eventAt, last_operation_id:"" } });
    }
    audits.push({ action:isNew ? "PRODUCT_CREATE" : "PRODUCT_UPDATE", target:sku,
      details:{ before:existing, after:fields } });
    result = { message:isNew ? `สร้างสินค้า ${sku} เรียบร้อย` : `บันทึกข้อมูลสินค้า ${sku} เรียบร้อย`,
      product:{sku,name,category,unit,minStock,active,price} };
  } else if (action === "product.price.save") {
    const sku=writeSku(p.sku), price=writeMoney(p.salePrice,"ราคาขายหลัก"), note=writeText(p.note,200,"หมายเหตุ");
    const [{data:product},{data:before}] = await Promise.all([
      db.from("products").select("*").eq("sku",sku).eq("active",true).maybeSingle(),
      db.from("prices").select("*").eq("sku",sku).maybeSingle(),
    ]);
    if (!product) throw new ApiError("SKU_NOT_FOUND", `ไม่พบสินค้า ${sku}`);
    upserts.push({table:"prices",keyColumn:"sku",row:{...(before||{}),sku,sale_price:price,updated_at:eventAt,updated_by:user.name,note}});
    audits.push({action:"PRICE_UPDATE",target:sku,details:{before:before?n(before.sale_price):null,after:price,note}});
    result={message:`ตั้งราคาขาย ${product.product_name} = ${price.toFixed(2)} บาท/${product.unit||"ชิ้น"} เรียบร้อย`,sku,salePrice:price};
  } else if (action === "finance.cost.save") {
    const sku=writeSku(p.sku), unitCost=writeMoney(p.unitCost,"ต้นทุนต่อชิ้น"), note=writeText(p.note,200,"หมายเหตุ");
    const [{data:product},{data:before}] = await Promise.all([
      db.from("products").select("*").eq("sku",sku).eq("active",true).maybeSingle(),
      db.from("fin_costs").select("*").eq("sku",sku).maybeSingle(),
    ]);
    if (!product) throw new ApiError("SKU_NOT_FOUND", `ไม่พบสินค้า ${sku}`);
    upserts.push({table:"fin_costs",keyColumn:"sku",row:{...(before||{}),sku,unit_cost:unitCost,updated_at:eventAt,updated_by:user.name,note}});
    audits.push({action:"FIN_COST_UPDATE",target:sku,details:{before:before?round(n(before.unit_cost)):null,after:unitCost,note}});
    result={message:`บันทึกต้นทุน ${product.product_name} = ${unitCost.toFixed(2)} บาท/${product.unit||"ชิ้น"} เรียบร้อย`,sku,unitCost};
  } else if (action === "finance.payment.save") {
    const internalOrderId=writeText(p.internalOrderId,40,"รหัสออเดอร์",true).toUpperCase();
    const [{data:order},{data:items,error:itemError},{data:costRows}] = await Promise.all([
      db.from("orders").select("*").eq("internal_order_id",internalOrderId).maybeSingle(),
      db.from("order_items").select("*").eq("internal_order_id",internalOrderId),
      db.from("fin_costs").select("*"),
    ]);
    if(!order)throw new ApiError("ORDER_NOT_FOUND","ไม่พบออเดอร์ในระบบ");
    if(order.order_status==="CANCELLED")throw new ApiError("ORDER_CANCELLED",`ออเดอร์ ${order.external_order_id} ถูกยกเลิกแล้ว ไม่ต้องบันทึกยอดเงิน`);
    if(itemError)throw new ApiError("DATABASE_ERROR","อ่านรายการสินค้าในออเดอร์ไม่สำเร็จ",500);
    if(!items?.length)throw new ApiError("ORDER_NOT_FOUND","ออเดอร์นี้ไม่มีรายการสินค้า");
    const {data:channel}=await db.from("channels").select("*").eq("channel_id",order.channel_id).maybeSingle();
    const sale=writeMoney(p.salePrice,"ราคาที่ลูกค้าจ่าย"),received=writeMoney(p.receivedAmount,"เงินที่ได้รับจริง");
    const receivedDate=text(p.receivedDate)||today;
    if(!/^\d{4}-\d{2}-\d{2}$/.test(receivedDate)||new Date(`${receivedDate}T00:00:00Z`).toISOString().slice(0,10)!==receivedDate)
      throw new ApiError("INVALID_DATE","วันที่ได้รับเงินไม่ถูกต้อง");
    if(receivedDate>today)throw new ApiError("INVALID_DATE","วันที่ได้รับเงินเป็นวันในอนาคตไม่ได้");
    const note=writeText(p.note,300,"หมายเหตุ");
    const overrides:Record<string,number>={}; const newCosts=p.newCosts&&typeof p.newCosts==="object"&&!Array.isArray(p.newCosts)?p.newCosts:{};
    const inOrder=new Set((items||[]).map((item:Row)=>text(item.sku)));
    for(const [rawSku,value] of Object.entries(newCosts as Row)){
      const sku=writeSku(rawSku);if(!inOrder.has(sku))throw new ApiError("SKU_NOT_IN_ORDER",`สินค้า ${sku} ไม่อยู่ในออเดอร์นี้`);
      overrides[sku]=writeMoney(value,`ต้นทุนของ ${sku}`);
    }
    const costBySku=Object.fromEntries((costRows||[]).map((c:Row)=>[c.sku,c]));
    let costAmount=0;const lines:Row[]=[],missing:string[]=[];
    for(const item of items as Row[]){
      const qty=n(item.quantity)-n(item.returned_qty), existingCost=costBySku[item.sku];
      const unitCost=Object.prototype.hasOwnProperty.call(overrides,item.sku)?overrides[item.sku]:(existingCost? n(existingCost.unit_cost):null);
      if(unitCost==null&&qty>0)missing.push(item.sku);
      const lineCost=unitCost==null?null:round(unitCost*qty);
      if(lineCost!=null)costAmount+=lineCost;
      lines.push({sku:item.sku,name:item.product_name,unit:"ชิ้น",qtySold:n(item.quantity),qtyReturned:n(item.returned_qty),qty,unitCost,lineCost});
    }
    if(missing.length)throw new ApiError("COST_MISSING",`ยังไม่มีต้นทุนของสินค้า: ${missing.join(", ")} — กรุณากรอกต้นทุนต่อชิ้นก่อนบันทึก`,400,{skus:missing});
    costAmount=round(costAmount);
    for(const [sku,unitCost] of Object.entries(overrides)){
      const before=costBySku[sku];if(before&&round(n(before.unit_cost))===unitCost)continue;
      upserts.push({table:"fin_costs",keyColumn:"sku",row:{...(before||{}),sku,unit_cost:unitCost,updated_at:eventAt,updated_by:user.name,note:before?.note||""}});
      audits.push({action:"FIN_COST_UPDATE",target:sku,details:{before:before?round(n(before.unit_cost)):null,after:unitCost,via:order.external_order_id}});
    }
    const feeAmount=round(sale-received),profit=round(received-costAmount),marginPct=sale>0?round(profit/sale*100):0;
    const costDetail=lines.map((line)=>`${line.sku} ${line.qty}x${n(line.unitCost).toFixed(2)}`).join("; ").slice(0,2000);
    const beforeRead=await db.from("fin_orders").select("*").eq("internal_order_id",internalOrderId).maybeSingle();
    if(beforeRead.error)throw new ApiError("DATABASE_ERROR","อ่านข้อมูลการเงินเดิมไม่สำเร็จ",500);
    const before=beforeRead.data;
    const finFields={channel_id:order.channel_id,external_order_id:order.external_order_id,sale_price:sale,received_amount:received,
      fee_amount:feeAmount,cost_amount:costAmount,profit,margin_pct:marginPct,received_date:receivedDate,cost_detail:costDetail,
      note,updated_by:user.name,updated_at:eventAt,operation_id:"PENDING"};
    const finRow=await fullUpsertRow(db,"fin_orders","internal_order_id",internalOrderId,finFields,{internal_order_id:internalOrderId});
    upserts.push({table:"fin_orders",keyColumn:"internal_order_id",row:finRow});
    audits.push({action:before?"FIN_PAYMENT_UPDATE":"FIN_PAYMENT_CREATE",target:internalOrderId,
      details:{orderNo:order.external_order_id,before:before?recordView(before,{},{}):null,after:finFields}});
    result={message:`${before?"แก้ไข":"บันทึก"}ยอดเงินออเดอร์ ${order.external_order_id} เรียบร้อย`,record:{internalOrderId,channelId:order.channel_id,
      channelName:channel?.channel_name||order.channel_id,orderNo:order.external_order_id,salePrice:sale,receivedAmount:received,feeAmount,costAmount,
      profit,marginPct,receivedDate,note},lines,updated:!!before};
  } else if (action === "admin.channel.save") {
    const id=writeText(p.channelId,20,"รหัสช่องทาง",true).toUpperCase();
    if (!/^[A-Z0-9_]{2,20}$/.test(id)) throw new ApiError("INVALID_VALUE","รหัสช่องทางใช้ได้เฉพาะ A-Z 0-9 _ ยาว 2–20 ตัว");
    const isNew=!!p.isNew;
    const [{data:existing},{data:allChannels}] = await Promise.all([
      db.from("channels").select("*").eq("channel_id",id).maybeSingle(),
      db.from("channels").select("*").order("sort_order"),
    ]);
    if (isNew&&existing) throw new ApiError("DUPLICATE",`มีรหัสช่องทาง ${id} อยู่แล้ว`);
    if (!isNew&&!existing) throw new ApiError("CHANNEL_NOT_FOUND",`ไม่พบช่องทาง ${id}`);
    const name=writeText(p.name,60,"ชื่อช่องทาง",true), mode=text(p.mode).trim();
    if (!new Set(["SCAN","AUTO"]).has(mode)) throw new ApiError("INVALID_VALUE","โหมดเลขออเดอร์ไม่ถูกต้อง");
    const prefix=text(p.prefix).trim().toUpperCase();
    if (mode==="AUTO"&&!/^[A-Z0-9]{2,10}$/.test(prefix)) throw new ApiError("INVALID_VALUE","ช่องทางแบบออกเลขอัตโนมัติต้องมีคำนำหน้า A-Z 0-9 ยาว 2–10 ตัว");
    if (mode==="AUTO"&&(allChannels||[]).some((c:Row)=>c.channel_id!==id&&c.order_mode==="AUTO"&&text(c.prefix).toUpperCase()===prefix)) {
      throw new ApiError("DUPLICATE",`คำนำหน้า ${prefix} ถูกใช้แล้ว`);
    }
    const sortOrder=p.sortOrder==null||p.sortOrder===""?(existing?n(existing.sort_order):(allChannels||[]).length+1):writeNonNegInt(p.sortOrder,"ลำดับ");
    const fields={channel_name:name,order_mode:mode,prefix:mode==="AUTO"?prefix:"",active:p.active==null||!!p.active,sort_order:sortOrder,updated_at:eventAt};
    upserts.push({table:"channels",keyColumn:"channel_id",row:{...(existing||{}),channel_id:id,...fields}});
    audits.push({action:isNew?"CHANNEL_CREATE":"CHANNEL_UPDATE",target:id,details:{before:existing,after:fields}});
    result={message:`บันทึกช่องทาง ${name} เรียบร้อย`,channelId:id};
  } else if (action === "admin.user.save") {
    const userId=writeText(p.userId,80,"รหัสผู้ใช้",true);
    const {data:existing,error}=await db.from("wms_users").select("*").eq("line_user_id",userId).maybeSingle();
    if(error)throw new ApiError("DATABASE_ERROR","อ่านข้อมูลพนักงานไม่สำเร็จ",500);
    if(!existing)throw new ApiError("USER_NOT_FOUND","ไม่พบผู้ใช้");
    const name=writeText(p.name,60,"ชื่อพนักงาน",true),role=text(p.role).toUpperCase();
    if(!new Set(["ADMIN","STAFF","VIEWER"]).has(role))throw new ApiError("INVALID_VALUE","บทบาทไม่ถูกต้อง");
    const active=!!p.active;
    if(!(role==="ADMIN"&&active)){
      const {count,error:countError}=await db.from("wms_users").select("line_user_id",{count:"exact",head:true})
        .eq("role","ADMIN").eq("active",true).neq("line_user_id",userId);
      if(countError)throw new ApiError("DATABASE_ERROR","ตรวจสอบผู้ดูแลระบบไม่สำเร็จ",500);
      if(!count)throw new ApiError("LAST_ADMIN","ต้องมี ADMIN ที่ใช้งานอยู่อย่างน้อย 1 คน");
    }
    const fields={name,role,active};
    upserts.push({table:"wms_users",keyColumn:"line_user_id",row:{...existing,line_user_id:userId,...fields}});
    audits.push({action:"USER_UPDATE",target:userId,details:{before:{name:existing.name,role:existing.role,active:existing.active},after:fields}});
    result={message:`บันทึกข้อมูลพนักงาน ${name} เรียบร้อย`};
  } else if (action === "admin.setting.save") {
    const editable=["COMPANY_NAME","SCAN_MODE","ORDER_RUNNING_DIGITS","DEFAULT_MIN_STOCK","STOCK_IN_TYPES","WRITE_OFF_REASONS","SUPPLIER_RETURN_REASONS","ADJUST_REASONS","CANCEL_REASONS","BACKUP_KEEP_DAYS","PAPER_SIZE","SHOP_NAME","SHOP_ADDRESS","SHOP_PHONE","SHOP_TAX_ID","BILL_FOOTER"];
    const optional=["SHOP_NAME","SHOP_ADDRESS","SHOP_PHONE","SHOP_TAX_ID","BILL_FOOTER"];
    const key=text(p.key).trim();
    if(!editable.includes(key))throw new ApiError("INVALID_VALUE","รายการตั้งค่าไม่ถูกต้อง");
    const max=key==="SHOP_ADDRESS"?300:optional.includes(key)?120:500;
    let value=writeText(p.value,max,"ค่า",!optional.includes(key));
    if(key==="PAPER_SIZE"){value=value.toUpperCase();if(!["A4","A5"].includes(value))throw new ApiError("INVALID_VALUE","ขนาดกระดาษไม่ถูกต้อง");}
    if(key==="SHOP_TAX_ID"&&value&&!/^[0-9\- ]{10,20}$/.test(value))throw new ApiError("INVALID_VALUE","เลขประจำตัวผู้เสียภาษีต้องเป็นตัวเลข");
    if(key==="SCAN_MODE"&&!new Set(["QTY","EACH"]).has(value))throw new ApiError("INVALID_VALUE","โหมดสแกนไม่ถูกต้อง");
    if(key==="ORDER_RUNNING_DIGITS"){const digits=writeNonNegInt(value,"จำนวนหลัก");if(digits<3||digits>8)throw new ApiError("INVALID_VALUE","จำนวนหลักต้องอยู่ระหว่าง 3–8");value=String(digits);}
    if(key==="DEFAULT_MIN_STOCK"||key==="BACKUP_KEEP_DAYS")value=String(writeNonNegInt(value,"ค่า"));
    if(/_REASONS$|_TYPES$/.test(key)&&!value.split(/[\n,;]+/).map((x)=>x.trim()).filter(Boolean).length)throw new ApiError("INVALID_VALUE","ต้องมีอย่างน้อย 1 รายการ");
    const {data:existing,error}=await db.from("wms_settings").select("*").eq("key",key).maybeSingle();
    if(error)throw new ApiError("DATABASE_ERROR","อ่านการตั้งค่าไม่สำเร็จ",500);
    const row={...(existing||{}),key,value,description:existing?.description||""};
    upserts.push({table:"wms_settings",keyColumn:"key",row});
    audits.push({action:"SETTING_UPDATE",target:key,details:{before:existing?.value||"",after:value}});
    result={message:"บันทึกการตั้งค่าเรียบร้อย"};
  } else if (action === "stock.in" || action === "return.supplier" || action === "writeoff") {
    const raw=Array.isArray(p.lines)?p.lines:[],{checked,productBy}=await loadProducts(raw,action!=="stock.in"), grouped=new Map<string,number>();
    checked.forEach((l)=>grouped.set(l.sku,(grouped.get(l.sku)||0)+l.qty));
    const lines=[...grouped.entries()].map(([sku,qty])=>({sku,qty}));
    const key=action==="stock.in"?"STOCK_IN_TYPES":action==="return.supplier"?"SUPPLIER_RETURN_REASONS":"WRITE_OFF_REASONS";
    const reason=writeText(action==="stock.in"?p.inType:p.reason,60,"เหตุผล",true),{data:s}=await db.from("wms_settings").select("value").eq("key",key).maybeSingle();
    const choices=text(s?.value).split(/[\n,;]+/).map((x)=>x.trim()).filter(Boolean);if(choices.length&&!choices.includes(reason))throw new ApiError("INVALID_VALUE",`เหตุผล "${reason}" ไม่อยู่ในรายการที่กำหนด`);
    const note=writeText(p.note,300,"หมายเหตุ");if(/^อื่น/.test(reason)&&!note)throw new ApiError("NOTE_REQUIRED","เลือก ‘อื่น ๆ’ กรุณาระบุหมายเหตุ");
    const status=text(action==="stock.in"?(p.toStatus||"AVAILABLE"):p.fromStatus||"AVAILABLE");if(!["AVAILABLE","INSPECTION"].includes(status))throw new ApiError("INVALID_VALUE","สถานะสต๊อกไม่ถูกต้อง");
    const prefix=action==="stock.in"?"IN":action==="return.supplier"?"SR":"WO",doc=docNo(prefix),supplier=action==="return.supplier"?writeText(p.supplier,100,"ชื่อซัพพลายเออร์",true):"",ref=action==="return.supplier"?writeText(p.refNo,60,"เลขอ้างอิง"):"";
    lines.forEach((l,index)=>{const product=productBy[l.sku];moves.push({sku:l.sku,product_name:product.product_name,stock_status:status,delta:action==="stock.in"?l.qty:-l.qty,
      transaction_type:action==="stock.in"?"IN":action==="return.supplier"?"SUPPLIER_RETURN":"WRITE_OFF",sub_type:action==="stock.in"?reason:action==="return.supplier"?supplier:"MANUAL",reference_id:doc,reason,note,user_name:user.name});
      if(action==="return.supplier")appendGroups.push({table:"wms_returns",rows:[{return_id:`${doc}-${index+1}`,return_doc_no:doc,return_type:"SUPPLIER",internal_order_id:"",channel_id:"",external_order_id:"",sku:l.sku,product_name:product.product_name,quantity:l.qty,condition:"",from_status:status,supplier,reference_no:ref,reason,note,user_id:user.id,user_name:user.name,event_at:eventAt,operation_id:"PENDING"}]});});
    result={message:action==="stock.in"?"รับสินค้าเข้าเรียบร้อย":action==="return.supplier"?"บันทึกส่งคืนซัพพลายเออร์เรียบร้อย":"ตัดสินค้าเสียเรียบร้อย",docNo:doc,
      lines:lines.map((l)=>({sku:l.sku,name:productBy[l.sku].product_name,unit:productBy[l.sku].unit||"ชิ้น",qty:l.qty}))};
  } else if (action === "transfer" || action === "adjust") {
    const sku=writeSku(p.sku),{productBy,balanceBy}=await loadProducts([{sku,qty:1}],true),product=productBy[sku],note=writeText(p.note,300,"หมายเหตุ");
    if(action==="transfer"){
      const qty=writeNonNegInt(p.qty,"จำนวน"),target=text(p.target);if(qty<1||!new Set(["TO_AVAILABLE","TO_WRITE_OFF"]).has(target))throw new ApiError("INVALID_VALUE","จำนวนหรือผลการตรวจสอบไม่ถูกต้อง");
      const doc=docNo("TF");let reason="ตรวจสอบแล้วสภาพดี";
      if(target==="TO_AVAILABLE")moves.push({sku,product_name:product.product_name,stock_status:"INSPECTION",delta:-qty,transaction_type:"TRANSFER",sub_type:"INSPECTION_TO_AVAILABLE",reference_id:doc,reason,note,user_name:user.name},{sku,product_name:product.product_name,stock_status:"AVAILABLE",delta:qty,transaction_type:"TRANSFER",sub_type:"INSPECTION_TO_AVAILABLE",reference_id:doc,reason,note,user_name:user.name});
      else{reason=writeText(p.reason,60,"เหตุผลการตัดเสีย",true);moves.push({sku,product_name:product.product_name,stock_status:"INSPECTION",delta:-qty,transaction_type:"WRITE_OFF",sub_type:"INSPECTION_FAILED",reference_id:doc,reason,note,user_name:user.name});}
      result={message:target==="TO_AVAILABLE"?`ย้าย ${qty} ${product.unit||"ชิ้น"} เข้ายอดพร้อมขายแล้ว`:"ตัดเสียจากยอดรอตรวจสอบแล้ว",docNo:doc,lines:[{sku,name:product.product_name,unit:product.unit||"ชิ้น",qty}]};
    }else{
      const status=text(p.status||"AVAILABLE"),expected=writeNonNegInt(p.expectedQty,"ยอดในระบบ"),counted=writeNonNegInt(p.countedQty,"จำนวนที่นับได้"),reason=writeText(p.reason,60,"เหตุผล",true),balance=balanceBy[sku]||{};
      if(!["AVAILABLE","INSPECTION"].includes(status))throw new ApiError("INVALID_VALUE","สถานะสต๊อกไม่ถูกต้อง");
      const current=n(status==="INSPECTION"?balance.inspection_qty:balance.available_qty);if(current!==expected)throw new ApiError("STALE_BALANCE",`ยอดในระบบเปลี่ยนไป (ตอนนี้ ${current} ไม่ใช่ ${expected}) กรุณานับใหม่`,409,{current});
      const diff=counted-current,doc=docNo("ADJ");if(diff)moves.push({sku,product_name:product.product_name,stock_status:status,delta:diff,transaction_type:"ADJUST",sub_type:diff>0?"COUNT_UP":"COUNT_DOWN",reference_id:doc,reason,note,user_name:user.name});
      audits.push({action:"STOCK_COUNT",target:sku,details:{status,system:current,counted,diff,reason,doc}});result={message:diff===0?"ยอดตรงกับระบบ บันทึกผลการตรวจนับแล้ว":`ปรับยอดเรียบร้อย (ส่วนต่าง ${diff>0?"+":""}${diff})`,docNo:doc,diff,lines:[{sku,name:product.product_name,unit:product.unit||"ชิ้น",qty:diff}]};
    }
  } else if (action === "order.create" || action === "pos.sale") {
    const channelId=writeText(p.channelId,30,"ช่องทางขาย",true).toUpperCase(),{data:ch}=await db.from("channels").select("*").eq("channel_id",channelId).maybeSingle();
    if(!ch)throw new ApiError("CHANNEL_NOT_FOUND","ไม่พบช่องทางขาย");if(!ch.active)throw new ApiError("CHANNEL_INACTIVE","ช่องทางขายถูกปิดใช้งาน");
    const raw=Array.isArray(p.lines)?p.lines:[],{checked,productBy}=await loadProducts(raw);if(action==="pos.sale"&&checked.length!==raw.length)throw new ApiError("DUPLICATE_LINE","มีสินค้าซ้ำหลายบรรทัด กรุณารวมเป็นบรรทัดเดียว");
    const lines=checked.reduce((a,l)=>{const x=a.find((z:Row)=>z.sku===l.sku);if(x)x.qty+=l.qty;else a.push({...l});return a;},[] as Row[]),note=writeText(p.note,300,"หมายเหตุ");
    if(action==="order.create"&&ch.order_mode==="AUTO")throw new ApiError("USE_POS","ช่องทางนี้เป็นช่องทางขายตรง กรุณาใช้เมนูขายหน้าร้าน");if(action==="pos.sale"&&ch.order_mode!=="AUTO")throw new ApiError("NOT_DIRECT","ช่องทางนี้เป็นช่องทางแพลตฟอร์ม กรุณาใช้เมนูขายสินค้าออก");
    let ext=text(p.orderNo).trim().replace(/\s+/g,"").toUpperCase();if(action==="pos.sale")ext=await autoNo(ch);if(action==="order.create"&&(!/^[A-Z0-9][A-Z0-9\-_.\/#]{3,63}$/.test(ext)))throw new ApiError("INVALID_ORDER_NO","เลขออเดอร์ไม่ถูกต้อง");
    const allOrders=await rows(db,"orders"),orderKey=`${channelId}|${ext}`;if(allOrders.some((o)=>o.order_key===orderKey&&o.order_status!=="CANCELLED"))throw new ApiError("DUPLICATE_ORDER",`ออเดอร์ ${ext} ถูกบันทึกแล้ว`);
    const internal=docNo("ORD",5),totalQty=lines.reduce((a,l)=>a+l.qty,0),itemRows=lines.map((l,i)=>({order_item_id:`${internal}-${pad(i+1,2)}`,internal_order_id:internal,sku:l.sku,product_name:productBy[l.sku].product_name,quantity:l.qty,returned_qty:0}));
    appendGroups.push({table:"orders",rows:[{internal_order_id:internal,channel_id:channelId,external_order_id:ext,order_key:orderKey,order_status:"COMPLETED",line_count:lines.length,total_qty:totalQty,created_by:user.id,created_by_name:user.name,created_at:eventAt,completed_at:eventAt,cancelled_by:"",cancelled_at:null,cancel_reason:"",note,operation_id:"PENDING"}]},{table:"order_items",rows:itemRows});
    lines.forEach((l)=>moves.push({sku:l.sku,product_name:productBy[l.sku].product_name,stock_status:"AVAILABLE",delta:-l.qty,transaction_type:"OUT",sub_type:"SALE",reference_id:internal,channel_id:channelId,reason:ext,note,user_name:user.name}));
    if(action==="order.create")result={message:"บันทึกการขายและตัดสต๊อกเรียบร้อย",internalOrderId:internal,orderNo:ext,channelId,channelName:ch.channel_name,totalQty,createdAt:eventAt,createdBy:user.name,lines:lines.map((l)=>({sku:l.sku,name:productBy[l.sku].product_name,unit:productBy[l.sku].unit||"ชิ้น",qty:l.qty}))};
    else {
      const payment=text(p.paymentMethod).toUpperCase();if(!["CASH","TRANSFER"].includes(payment))throw new ApiError("INVALID_VALUE","วิธีรับเงินไม่ถูกต้อง");
      const billDiscount=p.billDiscount==null||p.billDiscount===""?0:writeMoney(p.billDiscount,"ส่วนลดท้ายบิล");
      const customerName=writeText(p.customerName,80,"ชื่อลูกค้า"),customerPhone=writeText(p.customerPhone,20,"เบอร์โทรลูกค้า");
      if(customerPhone&&!/^[0-9+\- ]{6,20}$/.test(customerPhone))throw new ApiError("INVALID_TEXT","เบอร์โทรลูกค้าไม่ถูกต้อง");
      const skuList=lines.map((l)=>l.sku),[{data:prices},{data:costRows},{data:shopSettings}]=await Promise.all([
        db.from("prices").select("*").in("sku",skuList),db.from("fin_costs").select("*").in("sku",skuList),
        db.from("wms_settings").select("key,value").in("key",["SHOP_NAME","SHOP_ADDRESS","SHOP_PHONE","SHOP_TAX_ID","BILL_FOOTER"]),
      ]);
      const priceBy=Object.fromEntries((prices||[]).map((r:Row)=>[r.sku,r.sale_price])),costBy=Object.fromEntries((costRows||[]).map((r:Row)=>[r.sku,r.unit_cost])),settings=Object.fromEntries((shopSettings||[]).map((r:Row)=>[r.key,r.value]));
      const items:Row[]=[],noList:string[]=[];let subtotal=0,lineDiscount=0,priceEdited=false;
      for(const l of lines){const source=raw.find((r:Row)=>text(r.sku).toUpperCase()===l.sku),unitPrice=writeMoney(source?.unitPrice,`ราคาขายของ ${l.sku}`),listPrice=priceBy[l.sku]==null?null:n(priceBy[l.sku]),lineTotal=round(unitPrice*l.qty),discount=listPrice!=null&&listPrice>unitPrice?round((listPrice-unitPrice)*l.qty):0;
        if(listPrice==null)noList.push(l.sku);else if(unitPrice!==listPrice)priceEdited=true;subtotal+=lineTotal;lineDiscount+=discount;items.push({sku:l.sku,name:productBy[l.sku].product_name,unit:productBy[l.sku].unit||"ชิ้น",qty:l.qty,listPrice,unitPrice,lineDiscount:discount,lineTotal});}
      subtotal=round(subtotal);lineDiscount=round(lineDiscount);if(billDiscount>subtotal)throw new ApiError("INVALID_MONEY","ส่วนลดท้ายบิลมากกว่ายอดรวม");const total=round(subtotal-billDiscount);
      if(p.expectedTotal!==undefined&&p.expectedTotal!==null&&p.expectedTotal!==""&&writeMoney(p.expectedTotal,"ยอดสุทธิ")!==total)throw new ApiError("TOTAL_MISMATCH","ยอดสุทธิไม่ตรงกับระบบ กรุณาตรวจราคาอีกครั้ง");
      let cash=0,change=0;if(payment==="CASH"&&p.cashReceived!==undefined&&p.cashReceived!==null&&p.cashReceived!==""){cash=writeMoney(p.cashReceived,"เงินที่รับมา");if(cash<total)throw new ApiError("CASH_NOT_ENOUGH","เงินที่รับมาน้อยกว่ายอดสุทธิ");change=round(cash-total);}
      const edited=priceEdited||billDiscount>0,header={shopName:settings.SHOP_NAME||"",address:settings.SHOP_ADDRESS||"",phone:settings.SHOP_PHONE||"",taxId:settings.SHOP_TAX_ID||"",footer:settings.BILL_FOOTER||""};
      const bill={internalOrderId:internal,billNo:ext,channelId,channelName:ch.channel_name,billDate:date,createdAt:eventAt,customerName,customerPhone,seller:user.name,itemCount:items.length,totalQty,subtotal,lineDiscount,billDiscount,total,paymentMethod:payment,paymentLabel:payment==="CASH"?"เงินสด":"โอน",cashReceived:cash,change,priceEdited:edited,note,status:"COMPLETED",header,items};
      appendGroups.push({table:"sales_bills",rows:[{internal_order_id:internal,bill_no:ext,channel_id:channelId,bill_date:date,customer_name:customerName,customer_phone:customerPhone,item_count:items.length,total_qty:totalQty,subtotal,line_discount:lineDiscount,bill_discount:billDiscount,total,payment_method:payment,cash_received:cash,change_amount:change,price_edited:edited,seller_id:user.id,seller_name:user.name,created_at:eventAt,header_json:header,note,operation_id:"PENDING"}]},
        {table:"sales_bill_items",rows:items.map((i,index)=>({item_id:`${internal}-${pad(index+1,2)}`,internal_order_id:internal,bill_no:ext,sku:i.sku,product_name:i.name,unit:i.unit,qty:i.qty,list_price:i.listPrice,unit_price:i.unitPrice,line_discount:i.lineDiscount,line_total:i.lineTotal}))});
      const financeRecorded=items.every((i)=>costBy[i.sku]!=null),costAmount=round(items.reduce((sum,i)=>sum+n(costBy[i.sku])*i.qty,0));
      if(financeRecorded){const profit=round(total-costAmount),detail=items.map((i)=>`${i.sku} ${i.qty}x${n(costBy[i.sku]).toFixed(2)}`).join("; ").slice(0,2000);upserts.push({table:"fin_orders",keyColumn:"internal_order_id",row:{internal_order_id:internal,channel_id:channelId,external_order_id:ext,sale_price:total,received_amount:total,fee_amount:0,cost_amount:costAmount,profit,margin_pct:total?round(profit/total*100):0,received_date:date,cost_detail:detail,note:`ขายตรง ${payment==="CASH"?"เงินสด":"โอน"} (บันทึกอัตโนมัติจากบิล)`,updated_by:user.name,updated_at:eventAt,operation_id:"PENDING"}});}
      if(edited)audits.push({action:"POS_PRICE_OVERRIDE",target:internal,details:{billNo:ext,billDiscount,items:items.filter((i)=>i.listPrice!=null&&i.listPrice!==i.unitPrice)}});
      result={message:"ขายและตัดสต๊อกเรียบร้อย",internalOrderId:internal,orderNo:ext,billNo:ext,total,paymentMethod:payment,cashReceived:cash,change,totalQty,noListPrice:noList,financeRecorded,bill,lines:lines.map((l)=>({sku:l.sku,name:productBy[l.sku].product_name,unit:productBy[l.sku].unit||"ชิ้น",qty:l.qty}))};
    }
  } else if (action === "order.cancel" || action === "return.customer") {
    const channelId=writeText(p.channelId,30,"ช่องทางขาย",true).toUpperCase(),orderNo=writeText(p.orderNo,80,"เลขออเดอร์",true).replace(/\s+/g,"").toUpperCase();
    const all=await rows(db,"orders"),order=all.find((o)=>o.internal_order_id===orderNo)||[...all].reverse().find((o)=>o.channel_id===channelId&&o.external_order_id===orderNo||o.order_key===`${channelId}|${orderNo}`);
    if(!order)throw new ApiError("ORDER_NOT_FOUND","ไม่พบออเดอร์ในช่องทางที่เลือก");const {data:items}=await db.from("order_items").select("*").eq("internal_order_id",order.internal_order_id),note=writeText(p.note,300,"หมายเหตุ");
    if(action==="order.cancel"){
      if(order.order_status==="CANCELLED")throw new ApiError("ALREADY_CANCELLED","ออเดอร์นี้ถูกยกเลิกแล้ว");const reason=writeText(p.reason,60,"เหตุผลการยกเลิก",true),restored:Row[]=[];
      for(const it of items||[]){const qty=n(it.quantity)-n(it.returned_qty);if(qty<=0)continue;moves.push({sku:it.sku,product_name:it.product_name,stock_status:"AVAILABLE",delta:qty,transaction_type:"CANCEL",sub_type:"ORDER_CANCEL",reference_id:order.internal_order_id,channel_id:channelId,reason,note,user_name:user.name});restored.push({sku:it.sku,name:it.product_name,qty});}
      upserts.push({table:"orders",keyColumn:"internal_order_id",row:{...order,order_status:"CANCELLED",cancelled_by:user.name,cancelled_at:eventAt,cancel_reason:reason+(note?` — ${note}`:"")}});result={message:`ยกเลิกออเดอร์ ${order.external_order_id} และคืนสต๊อกเรียบร้อย`,internalOrderId:order.internal_order_id,orderNo:order.external_order_id,lines:restored};
    }else{
      if(order.order_status==="CANCELLED")throw new ApiError("ORDER_CANCELLED","ออเดอร์นี้ถูกยกเลิกแล้ว");const raw=Array.isArray(p.lines)?p.lines:[],by=Object.fromEntries((items||[]).map((it:Row)=>[it.sku,it])),used:Record<string,number>={};if(!raw.length)throw new ApiError("EMPTY_LINES","กรุณาเลือกรายการรับคืน");
      const doc=docNo("RT"),out:Row[]=[];for(let i=0;i<raw.length;i++){const l=raw[i],sku=writeSku(l.sku),qty=writeNonNegInt(l.qty,"จำนวนคืน"),condition=text(l.condition).toUpperCase(),it=by[sku];if(!it)throw new ApiError("SKU_NOT_IN_ORDER",`สินค้า ${sku} ไม่อยู่ในออเดอร์`);if(!["GOOD","CHECK","DAMAGED"].includes(condition))throw new ApiError("INVALID_VALUE","สภาพสินค้าคืนไม่ถูกต้อง");const remain=n(it.quantity)-n(it.returned_qty)-(used[sku]||0);if(qty<1||qty>remain)throw new ApiError("RETURN_EXCEEDS",`จำนวนคืน ${sku} เกินยอดที่คืนได้อีก ${remain}`);used[sku]=(used[sku]||0)+qty;const name=it.product_name,reason=condition==="GOOD"?"สภาพดี พร้อมขาย":condition==="CHECK"?"ชำรุด รอตรวจสอบ":"เสียหาย ขายไม่ได้",base={sku,product_name:name,reference_id:doc,channel_id:channelId,reason:order.external_order_id,note,user_name:user.name};moves.push({...base,stock_status:condition==="GOOD"?"AVAILABLE":"INSPECTION",delta:qty,transaction_type:"RETURN",sub_type:condition});if(condition==="DAMAGED")moves.push({...base,stock_status:"INSPECTION",delta:-qty,transaction_type:"WRITE_OFF",sub_type:"RETURN_DAMAGED",reason:"ลูกค้าคืนสภาพเสียหาย"});appendGroups.push({table:"wms_returns",rows:[{return_id:`${doc}-${i+1}`,return_doc_no:doc,return_type:"CUSTOMER",internal_order_id:order.internal_order_id,channel_id:channelId,external_order_id:order.external_order_id,sku,product_name:name,quantity:qty,condition,from_status:"",supplier:"",reference_no:"",reason,note,user_id:user.id,user_name:user.name,event_at:eventAt,operation_id:"PENDING"}]});out.push({sku,name,qty,condition,conditionLabel:reason});}
      let complete=true;for(const it of items||[]){const qty=n(it.returned_qty)+(used[it.sku]||0);if(used[it.sku])upserts.push({table:"order_items",keyColumn:"order_item_id",row:{...it,returned_qty:qty}});if(qty<n(it.quantity))complete=false;}upserts.push({table:"orders",keyColumn:"internal_order_id",row:{...order,order_status:complete?"RETURNED_FULL":"RETURNED_PARTIAL"}});result={message:"รับคืนสินค้าเรียบร้อย",docNo:doc,internalOrderId:order.internal_order_id,orderNo:order.external_order_id,lines:out};
    }
  } else {
    throw new ApiError("ACTION_NOT_MIGRATED", "คำสั่งนี้ยังไม่ได้ย้ายจาก Apps Script", 501);
  }
  counterKeys=[];
  if (audits.length) {
    const group=auditGroup("PENDING",eventAt,user,audits);
    if (group) appendGroups.push(group);
  }
  const committed=await commitWritePlan(db,requestId,action,user,counterKeys,appendGroups,upserts,moves,result,eventAt,reservation);
  return committed;
}

async function expenseAction(db: ReturnType<typeof serviceClient>, action: string, p: Row, user: WmsUser): Promise<unknown> {
  if (user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์ใช้งานข้อมูลค่าใช้จ่าย", 403);
  if (action === "finance.expenses.list") {
    const from = text(p.dateFrom) || `${new Date().getFullYear()}-01-01`;
    const to = text(p.dateTo) || dayInBangkok();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw new ApiError("INVALID_DATE", "ช่วงวันที่ไม่ถูกต้อง");
    const { data, error } = await db.from("expenses").select("*").gte("expense_date", from).lte("expense_date", to).order("expense_date", { ascending: false }).limit(2000);
    if (error) throw new ApiError("DATABASE_ERROR", "โหลดรายการค่าใช้จ่ายไม่สำเร็จ", 500);
    return { items: (data || []).map((e: Row) => ({ id:e.id,date:e.expense_date,category:e.category,subcategory:e.subcategory,
      description:e.description,amount:n(e.amount),paymentMethod:e.payment_method,vendor:e.vendor,referenceNo:e.reference_no,
      note:e.note,createdBy:e.created_by,createdAt:e.created_at })), dateFrom:from,dateTo:to };
  }
  if (action === "finance.expenses.save") {
    const id=text(p.id).trim(); const date=text(p.date).trim(); const category=text(p.category).trim();
    const description=text(p.description).trim(); const amount=n(p.amount);
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new ApiError("INVALID_REQUEST", "รหัสค่าใช้จ่ายไม่ถูกต้อง");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new ApiError("INVALID_DATE", "วันที่ไม่ถูกต้อง");
    if (!category || category.length>60 || !description || description.length>240) throw new ApiError("INVALID_TEXT", "กรุณาระบุหมวดหมู่และรายละเอียด (รายละเอียดไม่เกิน 240 ตัวอักษร)");
    if (!Number.isFinite(amount) || amount<=0 || amount>100000000 || Math.round(amount*100)!==amount*100) throw new ApiError("INVALID_MONEY", "ค่าใช้จ่ายต้องมากกว่า 0 และมีทศนิยมไม่เกิน 2 ตำแหน่ง");
    const now=new Date().toISOString();
    const row={id,expense_date:date,category,subcategory:text(p.subcategory).slice(0,60)||null,description,amount,
      payment_method:text(p.paymentMethod).slice(0,30)||null,vendor:text(p.vendor).slice(0,120)||null,
      reference_no:text(p.referenceNo).slice(0,80)||null,note:text(p.note).slice(0,500)||null,created_by:user.name,created_at:now,updated_at:now};
    const {data,error}=await db.from("expenses").upsert(row,{onConflict:"id"}).select("id,expense_date,category,description,amount").single();
    if(error)throw new ApiError("DATABASE_ERROR","บันทึกค่าใช้จ่ายไม่สำเร็จ",500);
    await db.from("wms_audit_log").insert({log_id:`EXP-${id}`,event_at:now,user_id:user.id,user_name:user.name,action:"EXPENSE_CREATE",target:id,details:JSON.stringify({date,category,amount})});
    return {message:"บันทึกค่าใช้จ่ายเรียบร้อย",expense:{id:data.id,date:data.expense_date,category:data.category,description:data.description,amount:n(data.amount)}};
  }
  throw new ApiError("ACTION_NOT_MIGRATED", "คำสั่งนี้ยังไม่ได้ย้ายจาก Apps Script", 501);
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders(origin) });
  if (req.method !== "POST") return response({ ok: false, error: { code: "METHOD_NOT_ALLOWED", message: "ใช้ POST เท่านั้น" } }, 405, origin);

  try {
    const text = await req.text();
    const body = JSON.parse(text || "{}");
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      throw new ApiError("BAD_REQUEST", "รูปแบบคำขอไม่ถูกต้อง");
    }
    const action = String(body.action || "");
    if (action === "health") return response({ ok: true, data: { app: APP_NAME, backend: "supabase", ready: true } }, 200, origin);
    const db = serviceClient();
    const claims = await verifyLineIdToken(body.idToken);
    const user = await getOrRegisterUser(db, claims);
    if (action === "bootstrap") return response({ ok: true, data: await bootstrap(db, user), replay: false }, 200, origin);
    const payload = body.payload && typeof body.payload === "object" && !Array.isArray(body.payload) ? body.payload : {};
    const writeActions = new Set(["product.save","stock.in","order.create","order.cancel","return.customer","return.supplier",
      "writeoff","transfer","adjust","admin.channel.save","admin.user.save","admin.setting.save","finance.payment.save",
      "finance.cost.save","product.price.save","pos.sale"]);
    if (action.startsWith("finance.expenses.")) {
      const data=await expenseAction(db,action,payload,user);
      return response({ok:true,data,replay:false},200,origin);
    }
    if (writeActions.has(action)) {
      const result=await writeAction(db,action,payload,user,text(body.requestId));
      return response({ok:true,data:result.data,replay:!!result.replay},200,origin);
    }
    const data=await readAction(db,action,payload,user);
    return response({ ok: true, data, replay: false }, 200, origin);
  } catch (err) {
    if (err instanceof ApiError) {
      return response({ ok: false, error: { code: err.code, message: err.message, details: err.details } }, err.status, origin);
    }
    console.error("line-wms-api failure", err instanceof Error ? err.message : "unknown error");
    return response({ ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" } }, 500, origin);
  }
});
