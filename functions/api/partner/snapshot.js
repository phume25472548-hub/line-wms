import { json, sameOrigin, validSession } from './_shared.js';

function cleanString(value, max = 160) {
  return typeof value === 'string' ? value.slice(0, max) : '';
}
function cleanNumber(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 0;
}
function safeSnapshot(data) {
  const source = data && data.snapshot ? data.snapshot : data;
  const stocks = Array.isArray(source && source.stocks) ? source.stocks.slice(0, 1000).map((item) => ({
    sku: cleanString(item.sku, 80), name: cleanString(item.name, 160), category: cleanString(item.category, 80),
    unit: cleanString(item.unit, 24), available: cleanNumber(item.available), inspection: cleanNumber(item.inspection), total: cleanNumber(item.total)
  })) : [];
  const orders = Array.isArray(source && source.orders) ? source.orders.slice(0, 100).map((item) => ({
    orderNo: cleanString(item.orderNo, 100), channelName: cleanString(item.channelName, 80), status: cleanString(item.status, 40),
    createdAt: cleanString(item.createdAt, 40), quantity: cleanNumber(item.quantity), itemCount: cleanNumber(item.itemCount)
  })) : [];
  return { stocks, orders, updatedAt: cleanString(source && source.updatedAt, 40) };
}

export async function onRequestGet({ request, env }) {
  if (!sameOrigin(request)) return json({ ok: false, error: 'Invalid request origin' }, 403);
  if (!(await validSession(request, env))) return json({ ok: false, error: 'Authentication required' }, 401);
  if (!env.WMS_GAS_URL || !env.WMS_PARTNER_API_KEY) return json({ ok: false, error: 'Partner data connector is not configured yet' }, 503);
  try {
    const endpoint = new URL(env.WMS_GAS_URL);
    if (endpoint.protocol !== 'https:' || endpoint.hostname !== 'script.google.com') throw new Error('Invalid WMS_GAS_URL');
    const response = await fetch(endpoint.toString(), {
      method: 'POST', redirect: 'follow', cache: 'no-store',
      headers: { 'content-type': 'text/plain;charset=UTF-8', accept: 'application/json', 'x-wms-partner-key': env.WMS_PARTNER_API_KEY },
      body: JSON.stringify({ action: 'partner.snapshot', payload: { stockLimit: 1000, orderLimit: 100 } })
    });
    if (!response.ok) throw new Error('Upstream request failed');
    const result = await response.json();
    if (!result || result.ok !== true || !result.data) throw new Error('Unexpected upstream response');
    return json({ ok: true, data: safeSnapshot(result.data) });
  } catch (_) {
    return json({ ok: false, error: '无法连接库存数据服务，请联系管理员。' }, 502);
  }
}

export function onRequest(context) {
  if (context.request.method !== 'GET') return json({ ok: false, error: 'Method not allowed' }, 405, { allow: 'GET' });
  return onRequestGet(context);
}
