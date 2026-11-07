import { json, sameOrigin, sessionCookie } from './_shared.js';

export function onRequestPost({ request }) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Invalid request origin' }, 403);
  return json({ ok: true, data: { authenticated: false } }, 200, { 'set-cookie': sessionCookie('', 0) });
}

export function onRequest(context) {
  if (context.request.method !== 'POST') return json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'POST' });
  return onRequestPost(context);
}
