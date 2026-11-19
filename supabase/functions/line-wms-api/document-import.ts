type Row = Record<string, any>;
function check(result: any) { if(result.error) throw new Error('DATABASE_ERROR'); return result.data || []; }
function id(v: unknown) { const s=String(v||'').trim().toUpperCase(); if(!/^[A-Z0-9_-]{1,80}$/.test(s)) throw new Error('INVALID_IDENTIFIER'); return s; }
function money(v: unknown) { const n=Number(v); if(v==null || v==='' || !Number.isFinite(n)||Math.abs(n)>1e8||Math.abs(n*100-Math.round(n*100))>1e-5) throw new Error('INVALID_AMOUNT'); return Math.round(n*100)/100; }
export async function documentImport(db: any, action: string, p: Row, user: Row) {
 if(user.role!=='ADMIN') throw new Error('FORBIDDEN');
 if(action==='documents.history') {
   return {items:check(await db.from('document_import_batches').select('id,channel_id,created_at,status,committed_at,result_json').order('created_at',{ascending:false}).limit(30))};
 }
 if(action==='documents.detail') {
   if(!/^[0-9a-f-]{36}$/i.test(String(p.batchId)))throw new Error('INVALID_BATCH');
   const batches=check(await db.from('document_import_batches').select('id,status,created_by,channel_id,rows_json').eq('id',p.batchId));
   const b=batches[0];if(!b)throw new Error('IMPORT_NOT_FOUND');
   if(b.status==='REVIEW'){if(b.created_by!==user.id)throw new Error('FORBIDDEN');return {batchId:b.id,channelId:b.channel_id,review:b.rows_json};}
   return {items:check(await db.from('document_import_entries').select('kind,external_order_id,internal_order_id,event_date,amount,fee_amount,tracking_number,source_name,source_hash').eq('batch_id',p.batchId).order('id'))};
 }
 if(action==='documents.commit') {
   if(!/^[0-9a-f-]{36}$/i.test(String(p.batchId))) throw new Error('INVALID_BATCH');
   const result=await db.rpc('wms_commit_document_import',{p_batch:p.batchId,p_user:user.id,p_name:user.name,p_choices:p.choices});
   if(result.error) { const known=['IMPORT_DUPLICATE','IMPORT_STALE','FINANCE_EXISTS','LEGACY_OVERLAP','TRACKING_CONFLICT','HISTORICAL_CONFIRM_REQUIRED','IMPORT_REVIEW_REQUIRED','DUPLICATE_ORDER']; throw new Error(known.find(k=>result.error.message?.includes(k))||'IMPORT_COMMIT_FAILED'); }
   return result.data;
 }
 if(action!=='documents.preview') throw new Error('UNKNOWN_ACTION');
 const channelId=id(p.channelId);
 const channel=check(await db.from('channels').select('channel_id,channel_name,active').eq('channel_id',channelId));
 if(!channel[0]?.active||!/shopee/i.test(channel[0].channel_name+' '+channelId)) throw new Error('SELECT_SHOPEE_CHANNEL');
 if(!Array.isArray(p.rows)||!p.rows.length||p.rows.length>500) throw new Error('IMPORT_ROW_LIMIT');
 const seen=new Set();
 const sourceRows=p.rows.map((r: Row)=>{
   const orderNo=id(r.orderNo),type=String(r.type),trackingNo=r.trackingNo?id(r.trackingNo):'';
   if(!['orders','income','adjustment'].includes(type)) throw new Error('INVALID_KIND');
   const date=String(r.date); if(!/^20\d\d-\d\d-\d\d$/.test(date)||new Date(date+'T00:00:00Z').toISOString().slice(0,10)!==date) throw new Error('INVALID_DATE');
   if(!/^[a-f0-9]{64}$/.test(r.sourceHash||'')||!r.source||String(r.source).length>255) throw new Error('INVALID_SOURCE');
   const entryKey=type==='adjustment'?String(r.entryKey):orderNo;
   if(entryKey.length>200||!entryKey||seen.has(type+'|'+entryKey)) throw new Error('DUPLICATE_SOURCE_ROW'); seen.add(type+'|'+entryKey);
   return {orderNo,type,trackingNo,date,entryKey,value:money(r.value),fees:money(r.fees),source:String(r.source),sourceHash:r.sourceHash};
 });
 const identifiers=[...new Set(sourceRows.flatMap((r:Row)=>[r.orderNo,r.trackingNo]).filter(Boolean))];
 const byOrder=new Map();
 for(let start=0;start<identifiers.length;start+=80){const part=identifiers.slice(start,start+80).join(',');
   const found=check(await db.from('orders').select('internal_order_id,external_order_id,tracking_number,order_status,total_qty').eq('channel_id',channelId).or('external_order_id.in.('+part+'),tracking_number.in.('+part+')'));
   found.forEach((o:Row)=>byOrder.set(o.internal_order_id,o));
 }
 const orders:Row[]=[...byOrder.values()];
 const finances:Row[]=[];
 const financeIds=[...new Set([...identifiers,...orders.map((o:Row)=>o.external_order_id)])];
 for(let start=0;start<financeIds.length;start+=80){finances.push(...check(await db.from('fin_orders').select('internal_order_id,external_order_id,sale_price,received_amount,received_date').eq('channel_id',channelId).in('external_order_id',financeIds.slice(start,start+80))));}
 const prior=check(await db.from('document_import_entries').select('kind,entry_key').eq('channel_id',channelId).in('external_order_id',sourceRows.map((r:Row)=>r.orderNo)));
 const months=[...new Set(sourceRows.map((r:Row)=>r.date.slice(0,7)+'-01'))];
 const legacy=check(await db.from('legacy_monthly_financial_totals').select('month_start').eq('summary_kind','income').in('month_start',months));
 const reviewed=sourceRows.map((r:Row)=>{
   const exact=orders.filter((o:Row)=>o.external_order_id===r.orderNo);
   const candidates=exact.length?exact:orders.filter((o:Row)=>r.trackingNo&&(o.external_order_id===r.trackingNo||o.tracking_number===r.trackingNo));
   const live=candidates.filter((o:Row)=>o.order_status!=='CANCELLED'); const o=live.length===1?live[0]:null;
   const finance=finances.find((f:Row)=>f.external_order_id===r.orderNo||o&&f.internal_order_id===o.internal_order_id);
   let status=live.length>1?'AMBIGUOUS':o?(o.external_order_id===r.orderNo?'MATCHED':'TRACKING_CANDIDATE'):candidates.length?'CANCELLED':'NOT_FOUND';
   if(o?.tracking_number&&r.trackingNo&&o.tracking_number!==r.trackingNo)status='TRACKING_CONFLICT';
   if(prior.some((e:Row)=>e.kind===r.type&&e.entry_key===r.entryKey))status='DUPLICATE';
   else if(finance)status='FINANCE_EXISTS';
   else if(legacy.some((l:Row)=>l.month_start===r.date.slice(0,7)+'-01'))status='LEGACY_OVERLAP';
   return {...r,status,internalOrderId:o?.internal_order_id||null,existingOrderNo:o?.external_order_id||null,existingFinance:finance||null};
 });
 const batchId=crypto.randomUUID(); check(await db.from('document_import_batches').insert({id:batchId,channel_id:channelId,created_by:user.id,rows_json:reviewed}));
 return {batchId,items:reviewed};
}
