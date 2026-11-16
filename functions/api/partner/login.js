import { json, makeSession, sameOrigin, sessionCookie } from './_shared.js';

async function equalSecret(left, right) {
  const encoder = new TextEncoder();
  const a = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(left)));
  const b = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(right)));
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a[i] ^ b[i];
  return difference === 0;
}

export async function onRequestPost({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Invalid request origin' }, 403);
  if (!env.PARTNER_PASSWORD || !env.PARTNER_SESSION_SECRET || env.PARTNER_SESSION_SECRET.length < 32) {
    return json({ ok: false, error: 'Partner access is not configured yet' }, 503);
  }
  let body;
  try { body = await request.json(); } catch (_) { return json({ ok: false, error: 'Invalid request' }, 400); }
  const supplied = typeof body.password === 'string' ? body.password : '';
  if (supplied.length < 16 || supplied.length > 256 || !(await equalSecret(supplied, env.PARTNER_PASSWORD))) {
    return json({ ok: false, error: 'Invalid credentials' }, 401);
  }
  try {
    const token = await makeSession(env);
    return json({ ok: true, data: { authenticated: true } }, 200, { 'set-cookie': sessionCookie(token) });
  } catch (_) {
    return json({ ok: false, error: 'Partner access is temporarily unavailable' }, 503);
  }
}

export function onRequest(context) {
  if (context.request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'POST' });
  return onRequestPost(context);
}
