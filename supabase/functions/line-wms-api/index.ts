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
    if (action !== "bootstrap") {
      throw new ApiError("ACTION_NOT_MIGRATED", "คำสั่งนี้ยังไม่ได้ย้ายจาก Apps Script", 501);
    }

    const db = serviceClient();
    const claims = await verifyLineIdToken(body.idToken);
    const user = await getOrRegisterUser(db, claims);
    return response({ ok: true, data: await bootstrap(db, user), replay: false }, 200, origin);
  } catch (err) {
    if (err instanceof ApiError) {
      return response({ ok: false, error: { code: err.code, message: err.message, details: err.details } }, err.status, origin);
    }
    console.error("line-wms-api failure", err instanceof Error ? err.message : "unknown error");
    return response({ ok: false, error: { code: "SERVER_ERROR", message: "เกิดข้อผิดพลาดในระบบ กรุณาลองใหม่" } }, 500, origin);
  }
});
