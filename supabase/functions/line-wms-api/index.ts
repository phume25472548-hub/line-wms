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
    "dashboard", "users.options", "reconcile", "admin.users", "admin.settings", "admin.channels", "finance.summary",
    "finance.pending", "finance.order", "finance.records", "finance.costs", "product.prices", "pos.bill", "pos.bills"]);
  if (!allowed.has(action)) throw new ApiError("ACTION_NOT_MIGRATED", "คำสั่งนี้ยังไม่ได้ย้ายจาก Apps Script", 501);
  const adminActions = new Set(["admin.users", "admin.settings", "admin.channels", "finance.summary", "finance.pending",
    "finance.order", "finance.records", "finance.costs"]);
  if (adminActions.has(action) && user.role !== "ADMIN") throw new ApiError("FORBIDDEN", "ไม่มีสิทธิ์ใช้งานคำสั่งนี้", 403);

  const need = async (...names: string[]) => Object.fromEntries(await Promise.all(names.map(async (name) => [name, await rows(db, name)])));
  const keyBy = (arr: Row[], key: string) => Object.fromEntries(arr.map((r) => [r[key], r]));
  const today = dayInBangkok();
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
    const data = action.startsWith("finance.expenses.")
      ? await expenseAction(db, action, payload, user)
      : await readAction(db, action, payload, user);
    return response({ ok: true, data, replay: false }, 200, origin);
  } catch (err) {
    if (err instanceof ApiError) {
      return response({ ok: false, error: { code: err.code, message: err.message, details: err.details } }, err.status, origin);
    }
    console.error("line-wms-api failure", err instanceof Error ? err.message : "unknown error");
    return response({ ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" } }, 500, origin);
  }
});
