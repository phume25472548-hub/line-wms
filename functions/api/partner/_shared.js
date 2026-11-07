const SESSION_COOKIE = '__Host-wms_partner';
const SESSION_SECONDS = 8 * 60 * 60;

function json(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: Object.assign({
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store, no-cache, must-revalidate',
      'pragma': 'no-cache',
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'x-frame-options': 'DENY',
      'vary': 'Cookie'
    }, extraHeaders)
  });
}

function cookieValue(request) {
  const header = request.headers.get('cookie') || '';
  const pair = header.split(';').map((part) => part.trim()).find((part) => part.startsWith(SESSION_COOKIE + '='));
  return pair ? pair.slice(SESSION_COOKIE.length + 1) : '';
}

function base64url(bytes) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function decodeBase64url(value) {
  const normalized = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(normalized + '='.repeat((4 - normalized.length % 4) % 4));
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}

async function sessionKey(env) {
  if (!env.PARTNER_SESSION_SECRET || env.PARTNER_SESSION_SECRET.length < 32) throw new Error('PARTNER_SESSION_SECRET is not configured');
  return crypto.subtle.importKey('raw', new TextEncoder().encode(env.PARTNER_SESSION_SECRET), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

export async function makeSession(env) {
  const expiresAt = Math.floor(Date.now() / 1000) + SESSION_SECONDS;
  const payload = base64url(new TextEncoder().encode(JSON.stringify({ v: 1, exp: expiresAt })));
  const signature = await crypto.subtle.sign('HMAC', await sessionKey(env), new TextEncoder().encode(payload));
  return payload + '.' + base64url(new Uint8Array(signature));
}

export async function validSession(request, env) {
  const token = cookieValue(request);
  const parts = token.split('.');
  if (parts.length !== 2 || !parts[0] || !parts[1]) return false;
  try {
    const valid = await crypto.subtle.verify('HMAC', await sessionKey(env), decodeBase64url(parts[1]), new TextEncoder().encode(parts[0]));
    if (!valid) return false;
    const payload = JSON.parse(new TextDecoder().decode(decodeBase64url(parts[0])));
    return payload.v === 1 && Number.isInteger(payload.exp) && payload.exp > Math.floor(Date.now() / 1000);
  } catch (_) { return false; }
}

export function sessionCookie(value, maxAge = SESSION_SECONDS) {
  return SESSION_COOKIE + '=' + value + '; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=' + maxAge;
}

export function sameOrigin(request) {
  const origin = request.headers.get('origin');
  if (!origin) return request.headers.get('sec-fetch-site') !== 'cross-site';
  try { return new URL(origin).origin === new URL(request.url).origin; } catch (_) { return false; }
}

export function unavailable(message = 'Partner service is not configured') {
  return json({ ok: false, error: message }, 503);
}

export { json };
