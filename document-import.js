/* Shopee review: reads locally, never writes stock or financial records. */
(function () {
  'use strict';
  function node(tag, text) { var e = document.createElement(tag); if (text != null) e.textContent = text; return e; }
  function normalized(v) { return String(v == null ? '' : v).trim().toUpperCase(); }
  function amount(v) { var n = Number(String(v).replace(/,/g, '')); if (!Number.isFinite(n)) throw new Error('พบจำนวนเงินที่อ่านไม่ได้'); return n; }
  function parse(workbook, name) {
    var result = [];
    workbook.SheetNames.forEach(function (sheet) {
      var rows = XLSX.utils.sheet_to_json(workbook.Sheets[sheet], {header: 1, defval: '', raw: false});
      var head = rows.findIndex(function (r) { return r.indexOf('หมายเลขคำสั่งซื้อ') >= 0; });
      if (head < 0) return;
      var headers = rows[head], index = function (key) { return headers.indexOf(key); };
      var income = index('จำนวนเงินทั้งหมดที่โอนแล้ว (฿)') >= 0;
      var order = index('หมายเลขคำสั่งซื้อ'), tracking = index('*หมายเลขติดตามพัสดุ');
      if (!income && index('ราคาขายสุทธิ') < 0) return;
      var groups = {};
      rows.slice(head + 1).forEach(function (r, i) {
        var id = normalized(r[order]); if (!id) return;
        if (!/^[A-Z0-9_-]{1,80}$/.test(id)) throw new Error('เลขออเดอร์ผิดรูปแบบ แถว ' + (head + i + 2));
        var key = (income ? 'income:' : 'orders:') + id;
        if (income && groups[key]) throw new Error('รายงานรายรับมีเลขออเดอร์ซ้ำ กรุณาตรวจ ' + id);
        var g = groups[key] || (groups[key] = {orderNo: id, trackingNo: '', type: income ? 'income' : 'orders', value: 0, lines: 0, source: name, date: String(r[index(income ? 'วันที่โอนชำระเงินสำเร็จ' : 'วันที่ทำการสั่งซื้อ')] || '')});
        if (tracking >= 0 && r[tracking]) {
          var t = normalized(r[tracking]); if (g.trackingNo && g.trackingNo !== t) throw new Error('พบหลายเลขพัสดุในออเดอร์ ' + id);
          g.trackingNo = t;
        }
        g.value += amount(r[index(income ? 'จำนวนเงินทั้งหมดที่โอนแล้ว (฿)' : 'ราคาขายสุทธิ')]); g.lines++;
      });
      Object.keys(groups).forEach(function (key) { result.push(groups[key]); });
    });
    if (!result.length) throw new Error('ไม่พบตารางออเดอร์หรือรายรับ Shopee ที่รองรับ');
    return result;
  }
  function mount(root, api) {
    var data = [], revision = 0;
    var card = node('div'); card.className = 'card';
    card.appendChild(node('h2', '1. เลือกเอกสาร Shopee'));
    card.appendChild(node('p', 'เลือกไฟล์ออเดอร์และรายรับพร้อมกันได้ ระบบอ่านไฟล์เพื่อให้ตรวจทานก่อน ขั้นตอนนี้ยังไม่บันทึกยอดจริง'));
    var channel = node('select'); channel.className = 'input';
    api.channels.forEach(function (c) { var o = node('option', c.name); o.value = c.channelId; channel.appendChild(o); });
    card.appendChild(channel);
    var file = node('input'); file.type = 'file'; file.accept = '.xlsx'; file.multiple = true; card.appendChild(file);
    var message = node('p'); message.setAttribute('role', 'status'); card.appendChild(message);
    var check = node('button', '2. ตรวจจับคู่กับ WMS'); check.className = 'btn btn-primary btn-block'; check.disabled = true; card.appendChild(check);
    var output = node('div'); root.appendChild(card); root.appendChild(output);
    function draw() {
      output.replaceChildren();
      ['orders', 'income'].forEach(function (type) {
        var list = data.filter(function (r) { return r.type === type; }); if (!list.length) return;
        var c = node('div'); c.className = 'card';
        c.appendChild(node('h2', (type === 'income' ? 'ยอดโอนสุทธิ' : 'ยอดขายสุทธิสินค้า') + ' — ' + list.length + ' ออเดอร์'));
        c.appendChild(node('p', 'รวม ' + list.reduce(function (sum, r) { return sum + r.value; }, 0).toLocaleString('th-TH', {minimumFractionDigits: 2}) + ' บาท'));
        var wrap = node('div'); wrap.style.overflowX = 'auto'; var table = node('table');
        var tr = node('tr'); ['วันที่ในรายงาน', 'เลขออเดอร์', 'เลขพัสดุ', 'ยอดจากไฟล์', 'ผลตรวจ'].forEach(function (h) { tr.appendChild(node('th', h)); }); table.appendChild(tr);
        list.forEach(function (r) { var tr = node('tr'); [r.date, r.orderNo, r.trackingNo || '—', r.value.toFixed(2), r.status || 'รอตรวจ'].forEach(function (v) { tr.appendChild(node('td', v)); }); table.appendChild(tr); });
        wrap.appendChild(table); c.appendChild(wrap); output.appendChild(c);
      });
      output.appendChild(node('p', 'ยอดโอนสุทธิหักค่าธรรมเนียมแล้ว ไม่หักซ้ำ • รายการ Adjustment ยังต้องตรวจแยก • การตรวจจับคู่ไม่เปลี่ยนเลขออเดอร์หรือตัดสต็อก'));
    }
    file.onchange = async function () {
      var current = ++revision; data = []; check.disabled = true; message.textContent = 'กำลังอ่านไฟล์…'; output.replaceChildren();
      try {
        var all = [], seen = new Set();
        for (var f of file.files) {
          if (f.size > 10 * 1024 * 1024) throw new Error('รองรับไฟล์ขนาดไม่เกิน 10 MB');
          var parsed = parse(XLSX.read(await f.arrayBuffer(), {type: 'array'}), f.name);
          parsed.forEach(function (r) { var k = r.type + ':' + r.orderNo; if (seen.has(k)) throw new Error('พบออเดอร์ซ้ำข้ามไฟล์: ' + r.orderNo); seen.add(k); all.push(r); });
        }
        if (current !== revision) return;
        if (all.length > 500) throw new Error('ตรวจได้ครั้งละไม่เกิน 500 รายการ');
        data = all; draw(); check.disabled = !all.length || !channel.value; message.textContent = 'อ่านแล้ว ' + all.length + ' รายการ กรุณาเลือกช่องทางให้ถูกต้องก่อนตรวจ';
      } catch (e) { if (current === revision) message.textContent = e.message; }
    };
    channel.onchange = function () { revision++; data.forEach(function (r) { delete r.status; }); draw(); check.disabled = !data.length; };
    check.onclick = async function () {
      var current = ++revision, selected = channel.value; check.disabled = true; file.disabled = true; channel.disabled = true;
      var cache = new Map();
      async function lookup(no) {
        if (!cache.has(no)) cache.set(no, api.read('order.get', {channelId: selected, orderNo: no}).then(function (d) { return d.order; }).catch(function (e) { if (e.code === 'ORDER_NOT_FOUND') return null; throw e; }));
        return cache.get(no);
      }
      try {
        for (var i = 0; i < data.length; i++) {
          message.textContent = 'กำลังตรวจ ' + (i + 1) + '/' + data.length;
          var r = data[i], order = await lookup(r.orderNo);
          if (order) r.status = order.status === 'CANCELLED' ? 'ออเดอร์ถูกยกเลิก — ต้องตรวจ' : 'พบเลขออเดอร์ตรงกัน — รอตรวจยอด';
          else if (r.trackingNo && await lookup(r.trackingNo)) r.status = 'พบเลขพัสดุในช่องเลขออเดอร์ — ต้องยืนยันแก้';
          else r.status = 'ไม่พบออเดอร์ — ต้องตรวจ';
          if (current !== revision) return;
        }
        draw(); message.textContent = 'ตรวจจับคู่เสร็จแล้ว ผลนี้ยังไม่ใช่การยืนยันนำเข้ายอด';
      } catch (e) { message.textContent = e.message; draw(); }
      finally { check.disabled = false; file.disabled = false; channel.disabled = false; }
    };
  }
  window.WmsDocumentImport = {mount: mount, parse: parse};
}());
