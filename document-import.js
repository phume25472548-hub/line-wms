/* Shopee import: local parsing, server review, explicit transactional commit. */
(function () {
  'use strict';
  function node(tag, text) { var e = document.createElement(tag); if (text != null) e.textContent = text; return e; }
  function normalized(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function amount(v) { var n = Number(String(v).replace(/,/g, '')); if (!Number.isFinite(n)) throw new Error('พบจำนวนเงินที่อ่านไม่ได้'); return n; }
  function dateOnly(v) {
    var s=String(v||'').trim().slice(0,10);
    if(!/^20\d\d-\d\d-\d\d$/.test(s)) throw new Error('วันที่ในรายงานไม่ใช่ YYYY-MM-DD กรุณาส่งออกไฟล์ Shopee ใหม่');
    return s;
  }
  function parse(workbook, name) {
    var result = [];
    workbook.SheetNames.forEach(function (sheet) {
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {header: 1, defval: '', raw: false});
      var adjustment = sheet === 'Adjustment';
      var head = rows.findIndex(function (r) { return r.indexOf(adjustment ? 'รหัสคำสั่งซื้อที่เกี่ยวข้อง' : 'หมายเลขคำสั่งซื้อ') >= 0; });
      if (head < 0) return;
      var headers = rows[head], index = function (key) { return headers.indexOf(key); };
      var income = index('จำนวนเงินทั้งหมดที่โอนแล้ว (฿)') >= 0;
      var order = index(adjustment?'รหัสคำสั่งซื้อที่เกี่ยวข้อง':'หมายเลขคำสั่งซื้อ'), tracking = index('*หมายเลขติดตามพัสดุ');
      if (!income && !adjustment && index('ราคาขายสุทธิ') < 0) return;
      var groups = {};
      rows.slice(head + 1).forEach(function (r, i) {
        var id = normalized(r[order]); if (!id) return;
        if (!/^[A-Z0-9_-]{1,80}$/.test(id)) throw new Error('เลขออเดอร์ผิดรูปแบบ แถว ' + (head + i + 2));
        var eventDate=dateOnly(r[index(adjustment?'วันที่โอนยอดเงินที่ปรับปรุง':income?'วันที่โอนชำระเงินสำเร็จ':'วันที่ทำการสั่งซื้อ')]);
        var type=adjustment?'adjustment':income?'income':'orders';
        var entryKey=adjustment?id+'|'+eventDate+'|'+String(r[index('ประเภทการปรับปรุง | คำอธิบาย')])+'|'+String(r[index('ยอดที่ปรับปรุง')]):id;
        var key = type+':' + entryKey;
        if (income && groups[key]) throw new Error('รายงานรายรับมีเลขออเดอร์ซ้ำ กรุณาตรวจ ' + id);
        if(adjustment&&groups[key])throw new Error('พบรายการปรับปรุงซ้ำ ต้องตรวจด้วยตนเอง: '+id);
        var g = groups[key] || (groups[key] = {orderNo: id, entryKey:entryKey, trackingNo: '', type:type, value: 0, fees:0, lines: 0, source: name, date:eventDate});
        if (tracking >= 0 && r[tracking]) {
          var t = normalized(r[tracking]); if (g.trackingNo && g.trackingNo !== t) throw new Error('พบหลายเลขพัสดุในออเดอร์ ' + id);
          g.trackingNo = t;
        }
        g.value += amount(r[index(adjustment?'ยอดที่ปรับปรุง':income ? 'จำนวนเงินทั้งหมดที่โอนแล้ว (฿)' : 'ราคาขายสุทธิ')]); g.lines++;
        if(income)g.fees=['ค่าคอมมิชชั่น AMS','ค่าคอมมิชชั่น','ค่าบริการ','ค่าธรรมเนียมโครงสร้างพื้นฐานแพลตฟอร์ม','ค่าธรรมเนียม ของโปรแกรมประหยัดค่าจัดส่ง','ค่าธุรกรรมการชำระเงิน','ค่าธรรมเนียมเติมเงินโฆษณาจากเงิน Escrow'].reduce(function(sum,k){return sum+(index(k)>=0?Math.abs(amount(r[index(k)]||0)):0);},0);
      });
      Object.keys(groups).forEach(function (key) { groups[key].value=Math.round(groups[key].value*100)/100; groups[key].fees=Math.round(groups[key].fees*100)/100; result.push(groups[key]); });
    });
    if (!result.length) throw new Error('ไม่พบตารางออเดอร์หรือรายรับ Shopee ที่รองรับ');
    return result;
  }
  function mount(root, api) {
    var data = [], revision = 0, batchId=null;
    var labels={MATCHED:'เลขออเดอร์ตรงกัน',TRACKING_CANDIDATE:'อาจกรอกเลขพัสดุแทนเลขออเดอร์',NOT_FOUND:'ไม่พบออเดอร์',AMBIGUOUS:'พบหลายออเดอร์ ต้องตรวจ',CANCELLED:'ออเดอร์ถูกยกเลิก',DUPLICATE:'เคยนำเข้าแล้ว',FINANCE_EXISTS:'มีการเงินเดิมแล้ว ต้องตรวจ',LEGACY_OVERLAP:'มียอดสรุปเดือนนี้แล้ว ต้องตรวจ',TRACKING_CONFLICT:'เลขพัสดุไม่ตรงข้อมูลเดิม'};
    var card = node('div'); card.className = 'card';
    card.appendChild(node('h2', '1. เลือกเอกสาร Shopee'));
    card.appendChild(node('p', 'เลือกไฟล์ออเดอร์และรายรับพร้อมกันได้ เลขออเดอร์ใช้จับคู่ ยอดขายอิงวันที่สั่งซื้อ ยอดรับสุทธิอิงวันที่โอน เลือกเฉพาะรายการที่ตรวจแล้วก่อนยืนยัน'));
    var channel = node('select'); channel.className = 'input';
    api.channels.filter(function(c){return /shopee/i.test(c.channelId+' '+c.name);}).forEach(function (c) { var o = node('option', c.name); o.value = c.channelId; channel.appendChild(o); });
    card.appendChild(channel);
    var file = node('input'); file.type = 'file'; file.accept = '.xlsx'; file.multiple = true; card.appendChild(file);
    var message = node('p'); message.setAttribute('role', 'status'); card.appendChild(message);
    var check = node('button', '2. ตรวจจับคู่กับ WMS'); check.className = 'btn btn-primary btn-block'; check.disabled = true; card.appendChild(check);
    var output = node('div'); root.appendChild(card); root.appendChild(output);
    var confirm = node('button','3. ยืนยันรายการที่เลือก'); confirm.className='btn btn-primary btn-block'; confirm.disabled=true; root.appendChild(confirm);
    var history=node('div'); history.className='card'; root.appendChild(history);
    function loadHistory(){api.read('documents.history',{}).then(function(d){history.replaceChildren(node('h2','ประวัติการนำเข้า')); d.items.forEach(function(b){var row=node('div');row.appendChild(node('p',b.created_at.slice(0,10)+' · '+b.channel_id+' · '+(b.status==='COMMITTED'?'บันทึกแล้ว '+b.result_json.count+' รายการ':'รอตรวจ')+' · '+b.id));
      var button=node('button',b.status==='COMMITTED'?'ดูรายการและไฟล์ต้นทาง':'เปิดตรวจต่อ');button.className='btn btn-outline';button.onclick=async function(){button.disabled=true;try{var detail=await api.read('documents.detail',{batchId:b.id});
        if(detail.review){data=detail.review;batchId=detail.batchId;channel.value=detail.channelId;data.forEach(function(r){r.selected=false;});draw();updateConfirm();check.disabled=false;message.textContent='เปิดรายการรอตรวจแล้ว ระบบจะตรวจยอดซ้ำอีกครั้งตอนยืนยัน';button.disabled=false;return;}
        var box=node('div');detail.items.forEach(function(r){box.appendChild(node('p',r.event_date+' · '+r.external_order_id+' · '+r.kind+' · '+Number(r.amount).toFixed(2)+' บาท · '+r.source_name+' · '+(r.internal_order_id?'ผูกออเดอร์ '+r.internal_order_id:'ยอดย้อนหลัง ไม่ผูกออเดอร์')));});row.appendChild(box);}catch(e){message.textContent=e.message;button.disabled=false;}};row.appendChild(button);history.appendChild(row);
    });}).catch(function(e){history.textContent=e.message;});} loadHistory();
    function selectable(r){return ['MATCHED','TRACKING_CANDIDATE','NOT_FOUND'].indexOf(r.status)>=0;}
    function updateConfirm(){confirm.disabled=!batchId||!data.some(function(r){return r.selected;});}
    function draw() {
      output.replaceChildren();
      ['orders', 'income','adjustment'].forEach(function (type) {
        var list = data.filter(function (r) { return r.type === type; }); if (!list.length) return;
        var c = node('div'); c.className = 'card';
        c.appendChild(node('h2', (type==='adjustment'?'รายการปรับปรุง':type === 'income' ? 'ยอดโอนสุทธิ' : 'ยอดขายสุทธิสินค้า') + ' — ' + list.length + ' รายการ'));
        c.appendChild(node('p', 'รวม ' + list.reduce(function (sum, r) { return sum + r.value; }, 0).toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' บาท'));
        var wrap = node('div'); wrap.style.overflowX = 'auto'; var table = node('table');table.className='document-import-table';
        var tr = node('tr'); ['เลือก', 'วันที่ในรายงาน', 'เลขออเดอร์', 'เลขพัสดุ', 'ยอดจากไฟล์', 'ผลตรวจ / ยอดเดิม'].forEach(function (h) { tr.appendChild(node('th', h)); }); table.appendChild(tr);
        list.forEach(function (r) { var tr=node('tr'),td=node('td'),box=node('input'); box.type='checkbox';box.checked=!!r.selected;box.disabled=!batchId||!selectable(r);box.setAttribute('aria-label','เลือก '+r.orderNo+' '+type);
          box.onchange=function(){if(box.checked&&r.status==='TRACKING_CANDIDATE'&&!window.confirm('ยืนยันแก้เลขออเดอร์เดิม '+r.existingOrderNo+' เป็น '+r.orderNo+' และเก็บเลขเดิมเป็นเลขพัสดุเมื่อบันทึก?')){box.checked=false;return;}
            if(box.checked&&r.status==='NOT_FOUND'&&!window.confirm('ยืนยันนำเข้าเป็นยอดย้อนหลังที่ยังไม่ผูกออเดอร์ โดยไม่มีการตัดสต็อก?')){box.checked=false;return;}r.selected=box.checked;updateConfirm();}; td.appendChild(box);tr.appendChild(td);
          [r.date,r.orderNo,r.trackingNo||'—',r.value.toFixed(2),(labels[r.status]||'รอตรวจ')+(r.existingFinance?' · รับเดิม '+Number(r.existingFinance.received_amount).toFixed(2):'')].forEach(function(v){tr.appendChild(node('td',v));});table.appendChild(tr);
        });
        wrap.appendChild(table); c.appendChild(wrap); output.appendChild(c);
      });
      output.appendChild(node('p', 'ยอดรับสุทธิหักค่าธรรมเนียมแล้ว ไม่หักซ้ำ • รายการปรับปรุงเลือกแยกได้ • เก็บข้อมูลที่อ่านจากรายงาน ชื่อไฟล์และลายนิ้วมือไฟล์เป็นหลักฐาน โดยไม่เก็บข้อมูลที่อยู่ลูกค้า • ไม่ตัดสต็อกย้อนหลัง'));
    }
    file.onchange = async function () {
      var current = ++revision; data = []; batchId=null; updateConfirm(); check.disabled = true; message.textContent = 'กำลังอ่านไฟล์…'; output.replaceChildren();
      try {
        var all = [], seen = new Set();
        for (var f of file.files) {
          if (f.size > 10 * 1024 * 1024) throw new Error('รองรับไฟล์ขนาดไม่เกิน 10 MB');
          var bytes=await f.arrayBuffer(); var digest=await crypto.subtle.digest('SHA-256',bytes); var hash=Array.from(new Uint8Array(digest)).map(function(b){return b.toString(16).padStart(2,'0');}).join('');
          var parsed = parse(XLSX.read(bytes, {type: 'array'}), f.name);
          parsed.forEach(function (r) { r.sourceHash=hash;var k = r.type + ':' + r.entryKey; if (seen.has(k)) throw new Error('พบออเดอร์ซ้ำข้ามไฟล์: ' + r.orderNo); seen.add(k); all.push(r); });
        }
        if (current !== revision) return;
        if (all.length > 500) throw new Error('ตรวจได้ครั้งละไม่เกิน 500 รายการ');
        var trackingBy={};all.forEach(function(r){if(r.type==='orders'&&r.trackingNo){if(trackingBy[r.orderNo]&&trackingBy[r.orderNo]!==r.trackingNo)throw new Error('เลขพัสดุขัดแย้ง '+r.orderNo);trackingBy[r.orderNo]=r.trackingNo;}});all.forEach(function(r){if(!r.trackingNo)r.trackingNo=trackingBy[r.orderNo]||'';});
        data = all; draw(); check.disabled = !all.length || !channel.value; message.textContent = 'อ่านแล้ว ' + all.length + ' รายการ กรุณาเลือกช่องทางให้ถูกต้องก่อนตรวจ';
      } catch (e) { if (current === revision) message.textContent = e.message; }
    };
    channel.onchange = function () { revision++;batchId=null; data.forEach(function (r) { delete r.status;r.selected=false; }); draw();updateConfirm();check.disabled = !data.length; };
    check.onclick = async function () {
      var current = ++revision, selected = channel.value; check.disabled = true; file.disabled = true; channel.disabled = true;
      batchId=null; updateConfirm(); message.textContent='กำลังตรวจจับคู่และยอดซ้ำ…';
      try {
        var reviewed=await api.read('documents.preview',{channelId:selected,rows:data});if(current!==revision)return;
        data=reviewed.items; batchId=reviewed.batchId;
        draw(); message.textContent = 'ตรวจจับคู่เสร็จแล้ว ผลนี้ยังไม่ใช่การยืนยันนำเข้ายอด';
      } catch (e) { message.textContent = e.message; draw(); }
      finally { check.disabled = false; file.disabled = false; channel.disabled = false; }
    };
    confirm.onclick=async function(){
      var selected=data.map(function(r,i){return r.selected?{index:i,correctNumber:r.status==='TRACKING_CANDIDATE',historical:r.status==='NOT_FOUND'}:null;}).filter(Boolean);
      if(!selected.length||!batchId)return;
      var totals={orders:0,income:0,adjustment:0};data.forEach(function(r){if(r.selected)totals[r.type]+=r.value;});
      if(!window.confirm('ยืนยัน '+selected.length+' รายการ\nยอดขาย '+totals.orders.toFixed(2)+'\nรับสุทธิ '+totals.income.toFixed(2)+'\nปรับปรุง '+totals.adjustment.toFixed(2)+' บาท\nรายการที่ไม่ได้เลือกจะไม่ถูกนำเข้า'))return;
      confirm.disabled=true;check.disabled=true;file.disabled=true;channel.disabled=true;output.inert=true;history.inert=true;
      try{var result=await api.read('documents.commit',{batchId:batchId,choices:selected});message.textContent='บันทึกแล้ว '+result.count+' รายการ แก้เลขออเดอร์ '+result.corrections+' รายการ ดูยอดได้ในสรุปรายปี';batchId=null;data.forEach(function(r){r.selected=false;});draw();loadHistory();}
      catch(e){message.textContent=e.message+' สามารถลองยืนยันรอบเดิมอีกครั้งได้ ระบบป้องกันยอดซ้ำ';}
      finally{check.disabled=false;file.disabled=false;channel.disabled=false;output.inert=false;history.inert=false;updateConfirm();}
    };
  }
  window.WmsDocumentImport = {mount: mount, parse: parse};
}());
