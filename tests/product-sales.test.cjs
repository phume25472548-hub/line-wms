const fs=require('fs'),assert=require('node:assert/strict'),{stripTypeScriptTypes}=require('node:module');
(async()=>{
 const source=stripTypeScriptTypes(fs.readFileSync(require('node:path').join(__dirname,'../supabase/functions/line-wms-api/product-sales.ts'),'utf8'));
 const {summarizeProductSales,productSalesReport}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const products=[{sku:'A',product_name:'Current A',unit:'ชิ้น',active:false}];
 const tx=[{sku:'A',transaction_type:'OUT',quantity_change:-10},{sku:'A',transaction_type:'CANCEL',quantity_change:2},{sku:'A',transaction_type:'RETURN',quantity_change:3},{sku:'A',transaction_type:'WRITE_OFF',quantity_change:-3},{sku:'A',transaction_type:'SUPPLIER_RETURN',quantity_change:-20},{sku:'B',product_name:'Old B',transaction_type:'RETURN',quantity_change:4}];
 const snapshot=JSON.stringify(tx),r=summarizeProductSales(tx,products);
 assert.deepEqual(r.totals,{sold:10,cancelled:2,returned:7,net:1});assert.equal(r.items[0].name,'Current A');assert.equal(r.items[1].net,-4);assert.equal(JSON.stringify(tx),snapshot);assert.deepEqual(summarizeProductSales([],[]).items,[]);
 const records=Array.from({length:1501},(_,i)=>({transaction_id:String(i),sku:'A',transaction_type:'OUT',quantity_change:-1}));const calls=[];
 const db={from:()=>{const q={};for(const method of ['select','in','gte','lt','order'])q[method]=(...args)=>{calls.push([method,...args]);return q;};q.range=async(a,b)=>({data:records.slice(a,b+1),error:null});return q;}};
 const paged=await productSalesReport(db,'2026-12-31','2026-12-31',products);assert.equal(paged.totals.sold,1501);assert(calls.some(c=>c[0]==='gte'&&c[2]==='2026-12-31T00:00:00+07:00'));assert(calls.some(c=>c[0]==='lt'&&c[2]==='2027-01-01T00:00:00+07:00'));
 await assert.rejects(()=>productSalesReport(db,'2026-11-20','2026-11-19',products));
 console.log('PASS: sales/cancellations/returns, damaged-return double-count exclusion, supplier exclusion, archived product names, negative net, empty range, 1501-row pagination, Thai midnight/year boundary, invalid dates, no mutation.');
})().catch(e=>{console.error(e);process.exitCode=1;});
