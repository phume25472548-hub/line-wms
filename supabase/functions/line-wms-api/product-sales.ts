type Row = Record<string, any>;

/** Movement-date report. Returns and cancellations may relate to earlier sales. */
export function summarizeProductSales(transactions: Row[], products: Row[]) {
  const catalog = new Map(products.map(p => [p.sku, p]));
  const grouped = new Map<string, Row>();
  for (const tx of transactions) {
    if (!tx.sku || !['OUT', 'CANCEL', 'RETURN'].includes(tx.transaction_type)) continue;
    const qty = Number(tx.quantity_change);
    if (!Number.isFinite(qty)) throw new Error('INVALID_SALES_QUANTITY');
    const sold = tx.transaction_type === 'OUT' ? Math.max(0, -qty) : 0;
    const cancelled = tx.transaction_type === 'CANCEL' ? Math.max(0, qty) : 0;
    const returned = tx.transaction_type === 'RETURN' ? Math.max(0, qty) : 0;
    if (!sold && !cancelled && !returned) continue;
    const product = catalog.get(tx.sku);
    const item = grouped.get(tx.sku) || { sku: tx.sku, name: product?.product_name || tx.product_name || tx.sku,
      unit: product?.unit || 'ชิ้น', sold: 0, cancelled: 0, returned: 0, net: 0 };
    item.sold += sold; item.cancelled += cancelled; item.returned += returned;
    item.net = item.sold - item.cancelled - item.returned;
    grouped.set(tx.sku, item);
  }
  const items = [...grouped.values()].sort((a,b) => b.sold-a.sold || a.sku.localeCompare(b.sku));
  const totals = items.reduce((s,r) => ({sold:s.sold+r.sold,cancelled:s.cancelled+r.cancelled,
    returned:s.returned+r.returned,net:s.net+r.net}), {sold:0,cancelled:0,returned:0,net:0});
  return { items, totals };
}

export async function productSalesReport(db: any, from: string, to: string, products: Row[]) {
  for (const value of [from,to]) {
    const parsed=new Date(value+'T00:00:00Z');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0,10)!==value) throw new Error('INVALID_DATE');
  }
  if (from>to) throw new Error('INVALID_DATE');
  const nextDay = new Date(new Date(to+'T00:00:00Z').getTime()+86400000).toISOString().slice(0,10);
  const transactions: Row[]=[];
  for(let start=0;;start+=1000) {
    const {data,error} = await db.from('wms_transactions')
      .select('transaction_id,transaction_type,sku,product_name,quantity_change')
      .in('transaction_type',['OUT','CANCEL','RETURN'])
      .gte('event_at',from+'T00:00:00+07:00').lt('event_at',nextDay+'T00:00:00+07:00')
      .order('event_at',{ascending:false}).order('transaction_id',{ascending:false}).range(start,start+999);
    if(error) throw new Error('DATABASE_ERROR');
    transactions.push(...(data||[]));
    if(!data||data.length<1000) break;
    if(transactions.length>=50000) throw new Error('RESULT_TOO_LARGE');
  }
  return {...summarizeProductSales(transactions,products),dateFrom:from,dateTo:to};
}
