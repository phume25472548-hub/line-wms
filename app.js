/* LINE WMS — LIFF Frontend (Vanilla JS)
 * หน้าจอทั้งหมดของพนักงาน: รับเข้า ขายออก รับคืน ส่งคืน ตัดเสีย เช็กสต๊อก ตรวจนับ ประวัติ Dashboard ตั้งค่า และการเงิน (ADMIN)
 * หลักความปลอดภัย: หน้าจอส่งเฉพาะ LINE ID Token ไปให้ Server ตรวจ ไม่ส่ง/ไม่เชื่อ User ID เอง
 */
(function () {
  'use strict';

  var C = window.APP_CONFIG || {};
  var State = { user: null, perms: {}, settings: {}, channels: [], app: {} };

  var TX_LABEL = { IN: 'รับเข้า', OUT: 'ขายออก', RETURN: 'รับคืน', SUPPLIER_RETURN: 'ส่งคืนซัพพลายเออร์', WRITE_OFF: 'ตัดเสีย', ADJUST: 'ปรับยอด', TRANSFER: 'ย้ายสถานะ', CANCEL: 'ยกเลิกออเดอร์' };
  var STATUS_LABEL = { AVAILABLE: 'พร้อมขาย', INSPECTION: 'รอตรวจสอบ' };
  var ORDER_STATUS_LABEL = { COMPLETED: 'ตัดสต๊อกแล้ว', RETURNED_PARTIAL: 'คืนบางส่วน', RETURNED_FULL: 'คืนครบแล้ว', CANCELLED: 'ยกเลิกแล้ว' };
  var COND = [['GOOD', 'สภาพดี', 'เข้ายอดพร้อมขาย'], ['CHECK', 'ชำรุด รอตรวจ', 'เข้ายอดรอตรวจสอบ'], ['DAMAGED', 'เสียหาย', 'ตัดเสียทันที']];
  var ROLE_LABEL = { ADMIN: 'ผู้ดูแลระบบ', STAFF: 'พนักงาน', VIEWER: 'ดูอย่างเดียว' };

  /* ================================================================ */
  /* Icons (inline SVG)                                                */
  /* ================================================================ */
  var P = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    inbox: '<path d="M12 3v10m0 0l-4-4m4 4l4-4"/><path d="M4 13v5a2 2 0 002 2h12a2 2 0 002-2v-5"/>',
    cart: '<circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/><path d="M2 3h3l2.6 12.2a2 2 0 002 1.6h8.2a2 2 0 002-1.6L21 8H6"/>',
    undo: '<path d="M3 7v6h6"/><path d="M3 13a9 9 0 103-7.7L3 8"/>',
    truck: '<path d="M1 6h13v10H1z"/><path d="M14 10h4l3 3v3h-7"/><circle cx="5.5" cy="18" r="1.8"/><circle cx="17.5" cy="18" r="1.8"/>',
    trash: '<path d="M3 6h18M8 6V4h8v2m1 0l-1 14H8L7 6"/>',
    search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
    clip: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 11h6M9 15h4"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    check: '<path d="M20 6L9 17l-5-5"/>',
    shield: '<path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
    xc: '<circle cx="12" cy="12" r="9"/><path d="M15 9l-6 6M9 9l6 6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 00.3 1.8l.1.1a2 2 0 11-2.8 2.8l-.1-.1a1.7 1.7 0 00-1.8-.3 1.7 1.7 0 00-1 1.5V21a2 2 0 11-4 0v-.1a1.7 1.7 0 00-1.1-1.5 1.7 1.7 0 00-1.8.3l-.1.1a2 2 0 11-2.8-2.8l.1-.1a1.7 1.7 0 00.3-1.8 1.7 1.7 0 00-1.5-1H3a2 2 0 110-4h.1a1.7 1.7 0 001.5-1.1 1.7 1.7 0 00-.3-1.8l-.1-.1a2 2 0 112.8-2.8l.1.1a1.7 1.7 0 001.8.3H9a1.7 1.7 0 001-1.5V3a2 2 0 114 0v.1a1.7 1.7 0 001 1.5 1.7 1.7 0 001.8-.3l.1-.1a2 2 0 112.8 2.8l-.1.1a1.7 1.7 0 00-.3 1.8V9a1.7 1.7 0 001.5 1H21a2 2 0 110 4h-.1a1.7 1.7 0 00-1.5 1z"/>',
    scan: '<path d="M3 7V5a2 2 0 012-2h2M17 3h2a2 2 0 012 2v2M21 17v2a2 2 0 01-2 2h-2M7 21H5a2 2 0 01-2-2v-2"/><path d="M7 8v8M10 8v8M13 8v8M17 8v8"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    x: '<path d="M18 6L6 18M6 6l12 12"/>',
    alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L1.8 18a2 2 0 001.7 3h17a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
    refresh: '<path d="M21 12a9 9 0 11-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
    home: '<path d="M3 11l9-8 9 8v9a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z"/>',
    coin: '<circle cx="12" cy="12" r="9"/><path d="M15 9.5c-.4-1-1.6-1.6-3-1.6-1.7 0-3 .9-3 2.1s1.3 1.8 3 2.1 3 .9 3 2.1-1.3 2.1-3 2.1c-1.4 0-2.6-.6-3-1.6M12 6v2m0 8v2"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    chev: '<path d="M9 6l6 6-6 6"/>'
  };
  function icon(name) {
    var s = document.createElement('span');
    s.style.display = 'contents';
    s.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (P[name] || '') + '</svg>';
    return s.firstChild;
  }

  /* ================================================================ */
  /* DOM helpers (ข้อความจากผู้ใช้/ระบบใส่เป็น textNode เสมอ กัน XSS)    */
  /* ================================================================ */
  function el(tag, props) {
    var e = document.createElement(tag);
    if (props) {
      Object.keys(props).forEach(function (k) {
        var v = props[k];
        if (v == null || v === false) return;
        if (k === 'class') e.className = v;
        else if (k === 'style') e.style.cssText = v;
        else if (k.indexOf('on') === 0 && typeof v === 'function') e.addEventListener(k.substring(2), v);
        else if (k === 'dataset') Object.keys(v).forEach(function (d) { e.dataset[d] = v[d]; });
        else if (k === 'for') e.htmlFor = v;
        else if (/^(aria-|data-|role$|inputmode$|enterkeyhint$|autocapitalize$|autocomplete$|list$)/.test(k)) e.setAttribute(k, v === true ? '' : v);
        else e[k] = v;
      });
    }
    for (var i = 2; i < arguments.length; i++) append(e, arguments[i]);
    return e;
  }
  function append(parent, c) {
    if (c == null || c === false) return;
    if (Array.isArray(c)) { c.forEach(function (x) { append(parent, x); }); return; }
    parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  function clear(node) {
    // ถ้าช่องกรอกในส่วนที่จะลบกำลังโฟกัสอยู่ ให้ blur ก่อน (กัน event change ทำงานระหว่างลบ)
    var a = document.activeElement;
    if (a && a !== document.body && node.contains(a) && a.blur) a.blur();
    while (node.firstChild) node.removeChild(node.firstChild);
  }
  function $(sel, root) { return (root || document).querySelector(sel); }
  function fmt(n) { return Number(n || 0).toLocaleString('th-TH'); }
  function uuid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    var b = new Uint8Array(16); crypto.getRandomValues(b);
    return Array.prototype.map.call(b, function (x) { return ('0' + x.toString(16)).slice(-2); }).join('');
  }
  function todayStr(offsetDays) {
    var d = new Date(Date.now() - (offsetDays || 0) * 86400000);
    var tz = State.settings.TIMEZONE || 'Asia/Bangkok';
    try {
      return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
    } catch (e) { return d.toISOString().substring(0, 10); }
  }
  function list(v) { return String(v || '').split(',').map(function (s) { return s.trim(); }).filter(Boolean); }

  /* ================================================================ */
  /* Feedback: เสียง / สั่น / toast / sheet / busy                      */
  /* ================================================================ */
  var audioCtx = null;
  function beep(ok) {
    try {
      audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
      var o = audioCtx.createOscillator(), g = audioCtx.createGain();
      o.type = 'sine'; o.frequency.value = ok ? 1250 : 300;
      g.gain.setValueAtTime(0.18, audioCtx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + (ok ? 0.12 : 0.35));
      o.connect(g); g.connect(audioCtx.destination); o.start(); o.stop(audioCtx.currentTime + (ok ? 0.12 : 0.35));
    } catch (e) { /* ไม่มีเสียงก็ทำงานต่อได้ */ }
    try { if (navigator.vibrate) navigator.vibrate(ok ? 60 : [80, 60, 80]); } catch (e) { /* ignore */ }
  }
  var toastTimer = null;
  function toast(msg, type) {
    var old = $('.toast'); if (old) old.remove();
    var t = el('div', { class: 'toast ' + (type || ''), role: 'status' }, msg);
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.remove(); }, type === 'error' ? 4500 : 2500);
  }
  function overlayRoot() { return $('#overlay-root'); }

  /** แผ่นเลื่อนขึ้นจากด้านล่าง; build(close) คืน element เนื้อหา */
  function sheet(build, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      var done = false;
      var back = el('div', { class: 'backdrop' });
      function close(v) {
        if (done) return; done = true;
        back.remove(); resolve(v);
      }
      var body = el('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' });
      append(body, build(close));
      back.appendChild(body);
      if (!opts.locked) back.addEventListener('click', function (e) { if (e.target === back) close(undefined); });
      overlayRoot().appendChild(back);
      var f = body.querySelector('[autofocus]'); if (f) setTimeout(function () { f.focus(); if (f.select) f.select(); }, 60);
    });
  }
  function alertSheet(title, message, kind) {
    return sheet(function (close) {
      return [
        el('div', { class: 'row' }, kind === 'error' ? el('span', { style: 'color:var(--danger)' }, icon('alert')) : null, el('h2', { class: 'grow' }, title)),
        el('div', { class: 'msg' }, message),
        el('div', { class: 'actions' }, el('button', { class: 'btn btn-primary btn-block', onclick: function () { close(true); } }, 'ตกลง'))
      ];
    });
  }
  function confirmSheet(cfg) {
    return sheet(function (close) {
      var lines = cfg.lines || [];
      var total = lines.reduce(function (s, l) { return s + (Number(l.qty) || 0); }, 0);
      return [
        el('h2', null, cfg.title),
        cfg.banner ? el('div', { class: 'banner ' + (cfg.bannerKind || 'info') }, icon('alert'), el('div', null, cfg.banner)) : null,
        cfg.rows ? el('dl', { class: 'kv' }, cfg.rows.map(function (r) { return [el('dt', null, r[0]), el('dd', null, r[1])]; })) : null,
        lines.length ? el('div', { class: 'card', style: 'box-shadow:none;background:var(--bg)' },
          lines.map(function (l) {
            return el('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
              el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, l.name), el('div', { class: 'small muted mono' }, l.sku + (l.extra ? ' · ' + l.extra : ''))),
              el('div', { style: 'font-weight:700;font-size:18px' }, (l.sign || '') + fmt(l.qty) + ' ' + (l.unit || '')));
          }),
          el('div', { class: 'summary-total', style: 'padding-top:8px' }, el('span', null, 'รวม ' + lines.length + ' รายการ'), el('span', null, fmt(total) + ' หน่วย'))) : null,
        el('div', { class: 'actions' },
          el('button', { class: 'btn btn-lg btn-block ' + (cfg.danger ? 'btn-danger' : 'btn-primary'), onclick: function (e) { e.currentTarget.disabled = true; close(true); } }, icon('check'), cfg.confirmText || 'ยืนยันบันทึก'),
          el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, 'กลับไปแก้ไข'))
      ];
    });
  }
  var busyEl = null;
  function busy(msg) {
    if (!busyEl) { busyEl = el('div', { class: 'busy' }, el('div', { class: 'spinner' }), el('div', { class: 'busy-msg' })); document.body.appendChild(busyEl); }
    busyEl.querySelector('.busy-msg').textContent = msg || 'กำลังโหลด…';
  }
  function unbusy() { if (busyEl) { busyEl.remove(); busyEl = null; } }

  /* ================================================================ */
  /* Auth (LIFF)                                                        */
  /* ================================================================ */
  var Auth = {
    init: function () {
      if (!window.liff) return Promise.reject(appErr('LIFF_MISSING', 'โหลด LINE LIFF SDK ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วเปิดใหม่'));
      return liff.init({ liffId: C.LIFF_ID }).then(function () {
        if (!liff.isLoggedIn()) {
          liff.login({ redirectUri: location.href });
          return new Promise(function () { /* กำลังไปหน้า Login */ });
        }
      });
    },
    token: function () { return liff.getIDToken(); },
    fresh: function () {
      try { var d = liff.getDecodedIDToken(); return !!(d && d.exp * 1000 > Date.now() + 30000); } catch (e) { return false; }
    },
    relogin: function () {
      var n = Number(sessionStorage.getItem('wms_relogin') || 0);
      if (n >= 2) {
        sessionStorage.removeItem('wms_relogin');
        return alertSheet('เข้าสู่ระบบไม่สำเร็จ', 'กรุณาปิดหน้าจอนี้แล้วเปิดเมนูคลังสินค้าใน LINE ใหม่อีกครั้ง', 'error');
      }
      sessionStorage.setItem('wms_relogin', String(n + 1));
      busy('กำลังเข้าสู่ระบบใหม่…');
      if (liff.isInClient()) location.reload();
      else { liff.logout(); liff.login({ redirectUri: location.href }); }
      return new Promise(function () { });
    }
  };

  /* ================================================================ */
  /* API client — อ่าน / เขียน (กันบันทึกซ้ำด้วย Request ID)              */
  /* ================================================================ */
  function appErr(code, message, details, extra) {
    var e = new Error(message); e.code = code; e.details = details || null;
    if (extra) Object.keys(extra).forEach(function (k) { e[k] = extra[k]; });
    return e;
  }
  var Api = {
    raw: function (action, payload, requestId) {
      var ctl = window.AbortController ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctl) ctl.abort(); }, C.REQUEST_TIMEOUT_MS || 30000);
      var body = JSON.stringify({ action: action, idToken: Auth.token(), requestId: requestId, payload: payload || {} });
      // ไม่ตั้ง Content-Type เอง → เบราว์เซอร์ใช้ text/plain = ไม่มี CORS preflight (Apps Script รองรับ)
      return fetch(C.API_URL, { method: 'POST', body: body, redirect: 'follow', signal: ctl ? ctl.signal : undefined, cache: 'no-store' })
        .then(function (res) { return res.text(); })
        .then(function (text) {
          clearTimeout(timer);
          var json;
          try { json = JSON.parse(text); } catch (e) { throw appErr('BAD_RESPONSE', 'เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง', null, { network: true }); }
          if (!json.ok) throw appErr(json.error.code, json.error.message, json.error.details);
          return json;
        }, function (err) {
          clearTimeout(timer);
          if (err && err.code) throw err;
          throw appErr('NETWORK', 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต', null, { network: true });
        });
    },
    read: function (action, payload) {
      return Api.raw(action, payload).then(function (j) { return j.data; }).catch(function (e) {
        if (e.code === 'AUTH_EXPIRED') return Auth.relogin();
        throw e;
      });
    },
    /** เขียนข้อมูล: ลองซ้ำอัตโนมัติด้วย Request ID เดิม (Server ไม่บันทึกซ้ำ) */
    write: function (action, payload, requestId) {
      var attempt = 0;
      function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
      function poll(n) {
        return Api.raw('request.status', { requestId: requestId }).then(function (j) {
          if (j.data.status === 'DONE') return { data: j.data.data, replay: true };
          if (n <= 0) throw appErr('UNCERTAIN', 'ยังไม่ทราบผลการบันทึก', null, { uncertain: true });
          return sleep(2000).then(function () { return poll(n - 1); });
        }, function (e) {
          if (n <= 0) throw appErr('UNCERTAIN', 'ยังไม่ทราบผลการบันทึก', null, { uncertain: true });
          return sleep(2000).then(function () { return poll(n - 1); });
        });
      }
      function go() {
        attempt++;
        return Api.raw(action, payload, requestId).then(function (j) { return { data: j.data, replay: !!j.replay }; }, function (e) {
          if (e.network) {
            if (attempt < 3) { busy('สัญญาณไม่ดี กำลังลองส่งอีกครั้ง (' + attempt + '/2)…'); return sleep(1500 * attempt).then(go); }
            return poll(2);
          }
          if (e.code === 'BUSY' && attempt < 4) { busy('มีพนักงานอื่นกำลังบันทึก รอสักครู่…'); return sleep(1500).then(go); }
          if (e.code === 'UNCERTAIN') { busy('กำลังตรวจสอบผลการบันทึก…'); return sleep(1500).then(function () { return poll(3); }); }
          throw e;
        });
      }
      return go();
    }
  };

  /** รายการที่กำลังบันทึก — เก็บไว้ในเครื่องจนกว่าจะรู้ผลแน่ชัด */
  var Pending = {
    key: 'wms_pending_write',
    get: function () { try { return JSON.parse(localStorage.getItem(this.key) || 'null'); } catch (e) { return null; } },
    set: function (v) { try { localStorage.setItem(this.key, JSON.stringify(v)); } catch (e) { /* โหมดส่วนตัว */ } },
    clear: function () { try { localStorage.removeItem(this.key); } catch (e) { /* ignore */ } }
  };

  var productCache = {};
  /**
   * ส่งรายการบันทึก — แสดงว่าสำเร็จเฉพาะเมื่อ Server ยืนยันแล้วเท่านั้น
   * คืนค่า data เมื่อสำเร็จ / throw เมื่อ Server ปฏิเสธ / คืน null เมื่อยังไม่ทราบผล
   */
  function submitWrite(action, payload, label, requestId) {
    var rid = requestId || uuid();
    Pending.set({ requestId: rid, action: action, payload: payload, label: label, at: Date.now() });
    busy('กำลังบันทึก… ห้ามปิดหน้าจอ');
    return Api.write(action, payload, rid).then(function (r) {
      Pending.clear(); unbusy(); productCache = {};
      if (r.replay) toast('รายการนี้ถูกบันทึกไว้แล้ว (ไม่บันทึกซ้ำ)', 'ok');
      return r.data;
    }, function (e) {
      unbusy();
      if (e.uncertain) {
        return sheet(function (close) {
          return [
            el('h2', null, 'ยังไม่ทราบผลการบันทึก'),
            el('div', { class: 'banner warn' }, icon('alert'), el('div', null, 'สัญญาณขาดระหว่างบันทึก "' + label + '" ระบบเก็บรายการไว้แล้ว กดตรวจสอบสถานะได้เลย ห้ามทำรายการเดิมซ้ำด้วยมือ')),
            el('div', { class: 'actions' },
              el('button', { class: 'btn btn-primary btn-block', onclick: function () { close('check'); } }, icon('refresh'), 'ตรวจสอบสถานะ'),
              el('button', { class: 'btn btn-outline btn-block', onclick: function () { close('later'); } }, 'ไว้ตรวจทีหลัง'))
          ];
        }, { locked: true }).then(function (choice) {
          if (choice === 'check') return checkPending(true);
          return null;
        });
      }
      if (e.code === 'AUTH_EXPIRED') { return Auth.relogin(); }  // รายการยังเก็บไว้ จะถามส่งซ้ำหลังเข้าสู่ระบบ
      Pending.clear();
      throw e;
    });
  }

  /** ตรวจรายการค้างจากครั้งก่อน (เน็ตหลุด/ปิดแอประหว่างบันทึก) */
  function checkPending(interactive) {
    var p = Pending.get();
    if (!p) return Promise.resolve(null);
    busy('กำลังตรวจสอบรายการล่าสุด…');
    return Api.raw('request.status', { requestId: p.requestId }).then(function (j) {
      unbusy();
      if (j.data.status === 'DONE') {
        Pending.clear(); productCache = {};
        return alertSheet('บันทึกสำเร็จแล้ว', '"' + p.label + '" ถูกบันทึกเรียบร้อย' + resultRef(j.data.data)).then(function () { return j.data.data; });
      }
      return sheet(function (close) {
        return [
          el('h2', null, 'รายการยังไม่ถูกบันทึก'),
          el('div', { class: 'msg' }, '"' + p.label + '" ยังไม่พบในระบบ ต้องการส่งรายการเดิมอีกครั้งหรือไม่?\n(ระบบใช้รหัสคำขอเดิม จึงไม่บันทึกซ้ำแน่นอน)'),
          el('div', { class: 'actions' },
            el('button', { class: 'btn btn-primary btn-block', onclick: function () { close('resend'); } }, 'ส่งรายการเดิมอีกครั้ง'),
            el('button', { class: 'btn btn-outline btn-block', onclick: function () { close('drop'); } }, 'ยกเลิกรายการนี้'))
        ];
      }, { locked: true }).then(function (c) {
        if (c === 'resend') {
          return submitWrite(p.action, p.payload, p.label, p.requestId).then(function (d) {
            if (d) return alertSheet('บันทึกสำเร็จ', '"' + p.label + '" บันทึกเรียบร้อย' + resultRef(d)).then(function () { return d; });
            return null;
          }).catch(showError);
        }
        Pending.clear();
        return null;
      });
    }, function (e) {
      unbusy();
      if (interactive) toast('ยังตรวจสอบไม่ได้: ' + e.message, 'error');
      return null;
    });
  }
  function resultRef(d) {
    if (!d) return '';
    return d.orderNo ? '\nเลขออเดอร์: ' + d.orderNo : (d.docNo ? '\nเลขเอกสาร: ' + d.docNo : '');
  }

  function showError(e) {
    unbusy();
    if (!e) return;
    beep(false);
    var title = {
      INSUFFICIENT_STOCK: 'สต๊อกไม่พอ', DUPLICATE_ORDER: 'ออเดอร์ซ้ำ', SKU_NOT_FOUND: 'ไม่พบสินค้า', FORBIDDEN: 'ไม่มีสิทธิ์',
      RETURN_EXCEEDS: 'รับคืนเกินจำนวน', STALE_BALANCE: 'ยอดในระบบเปลี่ยน', NETWORK: 'เชื่อมต่อไม่ได้', BUSY: 'ระบบไม่ว่าง'
    }[e.code] || 'ทำรายการไม่สำเร็จ';
    return alertSheet(title, e.message || String(e), 'error');
  }

  /* ================================================================ */
  /* Navigation                                                         */
  /* ================================================================ */
  var stack = [];
  function go(viewFn, arg) {
    stack.push([viewFn, arg]);
    try { history.pushState({ d: stack.length }, ''); } catch (e) { /* ignore */ }
    render();
  }
  function back() {
    if (stack.length > 1) { stack.pop(); render(); }
  }
  function home() { stack = stack.slice(0, 1); render(); }
  function render() {
    Scanner.close();
    var top = stack[stack.length - 1];
    var app = $('#app'); clear(app);
    window.scrollTo(0, 0);
    top[0](app, top[1]);
  }
  window.addEventListener('popstate', function () { if (stack.length > 1) { stack.pop(); render(); } });

  function topbar(title, actions) {
    return el('div', { class: 'topbar' },
      el('button', { class: 'icon-btn', 'aria-label': 'ย้อนกลับ', onclick: function () { history.length > 1 ? history.back() : back(); } }, icon('back')),
      el('h1', null, title), actions || null);
  }
  function page(app, title, content, footer, actions) {
    var pg = el('div', { class: 'page' });
    append(pg, content);
    append(app, [topbar(title, actions), pg]);
    if (footer) app.appendChild(el('div', { class: 'footer-bar' }, el('div', { class: 'inner' }, footer)));
    return pg;
  }

  /* ================================================================ */
  /* Scanner — กล้องมือถือ (html5-qrcode) + สำรองด้วย liff.scanCodeV2     */
  /* ================================================================ */
  var Scanner = {
    q: null, node: null, lastCode: '', lastAt: 0, onCode: null, continuous: false,
    open: function (cfg) {
      var self = this;
      this.close();
      this.onCode = cfg.onCode; this.continuous = !!cfg.continuous; this.lastCode = ''; this.lastAt = 0;
      var last = el('div', { class: 'last', id: 'scan-last' }, cfg.continuous ? 'โหมดสแกนต่อเนื่อง: สแกนทีละชิ้น ระบบนับให้อัตโนมัติ' : 'เล็งบาร์โค้ด/QR ให้อยู่ในกรอบ');
      var manual = el('input', { class: 'input', placeholder: 'หรือพิมพ์รหัส แล้วกด Enter', autocapitalize: 'characters', autocomplete: 'off', enterkeyhint: 'go' });
      manual.addEventListener('keydown', function (e) {
        if (e.key === 'Enter') { e.preventDefault(); var v = manual.value.trim(); manual.value = ''; if (v) self.hit(v, true); }
      });
      this.node = el('div', { class: 'scanner', role: 'dialog', 'aria-label': 'สแกน' },
        el('div', { class: 'head' }, el('h2', null, cfg.title || 'สแกน'),
          el('button', { class: 'icon-btn', 'aria-label': 'ปิดกล้อง', onclick: function () { self.close(); } }, icon('x'))),
        el('div', { class: 'cam' }, el('div', { id: 'qr-reader' })),
        last,
        el('div', { class: 'bottom' }, manual,
          el('button', { class: 'btn btn-block', style: 'background:#fff;color:#111', onclick: function () { self.close(); } }, cfg.continuous ? 'เสร็จสิ้นการสแกน' : 'ปิด')));
      document.body.appendChild(this.node);
      this.start();
    },
    start: function () {
      var self = this;
      if (!window.Html5Qrcode) return this.fallback('ไม่พบตัวสแกน (โหลดไลบรารีไม่สำเร็จ)');
      var F = window.Html5QrcodeSupportedFormats || {};
      var formats = ['QR_CODE', 'CODE_128', 'CODE_39', 'CODE_93', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E', 'ITF', 'CODABAR', 'DATA_MATRIX']
        .map(function (k) { return F[k]; }).filter(function (v) { return v !== undefined; });
      try {
        this.q = new Html5Qrcode('qr-reader', { formatsToSupport: formats, verbose: false, experimentalFeatures: { useBarCodeDetectorIfSupported: true } });
      } catch (e) { return this.fallback(e.message); }
      this.q.start({ facingMode: 'environment' }, {
        fps: 12,
        qrbox: function (w, h) { var s = Math.min(w, h); return { width: Math.floor(w * 0.86), height: Math.floor(s * 0.55) }; },
        aspectRatio: 1.333
      }, function (text) { self.hit(text, false); }, function () { /* ยังไม่เจอโค้ด */ })
        .catch(function (err) { self.q = null; self.fallback(String(err && err.message || err)); });
    },
    fallback: function (reason) {
      var self = this;
      var cam = this.node && this.node.querySelector('.cam');
      if (!cam) return;
      clear(cam);
      var canLiff = window.liff && liff.isApiAvailable && liff.isApiAvailable('scanCodeV2');
      append(cam, el('div', { class: 'cam-msg' },
        el('p', null, 'เปิดกล้องไม่ได้ — กรุณาอนุญาตการใช้กล้องให้ LINE หรือพิมพ์รหัสด้านล่าง / ใช้เครื่องสแกนบลูทูธ'),
        el('p', { class: 'small', style: 'opacity:.7' }, reason || ''),
        canLiff ? el('button', { class: 'btn btn-primary', onclick: function () {
          liff.scanCodeV2().then(function (r) { if (r && r.value) self.hit(r.value, true); }).catch(function (e) { toast(e.message, 'error'); });
        } }, icon('scan'), 'ใช้ตัวสแกน QR ของ LINE') : null));
    },
    hit: function (text, manual) {
      var code = String(text || '').trim();
      if (!code) return;
      var now = Date.now();
      // กันอ่านโค้ดเดิมซ้ำ: ถ้าบาร์โค้ดเดิมยังค้างอยู่หน้ากล้อง จะไม่นับเพิ่ม ต้องเอาออกจากกล้องก่อน (> 1.2 วินาที) จึงนับใหม่
      if (!manual && code === this.lastCode && now - this.lastAt < 1200) { this.lastAt = now; return; }
      this.lastCode = code; this.lastAt = now;
      var cb = this.onCode;
      if (!this.continuous) this.close();
      if (cb) cb(code);
    },
    status: function (msg, ok) {
      var l = document.getElementById('scan-last');
      if (l) { l.textContent = msg; l.className = 'last ' + (ok ? 'ok' : 'bad'); }
    },
    close: function () {
      var q = this.q, node = this.node;
      this.q = null; this.node = null;
      if (q) { try { q.stop().then(function () { try { q.clear(); } catch (e) { /* */ } }).catch(function () { }); } catch (e) { /* */ } }
      if (node) node.remove();
    },
    isOpen: function () { return !!this.node; }
  };

  /* ================================================================ */
  /* สินค้า: ค้นหา / ไม่พบ / สร้างใหม่ / ถามจำนวน                         */
  /* ================================================================ */
  function lookupProduct(code) {
    var sku = String(code).trim().toUpperCase();
    if (productCache[sku]) return Promise.resolve(productCache[sku]);
    return Api.read('product.get', { sku: sku }).then(function (d) {
      if (d.found) { productCache[sku] = d.product; return d.product; }
      return { notFound: true, sku: d.sku || sku };
    });
  }

  function notFoundSheet(sku) {
    beep(false);
    return sheet(function (close) {
      return [
        el('h2', null, 'ไม่พบสินค้าในระบบ'),
        el('div', { class: 'msg' }, 'รหัส "' + sku + '" ยังไม่มีในระบบ ตรวจสอบว่าสแกนถูกชิ้น หรือสร้างเป็นสินค้าใหม่'),
        el('div', { class: 'actions' },
          State.perms.write ? el('button', { class: 'btn btn-primary btn-block', onclick: function () { close('create'); } }, icon('plus'), 'สร้างสินค้าใหม่') : null,
          el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(null); } }, 'ปิด'))
      ];
    }).then(function (c) { return c === 'create' ? productForm({ sku: sku }, true) : null; });
  }

  /** ฟอร์มสร้าง/แก้ไขสินค้า → คืน product view เมื่อบันทึกสำเร็จ */
  function productForm(p, isNew) {
    p = p || {};
    return sheet(function (close) {
      var f = {
        sku: el('input', { class: 'input mono', value: p.sku || '', readOnly: !isNew, autocapitalize: 'characters', autocomplete: 'off' }),
        name: el('input', { class: 'input', value: p.name || '', placeholder: 'เช่น เครื่องพิมพ์ใบปะหน้า 80mm', autofocus: true }),
        category: el('input', { class: 'input', value: p.category || '', placeholder: 'หมวดหมู่ (ไม่บังคับ)' }),
        unit: el('input', { class: 'input', value: p.unit || 'ชิ้น' }),
        min: el('input', { class: 'input', type: 'number', inputmode: 'numeric', value: p.minStock != null ? p.minStock : '', placeholder: 'ค่าเริ่มต้นตามตั้งค่า' }),
        active: el('input', { type: 'checkbox', checked: p.active !== false, style: 'width:22px;height:22px' })
      };
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-lg btn-block' }, 'บันทึกสินค้า');
      save.addEventListener('click', function () {
        err.textContent = '';
        if (!f.sku.value.trim() || !f.name.value.trim()) { err.textContent = 'กรุณากรอก SKU และชื่อสินค้า'; return; }
        save.disabled = true;
        var payload = { isNew: !!isNew, sku: f.sku.value.trim(), name: f.name.value.trim(), category: f.category.value.trim(), unit: f.unit.value.trim(), minStock: f.min.value, active: f.active.checked };
        submitWrite('product.save', payload, (isNew ? 'สร้างสินค้า ' : 'แก้ไขสินค้า ') + payload.sku).then(function (d) {
          if (!d) { close(null); return; }
          toast(d.message, 'ok');
          return lookupProduct(d.product.sku).then(function (pv) { close(pv); });
        }).catch(function (e) { save.disabled = false; err.textContent = e.message; beep(false); });
      });
      return [
        el('h2', null, isNew ? 'สร้างสินค้าใหม่' : 'แก้ไขสินค้า'),
        el('div', { class: 'field' }, el('label', null, 'SKU / บาร์โค้ด'), f.sku),
        el('div', { class: 'field' }, el('label', null, 'ชื่อสินค้า *'), f.name),
        el('div', { class: 'row' }, el('div', { class: 'field grow' }, el('label', null, 'หมวดหมู่'), f.category), el('div', { class: 'field', style: 'width:120px' }, el('label', null, 'หน่วย'), f.unit)),
        el('div', { class: 'field' }, el('label', null, 'แจ้งเตือนเมื่อพร้อมขายเหลือไม่เกิน'), f.min),
        el('label', { class: 'row' }, f.active, el('span', null, 'เปิดใช้งานสินค้านี้')),
        err,
        el('div', { class: 'actions' }, save, el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(null); } }, 'ยกเลิก'))
      ];
    });
  }

  /** ถามจำนวน (ปุ่มใหญ่ + ปุ่มลัด) */
  function askQty(product, initial, title) {
    return sheet(function (close) {
      var inp = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, step: 1, value: initial || 1, autofocus: true, style: 'font-size:32px;text-align:center;font-weight:700;min-height:68px' });
      var err = el('div', { class: 'err-text' });
      function ok() {
        var v = Number(inp.value);
        if (!v || v < 1 || Math.floor(v) !== v) { err.textContent = 'จำนวนต้องเป็นจำนวนเต็มมากกว่า 0'; beep(false); return; }
        close(v);
      }
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); ok(); } });
      function add(n) { return el('button', { class: 'chip', onclick: function () { inp.value = Math.max(1, (Number(inp.value) || 0) + n); } }, (n > 0 ? '+' : '') + n); }
      return [
        el('h2', null, title || 'ระบุจำนวน'),
        el('div', null, el('div', { style: 'font-weight:600' }, product.name), el('div', { class: 'small muted mono' }, product.sku + ' · พร้อมขาย ' + fmt(product.balance.available) + ' ' + product.unit)),
        inp, el('div', { class: 'chips' }, add(1), add(5), add(10), add(-1)), err,
        el('div', { class: 'actions' }, el('button', { class: 'btn btn-primary btn-lg btn-block', onclick: ok }, 'เพิ่มลงรายการ'),
          el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(null); } }, 'ยกเลิก'))
      ];
    });
  }

  /** ค้นหาสินค้าจากชื่อ */
  function productPicker(opts) {
    opts = opts || {};
    return sheet(function (close) {
      var res = el('div', { class: 'lines' }, el('div', { class: 'empty' }, 'พิมพ์ชื่อหรือรหัสสินค้าอย่างน้อย 2 ตัวอักษร'));
      var q = el('input', { class: 'input', placeholder: 'ค้นหาชื่อสินค้า / SKU', autofocus: true, enterkeyhint: 'search' });
      var timer = null, seq = 0;
      function run() {
        var term = q.value.trim();
        if (term.length < 2 && !opts.allowEmpty) return;
        var my = ++seq;
        clear(res); append(res, el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' })));
        Api.read('product.search', { q: term, includeInactive: !!opts.includeInactive }).then(function (d) {
          if (my !== seq) return;
          clear(res);
          if (!d.items.length) { append(res, el('div', { class: 'empty' }, 'ไม่พบสินค้า')); return; }
          d.items.forEach(function (p) {
            append(res, el('button', { class: 'list-btn', onclick: function () { productCache[p.sku] = p; close(p); } },
              el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, p.name), el('div', { class: 'small muted mono' }, p.sku + (p.active ? '' : ' · ปิดใช้งาน'))),
              el('div', { class: 'right' }, el('div', { style: 'font-weight:700' }, fmt(p.balance.available)), el('div', { class: 'small muted' }, 'พร้อมขาย'))));
          });
        }).catch(function (e) { clear(res); append(res, el('div', { class: 'err-text' }, e.message)); });
      }
      q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(run, 350); });
      q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); run(); } });
      if (opts.allowEmpty) setTimeout(run, 0);
      return [el('h2', null, 'ค้นหาสินค้า'), q, res, el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(null); } }, 'ปิด')];
    });
  }

  /** ช่องสแกน (รองรับเครื่องสแกนบลูทูธ: พิมพ์ + Enter) */
  function scanBar(cfg) {
    var input = el('input', { class: 'input mono', placeholder: cfg.placeholder || 'สแกน / พิมพ์รหัสสินค้า แล้วกด Enter', autocapitalize: 'characters', autocomplete: 'off', enterkeyhint: 'go', 'aria-label': cfg.placeholder || 'รหัสสินค้า' });
    input.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); var v = input.value.trim(); input.value = ''; if (v) cfg.onCode(v); }
    });
    var row = el('div', { class: 'row' },
      el('div', { class: 'grow' }, input),
      el('button', { class: 'btn btn-scan', 'aria-label': 'เปิดกล้องสแกน', onclick: function () { Scanner.open({ title: cfg.title || 'สแกนบาร์โค้ด', continuous: cfg.continuous ? cfg.continuous() : false, onCode: cfg.onCode }); } }, icon('scan')),
      cfg.search ? el('button', { class: 'btn btn-outline', style: 'padding:0 14px', 'aria-label': 'ค้นหาจากชื่อ', onclick: cfg.search }, icon('search')) : null);
    row.input = input;
    return row;
  }

  /* ================================================================ */
  /* Cart — รายการสินค้าหลาย SKU (ใช้กับขายออก รับเข้า ส่งคืน ตัดเสีย)   */
  /* ================================================================ */
  function Cart(opts) {
    opts = opts || {};
    var lines = [];
    var mode = State.settings.SCAN_MODE === 'EACH' ? 'EACH' : 'QTY';
    var listEl = el('div', { class: 'lines' });
    var queue = Promise.resolve();
    var self = {};

    function balanceOf(p) { return opts.checkStatus === 'INSPECTION' ? p.balance.inspection : p.balance.available; }
    function find(sku) { for (var i = 0; i < lines.length; i++) if (lines[i].product.sku === sku) return lines[i]; return null; }

    function addProduct(p, qty) {
      if (!p.active && opts.requireActive) { beep(false); toast('สินค้า ' + p.sku + ' ถูกปิดใช้งาน', 'error'); return; }
      var l = find(p.sku);
      if (l) l.qty += qty; else { l = { product: p, qty: qty }; lines.push(l); }
      beep(true);
      renderLines(p.sku);
      if (Scanner.isOpen()) Scanner.status('+' + qty + '  ' + p.name + '  (รวม ' + l.qty + ' ' + p.unit + ')', true);
      if (opts.onChange) opts.onChange();
    }

    function handleCode(code) {
      queue = queue.then(function () {
        return lookupProduct(code).then(function (p) {
          if (p.notFound) {
            if (Scanner.isOpen()) { Scanner.status('ไม่พบสินค้า ' + p.sku, false); beep(false); if (Scanner.continuous) return; Scanner.close(); }
            return notFoundSheet(p.sku).then(function (np) { if (np) return mode === 'EACH' ? addProduct(np, 1) : askQty(np).then(function (q) { if (q) addProduct(np, q); }); });
          }
          if (mode === 'EACH') return addProduct(p, 1);
          return askQty(p).then(function (q) { if (q) addProduct(p, q); });
        }).catch(function (e) { if (Scanner.isOpen()) Scanner.status(e.message, false); else showError(e); });
      });
      return queue;
    }

    function renderLines(flashSku) {
      clear(listEl);
      if (!lines.length) {
        append(listEl, el('div', { class: 'empty' }, icon('scan'), el('div', null, 'ยังไม่มีสินค้า — กดปุ่มกล้องเพื่อสแกน')));
        return;
      }
      lines.forEach(function (l, idx) {
        var p = l.product, bal = balanceOf(p);
        var qtyIn = el('input', { type: 'number', inputmode: 'numeric', value: l.qty, min: 1, 'aria-label': 'จำนวน ' + p.name });
        qtyIn.addEventListener('change', function () {
          var v = Math.floor(Number(qtyIn.value));
          if (!v || v < 1) { v = 1; }
          l.qty = v; renderLines(); if (opts.onChange) opts.onChange();
        });
        var over = opts.checkStatus && l.qty > bal;
        var node = el('div', { class: 'line' + (flashSku === p.sku ? ' flash' : '') },
          el('div', { class: 'top' },
            el('div', { class: 'grow' }, el('div', { class: 'name' }, p.name), el('div', { class: 'sku' }, p.sku)),
            el('button', { class: 'icon-btn del-btn', 'aria-label': 'ลบ ' + p.name, onclick: function () { lines.splice(idx, 1); renderLines(); if (opts.onChange) opts.onChange(); } }, icon('trash'))),
          el('div', { class: 'row' },
            el('div', { class: 'grow meta' }, (opts.checkStatus === 'INSPECTION' ? 'รอตรวจสอบ ' : 'พร้อมขาย ') + fmt(bal) + ' ' + p.unit,
              over ? el('div', { class: 'warn' }, 'เกินยอดคงเหลือ ' + fmt(l.qty - bal) + ' ' + p.unit) : null),
            el('div', { class: 'stepper' },
              el('button', { 'aria-label': 'ลด', onclick: function () { if (l.qty > 1) { l.qty--; renderLines(); if (opts.onChange) opts.onChange(); } } }, '−'),
              qtyIn,
              el('button', { 'aria-label': 'เพิ่ม', onclick: function () { l.qty++; renderLines(); if (opts.onChange) opts.onChange(); } }, '+'))));
        listEl.appendChild(node);
      });
    }

    var modeChips = el('div', { class: 'chips' });
    function renderMode() {
      clear(modeChips);
      [['QTY', 'สแกนแล้วกรอกจำนวน'], ['EACH', 'สแกนทีละชิ้น (+1)']].forEach(function (m) {
        append(modeChips, el('button', { class: 'chip' + (mode === m[0] ? ' on' : ''), onclick: function () { mode = m[0]; renderMode(); } }, m[1]));
      });
    }
    renderMode();
    var bar = scanBar({
      title: opts.scanTitle || 'สแกนสินค้า',
      continuous: function () { return mode === 'EACH'; },
      onCode: handleCode,
      search: function () { productPicker().then(function (p) { if (p) { if (mode === 'EACH') addProduct(p, 1); else askQty(p).then(function (q) { if (q) addProduct(p, q); }); } }); }
    });
    renderLines();

    self.el = el('div', { style: 'display:flex;flex-direction:column;gap:12px' }, bar, modeChips, listEl);
    self.focus = function () { bar.input.focus(); };
    self.lines = function () { return lines.map(function (l) { return { sku: l.product.sku, qty: l.qty }; }); };
    self.summary = function () { return lines.map(function (l) { return { sku: l.product.sku, name: l.product.name, unit: l.product.unit, qty: l.qty }; }); };
    self.count = function () { return lines.length; };
    self.total = function () { return lines.reduce(function (s, l) { return s + l.qty; }, 0); };
    self.overStock = function () { return opts.checkStatus ? lines.filter(function (l) { return l.qty > balanceOf(l.product); }) : []; };
    self.reset = function () { lines = []; renderLines(); if (opts.onChange) opts.onChange(); };
    return self;
  }

  /* ================================================================ */
  /* ส่วนประกอบฟอร์ม                                                    */
  /* ================================================================ */
  function selectField(label, options, value) {
    var s = el('select', { class: 'input' });
    options.forEach(function (o) {
      var v = Array.isArray(o) ? o[0] : o, t = Array.isArray(o) ? o[1] : o;
      append(s, el('option', { value: v, selected: v === value }, t));
    });
    var f = el('div', { class: 'field' }, el('label', null, label), s);
    f.input = s;
    return f;
  }
  function textField(label, placeholder, opts) {
    opts = opts || {};
    var i = opts.multiline ? el('textarea', { class: 'input', placeholder: placeholder || '', maxLength: opts.max || 300 })
      : el('input', { class: 'input', placeholder: placeholder || '', maxLength: opts.max || 200, value: opts.value || '' });
    var f = el('div', { class: 'field' }, el('label', null, label), i);
    f.input = i;
    return f;
  }
  function choiceGroup(options, value, onPick) {
    var wrap = el('div', { class: 'choice-grid' });
    var cur = value;
    function draw() {
      clear(wrap);
      options.forEach(function (o) {
        append(wrap, el('button', { class: 'choice' + (cur === o[0] ? ' on' : ''), onclick: function () { cur = o[0]; draw(); if (onPick) onPick(cur); } },
          o[1], o[2] ? el('small', null, o[2]) : null));
      });
    }
    draw();
    wrap.value = function () { return cur; };
    return wrap;
  }
  function stepsBar(n, total) {
    var s = el('div', { class: 'steps' });
    for (var i = 1; i <= total; i++) append(s, el('span', { class: i <= n ? 'on' : '' }));
    return s;
  }
  function productCard(p, extra) {
    return el('div', { class: 'card' },
      el('div', { style: 'font-weight:700;font-size:18px' }, p.name),
      el('div', { class: 'small muted mono', style: 'margin-bottom:10px' }, p.sku + (p.category ? ' · ' + p.category : '') + (p.active ? '' : ' · ปิดใช้งาน')),
      el('div', { class: 'stock-nums' },
        el('div', { class: 'n av' }, el('b', null, fmt(p.balance.available)), el('span', null, 'พร้อมขาย')),
        el('div', { class: 'n in' }, el('b', null, fmt(p.balance.inspection)), el('span', null, 'รอตรวจสอบ')),
        el('div', { class: 'n' }, el('b', null, fmt(p.balance.total)), el('span', null, 'รวม (' + p.unit + ')'))),
      p.minStock > 0 && p.balance.available <= p.minStock ? el('div', { class: 'banner warn', style: 'margin-top:10px' }, icon('alert'), el('div', null, 'ใกล้หมด (จุดแจ้งเตือน ' + fmt(p.minStock) + ')')) : null,
      extra || null);
  }
  function txRow(t) {
    var plus = t.qty > 0;
    return el('div', { class: 'tx' },
      el('div', { class: 'd' },
        el('div', { class: 'l1' }, (TX_LABEL[t.type] || t.type) + (t.subType && t.type !== 'OUT' ? ' · ' + subLabel(t) : '') + ' — ' + t.name),
        el('div', null, el('span', { class: 'mono' }, t.sku), ' · ', STATUS_LABEL[t.status] || t.status, t.reason ? ' · ' + t.reason : ''),
        el('div', { class: 'l2' }, t.at + ' · ' + t.user + (t.ref ? ' · ' + t.ref : '') + (t.note ? ' · ' + t.note : ''))),
      el('div', { class: 'q ' + (plus ? 'plus' : 'minus') }, (plus ? '+' : '') + fmt(t.qty), el('div', { class: 'small muted', style: 'font-weight:400' }, 'คงเหลือ ' + fmt(t.balanceAfter))));
  }
  function subLabel(t) {
    var m = { GOOD: 'สภาพดี', CHECK: 'รอตรวจ', DAMAGED: 'เสียหาย', RETURN_DAMAGED: 'ของคืนเสียหาย', INSPECTION_FAILED: 'ตรวจไม่ผ่าน', INSPECTION_TO_AVAILABLE: 'ตรวจผ่าน', MANUAL: '', COUNT_UP: 'นับได้เพิ่ม', COUNT_DOWN: 'นับได้ลด', ORDER_CANCEL: '', SALE: '' };
    return m[t.subType] != null ? m[t.subType] : t.subType;
  }
  function channelName(id) {
    for (var i = 0; i < State.channels.length; i++) if (State.channels[i].channelId === id) return State.channels[i].name;
    return id;
  }

  /** หน้าผลลัพธ์หลังบันทึกสำเร็จ (แสดงเมื่อ Server ยืนยันแล้วเท่านั้น) */
  function resultView(app, r) {
    beep(true);
    page(app, r.title, [
      el('div', { class: 'card result' },
        el('div', { class: 'big' }, icon('check')),
        el('h2', null, r.data.message || 'บันทึกเรียบร้อย'),
        r.refLabel ? el('div', { class: 'muted', style: 'margin-top:6px' }, r.refLabel) : null,
        r.ref ? el('div', { class: 'doc' }, r.ref) : null,
        r.sub ? el('div', { class: 'muted small', style: 'margin-top:4px' }, r.sub) : null),
      (r.data.lines || []).length ? el('div', { class: 'card' }, el('h3', null, 'ยอดคงเหลือหลังบันทึก'),
        r.data.lines.map(function (l) {
          return el('div', { class: 'row', style: 'padding:8px 0;border-bottom:1px solid var(--line)' },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, l.name), el('div', { class: 'small muted mono' }, l.sku + (l.conditionLabel ? ' · ' + l.conditionLabel : ''))),
            el('div', { class: 'right' }, el('div', { style: 'font-weight:700' }, (r.sign || '') + fmt(l.qty) + ' ' + l.unit),
              el('div', { class: 'small muted' }, 'พร้อมขาย ' + fmt(l.available) + (l.inspection ? ' · รอตรวจ ' + fmt(l.inspection) : ''))));
        })) : null
    ], [
      el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: home }, icon('home'), 'หน้าหลัก'),
      r.again ? el('button', { class: 'btn btn-primary', style: 'flex:2', onclick: r.again }, r.againText || 'ทำรายการต่อ') : null
    ]);
  }
  function replaceTop(viewFn, arg) { stack[stack.length - 1] = [viewFn, arg]; render(); }

  /* ================================================================ */
  /* หน้าหลัก                                                           */
  /* ================================================================ */
  function viewHome(app) {
    var u = State.user, can = State.perms;
    var tiles = [
      [can.write, 'รับสินค้าเข้า', 'สแกนรับของเข้าคลัง', 'inbox', 'c-green', viewStockIn],
      [can.write, 'ขายสินค้าออก', 'แพ็กออเดอร์ ตัดสต๊อก', 'cart', 'c-blue', viewSale],
      [can.write, 'รับคืนสินค้า', 'ลูกค้าคืนของ', 'undo', 'c-violet', viewCustomerReturn],
      [can.write, 'ส่งคืนสินค้า', 'คืนซัพพลายเออร์', 'truck', 'c-amber', viewSupplierReturn],
      [can.write, 'ตัดสินค้าเสีย', 'แตก ชำรุด หาย หมดอายุ', 'trash', 'c-red', viewWriteOff],
      [true, 'เช็กสต๊อก', 'สแกนดูยอดคงเหลือ', 'search', 'c-gray', viewCheck],
      [can.write, 'ตรวจนับสินค้า', 'นับจริงและปรับยอด', 'clip', 'c-green', viewCount],
      [true, 'ประวัติรายการ', 'ค้นหาการเคลื่อนไหว', 'clock', 'c-gray', viewHistory],
      [can.write, 'ผลตรวจสอบ', 'ย้ายของรอตรวจ', 'shield', 'c-amber', viewInspect],
      [can.write, 'ยกเลิกออเดอร์', 'คืนสต๊อกออเดอร์', 'xc', 'c-red', viewCancel],
      [true, 'Dashboard', 'สรุปภาพรวม', 'chart', 'c-blue', viewDashboard],
      [can.admin, 'การเงิน', 'ต้นทุน ยอดเงิน กำไร', 'coin', 'c-green', viewFinance],
      [can.admin, 'ตั้งค่าระบบ', 'ช่องทาง พนักงาน สินค้า', 'gear', 'c-gray', viewAdmin]
    ];
    var initial = (u.name || '?').trim().charAt(0);
    append(app, el('div', { class: 'hero' },
      el('div', { class: 'company' }, State.settings.COMPANY_NAME || 'LINE WMS'),
      el('div', { class: 'hello' }, 'ระบบคลังสินค้า'),
      el('div', { class: 'who' },
        u.picture ? el('img', { class: 'avatar', src: u.picture, alt: '' }) : el('div', { class: 'avatar' }, initial),
        el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, u.name), el('span', { class: 'role-badge' }, ROLE_LABEL[u.role] || u.role)))));
    var pg = el('div', { class: 'page page-home' });
    if (Pending.get()) {
      append(pg, el('button', { class: 'banner warn', style: 'border:0;width:100%;text-align:left;cursor:pointer', onclick: function () { checkPending(true).then(function () { render(); }); } },
        icon('alert'), el('div', null, 'มีรายการที่ยังไม่ทราบผลการบันทึก แตะเพื่อตรวจสอบ')));
    }
    var grid = el('div', { class: 'menu-grid' });
    tiles.forEach(function (t) {
      if (!t[0]) return;
      append(grid, el('button', { class: 'tile', onclick: function () { go(t[5]); } },
        el('div', { class: 'ic ' + t[4] }, icon(t[3])), el('div', null, el('div', { class: 't' }, t[1]), el('div', { class: 's' }, t[2]))));
    });
    append(pg, grid);
    append(pg, el('div', { class: 'small muted', style: 'text-align:center;margin-top:8px' }, (State.app.name || 'LINE WMS') + ' v' + (State.app.version || '')));
    app.appendChild(pg);
  }

  /* ================================================================ */
  /* 3.1 รับสินค้าเข้า / 3.4 ส่งคืนซัพพลายเออร์ / 3.5 ตัดเสีย (หลาย SKU)  */
  /* ================================================================ */
  function cartDocView(app, cfg) {
    var footerBtn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1' });
    var statusPick = cfg.fromStatus ? choiceGroup([['AVAILABLE', 'จากยอดพร้อมขาย'], ['INSPECTION', 'จากยอดรอตรวจสอบ']], 'AVAILABLE', function (v) { /* เปลี่ยนสถานะต้นทาง */ rebuildCart(v); }) : null;
    var cartHolder = el('div');
    var cart;
    function upd() { footerBtn.disabled = !cart.count(); footerBtn.textContent = cart.count() ? 'ตรวจสอบและยืนยัน (' + cart.count() + ' รายการ / ' + fmt(cart.total()) + ')' : 'สแกนสินค้าก่อน'; }
    function rebuildCart(status) {
      cart = Cart({ checkStatus: cfg.fromStatus ? status : null, requireActive: !!cfg.requireActive, onChange: upd, scanTitle: cfg.title });
      clear(cartHolder); cartHolder.appendChild(cart.el); upd();
    }
    rebuildCart('AVAILABLE');
    var fields = cfg.fields();
    footerBtn.addEventListener('click', function () {
      var err = cfg.validate ? cfg.validate(fields) : null;
      if (err) { showError({ message: err }); return; }
      var status = statusPick ? statusPick.value() : null;
      var over = cart.overStock();
      if (over.length) { showError({ code: 'INSUFFICIENT_STOCK', message: over.map(function (l) { return l.product.sku + ' มีไม่พอ'; }).join('\n') + '\nกรุณาแก้จำนวนก่อนยืนยัน' }); return; }
      var payload = cfg.payload(cart.lines(), fields, status);
      confirmSheet({
        title: cfg.confirmTitle, danger: cfg.danger, confirmText: cfg.confirmText,
        rows: cfg.rows(fields, status),
        lines: cart.summary().map(function (l) { l.sign = cfg.sign; return l; })
      }).then(function (ok) {
        if (!ok) return;
        submitWrite(cfg.action, payload, cfg.title + ' ' + cart.count() + ' รายการ').then(function (d) {
          if (!d) return;
          replaceTop(resultView, { title: cfg.title, data: d, refLabel: 'เลขเอกสาร', ref: d.docNo, sign: cfg.sign, again: function () { replaceTop(cfg.self); }, againText: cfg.againText });
        }).catch(showError);
      });
    });
    page(app, cfg.title, [
      cfg.intro ? el('div', { class: 'banner info' }, icon('alert'), el('div', null, cfg.intro)) : null,
      statusPick ? el('div', { class: 'field' }, el('div', { class: 'label' }, 'ตัดจากสถานะ'), statusPick) : null,
      cartHolder,
      el('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:12px' }, fields.nodes)
    ], footerBtn);
    setTimeout(function () { if (cart) cart.focus(); }, 100);
  }

  function viewStockIn(app) {
    cartDocView(app, {
      self: viewStockIn, title: 'รับสินค้าเข้า', action: 'stock.in', sign: '+', confirmTitle: 'ยืนยันรับสินค้าเข้า', againText: 'รับสินค้าล็อตถัดไป',
      fields: function () {
        var type = selectField('ประเภทการรับเข้า', list(State.settings.STOCK_IN_TYPES));
        var note = textField('หมายเหตุ (ถ้ามี)', 'เช่น เลขใบส่งของ / ชื่อผู้ส่ง', { multiline: true });
        return { type: type, note: note, nodes: [type, note] };
      },
      validate: function (f) { return /^อื่น/.test(f.type.input.value) && !f.note.input.value.trim() ? 'เลือก "อื่น ๆ" กรุณาระบุหมายเหตุ' : null; },
      payload: function (lines, f) { return { lines: lines, inType: f.type.input.value, note: f.note.input.value.trim() }; },
      rows: function (f) { return [['ประเภท', f.type.input.value]].concat(f.note.input.value.trim() ? [['หมายเหตุ', f.note.input.value.trim()]] : []); }
    });
  }

  function viewSupplierReturn(app) {
    cartDocView(app, {
      self: viewSupplierReturn, title: 'ส่งคืนซัพพลายเออร์', action: 'return.supplier', sign: '−', fromStatus: true, confirmTitle: 'ยืนยันส่งคืนซัพพลายเออร์', danger: true, againText: 'ส่งคืนรายการใหม่',
      fields: function () {
        var sup = textField('ซัพพลายเออร์ *', 'ชื่อร้าน/โรงงาน', { max: 100 });
        var ref = textField('เลขอ้างอิงการส่งคืน', 'เช่น RMA / เลขพัสดุ', { max: 60 });
        var reason = selectField('เหตุผล', list(State.settings.SUPPLIER_RETURN_REASONS));
        var note = textField('หมายเหตุ', '', { multiline: true });
        return { sup: sup, ref: ref, reason: reason, note: note, nodes: [sup, ref, reason, note] };
      },
      validate: function (f) {
        if (!f.sup.input.value.trim()) return 'กรุณาระบุชื่อซัพพลายเออร์';
        return /^อื่น/.test(f.reason.input.value) && !f.note.input.value.trim() ? 'เลือก "อื่น ๆ" กรุณาระบุหมายเหตุ' : null;
      },
      payload: function (lines, f, status) { return { lines: lines, fromStatus: status, supplier: f.sup.input.value.trim(), refNo: f.ref.input.value.trim(), reason: f.reason.input.value, note: f.note.input.value.trim() }; },
      rows: function (f, status) { return [['ตัดจาก', STATUS_LABEL[status]], ['ซัพพลายเออร์', f.sup.input.value.trim()], ['เลขอ้างอิง', f.ref.input.value.trim() || '-'], ['เหตุผล', f.reason.input.value]]; }
    });
  }

  function viewWriteOff(app) {
    cartDocView(app, {
      self: viewWriteOff, title: 'ตัดสินค้าเสีย', action: 'writeoff', sign: '−', fromStatus: true, confirmTitle: 'ยืนยันตัดสินค้าเสีย', danger: true, confirmText: 'ยืนยันตัดเสีย', againText: 'ตัดเสียรายการใหม่',
      fields: function () {
        var reason = selectField('เหตุผล', list(State.settings.WRITE_OFF_REASONS));
        var note = textField('หมายเหตุ', 'รายละเอียดเพิ่มเติม', { multiline: true });
        return { reason: reason, note: note, nodes: [reason, note] };
      },
      validate: function (f) { return /^อื่น/.test(f.reason.input.value) && !f.note.input.value.trim() ? 'เลือก "อื่น ๆ" กรุณาระบุหมายเหตุ' : null; },
      payload: function (lines, f, status) { return { lines: lines, fromStatus: status, reason: f.reason.input.value, note: f.note.input.value.trim() }; },
      rows: function (f, status) { return [['ตัดจาก', STATUS_LABEL[status]], ['เหตุผล', f.reason.input.value]].concat(f.note.input.value.trim() ? [['หมายเหตุ', f.note.input.value.trim()]] : []); }
    });
  }

  /* ================================================================ */
  /* 3.2 ขายสินค้าออก — แยกตามออเดอร์                                    */
  /* ================================================================ */
  function channelPicker(onPick, selected) {
    return el('div', { class: 'choice-grid' }, State.channels.map(function (c) {
      return el('button', { class: 'choice' + (selected === c.channelId ? ' on' : ''), onclick: function () { onPick(c); } },
        c.name, el('small', null, c.mode === 'AUTO' ? 'ระบบออกเลขออเดอร์ให้' : 'สแกนเลขออเดอร์จริง'));
    }));
  }

  function orderNoStep(pg, cfg) {
    var bar = scanBar({ title: 'สแกนเลขออเดอร์', placeholder: 'สแกน / พิมพ์เลขออเดอร์ แล้วกด Enter', onCode: cfg.onNo });
    append(pg, [
      el('div', { class: 'card' }, el('div', { class: 'small muted' }, 'ช่องทางขาย'), el('div', { style: 'font-weight:700;font-size:18px' }, cfg.channel.name),
        el('button', { class: 'chip', style: 'margin-top:8px', onclick: cfg.changeChannel }, 'เปลี่ยนช่องทาง')),
      el('div', { class: 'field' }, el('div', { class: 'label' }, cfg.label || 'เลขออเดอร์'), bar),
      el('div', { class: 'hint' }, cfg.hint || 'สแกนบาร์โค้ด/QR เลขออเดอร์บนใบปะหน้า หรือพิมพ์เลขออเดอร์จากแอปแพลตฟอร์ม')
    ]);
    setTimeout(function () { bar.input.focus(); }, 100);
  }

  function viewSale(app, st) {
    st = st || { step: 1 };
    var pg = page(app, 'ขายสินค้าออก', [stepsBar(st.step, 3)]);
    if (st.step === 1) {
      append(pg, [el('div', { class: 'label' }, 'ขั้นที่ 1 — เลือกช่องทางขาย'), channelPicker(function (c) {
        replaceTop(viewSale, c.mode === 'AUTO' ? { step: 3, channel: c, orderNo: null } : { step: 2, channel: c });
      }, st.channel && st.channel.channelId)]);
      if (!State.channels.length) append(pg, el('div', { class: 'banner warn' }, icon('alert'), el('div', null, 'ยังไม่มีช่องทางขายที่เปิดใช้งาน กรุณาแจ้งผู้ดูแลระบบ')));
      return;
    }
    if (st.step === 2) {
      orderNoStep(pg, {
        channel: st.channel, label: 'ขั้นที่ 2 — ระบุเลขออเดอร์',
        changeChannel: function () { replaceTop(viewSale, { step: 1 }); },
        onNo: function (no) {
          busy('กำลังตรวจสอบเลขออเดอร์…');
          Api.read('order.check', { channelId: st.channel.channelId, orderNo: no }).then(function (d) {
            unbusy();
            if (d.exists) {
              beep(false);
              return sheet(function (close) {
                return [el('h2', null, 'ออเดอร์นี้ถูกบันทึกแล้ว'),
                  el('div', { class: 'banner error' }, icon('alert'), el('div', null, d.message + '\nระบบจะไม่ตัดสต๊อกซ้ำ')),
                  el('div', { class: 'card', style: 'box-shadow:none;background:var(--bg)' }, d.order.items.map(function (i) {
                    return el('div', { class: 'row' }, el('div', { class: 'grow' }, i.name, el('div', { class: 'small muted mono' }, i.sku)), el('b', null, fmt(i.qty) + ' ' + i.unit));
                  })),
                  el('button', { class: 'btn btn-primary btn-block', onclick: function () { close(); } }, 'สแกนออเดอร์อื่น')];
              });
            }
            beep(true);
            replaceTop(viewSale, { step: 3, channel: st.channel, orderNo: d.orderNo });
          }).catch(showError);
        }
      });
      return;
    }
    // step 3 — สแกนสินค้าในออเดอร์
    var footerBtn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1' });
    var cart = Cart({ checkStatus: 'AVAILABLE', requireActive: true, onChange: upd, scanTitle: 'สแกนสินค้าในออเดอร์' });
    var note = textField('หมายเหตุ (ถ้ามี)', 'เช่น ชื่อลูกค้า', { max: 300 });
    function upd() { footerBtn.disabled = !cart.count(); footerBtn.textContent = cart.count() ? 'ตรวจสอบและยืนยัน (' + cart.count() + ' รายการ / ' + fmt(cart.total()) + ' ชิ้น)' : 'สแกนสินค้าในออเดอร์'; }
    upd();
    append(pg, [
      el('div', { class: 'card row' },
        el('div', { class: 'grow' }, el('div', { class: 'small muted' }, st.channel.name + ' · ขั้นที่ 3 สแกนสินค้า'),
          el('div', { class: 'mono', style: 'font-weight:700;font-size:20px;word-break:break-all' }, st.orderNo || 'ออกเลขอัตโนมัติเมื่อยืนยัน')),
        el('button', { class: 'chip', onclick: function () { replaceTop(viewSale, st.channel.mode === 'AUTO' ? { step: 1 } : { step: 2, channel: st.channel }); } }, 'เปลี่ยน')),
      cart.el, note
    ]);
    app.appendChild(el('div', { class: 'footer-bar' }, el('div', { class: 'inner' }, footerBtn)));
    footerBtn.addEventListener('click', function () {
      var over = cart.overStock();
      if (over.length) { showError({ code: 'INSUFFICIENT_STOCK', message: over.map(function (l) { return l.product.name + ' (' + l.product.sku + ') พร้อมขายมี ' + l.product.balance.available + ' แต่ใส่ ' + l.qty; }).join('\n') }); return; }
      confirmSheet({
        title: 'ยืนยันตัดสต๊อกออเดอร์', confirmText: 'ยืนยันขายและตัดสต๊อก',
        rows: [['ช่องทาง', st.channel.name], ['เลขออเดอร์', st.orderNo || 'ระบบออกให้อัตโนมัติ']],
        lines: cart.summary().map(function (l) { l.sign = '−'; return l; })
      }).then(function (ok) {
        if (!ok) return;
        var payload = { channelId: st.channel.channelId, orderNo: st.orderNo, lines: cart.lines(), note: note.input.value.trim() };
        submitWrite('order.create', payload, 'ขายออเดอร์ ' + (st.orderNo || st.channel.name)).then(function (d) {
          if (!d) return;
          replaceTop(resultView, {
            title: 'ขายสินค้าออก', data: d, refLabel: 'เลขออเดอร์ (' + d.channelName + ')', ref: d.orderNo, sub: 'รหัสภายใน ' + d.internalOrderId, sign: '−',
            againText: 'ออเดอร์ถัดไป (' + st.channel.name + ')',
            again: function () { replaceTop(viewSale, st.channel.mode === 'AUTO' ? { step: 3, channel: st.channel, orderNo: null } : { step: 2, channel: st.channel }); }
          });
        }).catch(function (e) {
          if (e.code === 'DUPLICATE_ORDER') { showError(e).then(function () { replaceTop(viewSale, { step: 2, channel: st.channel }); }); return; }
          showError(e);
        });
      });
    });
    setTimeout(function () { cart.focus(); }, 100);
  }

  /* ================================================================ */
  /* หาออเดอร์ (ใช้กับรับคืน / ยกเลิก)                                     */
  /* ================================================================ */
  function orderFinderView(app, st, cfg) {
    var pg = page(app, cfg.title, [stepsBar(st.step, 3)]);
    if (st.step === 1) {
      append(pg, [el('div', { class: 'label' }, 'ขั้นที่ 1 — เลือกช่องทางขายเดิม'), channelPicker(function (c) { replaceTop(cfg.self, { step: 2, channel: c }); })]);
      return null;
    }
    if (st.step === 2) {
      orderNoStep(pg, {
        channel: st.channel, label: 'ขั้นที่ 2 — สแกน/ค้นหาเลขออเดอร์เดิม',
        hint: 'ใช้เลขออเดอร์เดียวกับตอนขาย (ช่องทาง LINE/หน้าร้าน เช่น LINE-20261019-0001)',
        changeChannel: function () { replaceTop(cfg.self, { step: 1 }); },
        onNo: function (no) {
          busy('กำลังค้นหาออเดอร์…');
          Api.read('order.get', { channelId: st.channel.channelId, orderNo: no }).then(function (d) {
            unbusy(); beep(true);
            replaceTop(cfg.self, { step: 3, channel: st.channel, order: d.order });
          }).catch(showError);
        }
      });
      return null;
    }
    var o = st.order;
    append(pg, el('div', { class: 'card' },
      el('div', { class: 'row' }, el('div', { class: 'grow' }, el('div', { class: 'small muted' }, o.channelName), el('div', { class: 'mono', style: 'font-weight:700;font-size:19px;word-break:break-all' }, o.orderNo)),
        el('span', { class: 'badge ' + (o.status === 'CANCELLED' ? 'c-red' : o.status === 'COMPLETED' ? 'c-green' : 'c-violet') }, ORDER_STATUS_LABEL[o.status] || o.status)),
      el('div', { class: 'small muted', style: 'margin-top:6px' }, 'ขายเมื่อ ' + o.completedAt + ' โดย ' + o.createdBy + ' · ' + o.totalQty + ' ชิ้น')));
    return pg;
  }

  /* 3.3 รับคืนสินค้าจากลูกค้า */
  function viewCustomerReturn(app, st) {
    st = st || { step: 1 };
    var pg = orderFinderView(app, st, { title: 'รับคืนสินค้า', self: viewCustomerReturn });
    if (!pg) return;
    var o = st.order;
    if (o.status === 'CANCELLED') { append(pg, el('div', { class: 'banner error' }, icon('alert'), el('div', null, 'ออเดอร์นี้ถูกยกเลิกแล้ว ไม่สามารถรับคืนได้'))); return; }
    var picks = {};
    var footerBtn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1' });
    function total() { return Object.keys(picks).reduce(function (s, k) { return s + picks[k].qty; }, 0); }
    function upd() { var t = total(); footerBtn.disabled = !t; footerBtn.textContent = t ? 'ตรวจสอบและยืนยันรับคืน (' + t + ')' : 'เลือกจำนวนที่ลูกค้าคืน'; }
    append(pg, el('div', { class: 'label' }, 'ขั้นที่ 3 — เลือกสินค้าและสภาพสินค้าที่คืน'));
    o.items.forEach(function (it) {
      picks[it.sku] = { qty: 0, condition: 'GOOD' };
      var pick = picks[it.sku];
      var qIn = el('input', { type: 'number', inputmode: 'numeric', value: 0, min: 0, max: it.returnableQty, 'aria-label': 'จำนวนคืน' });
      function setQ(v) { v = Math.max(0, Math.min(it.returnableQty, Math.floor(Number(v) || 0))); pick.qty = v; qIn.value = v; upd(); }
      qIn.addEventListener('change', function () { setQ(qIn.value); });
      var cond = choiceGroup(COND.map(function (c) { return [c[0], c[1], c[2]]; }), 'GOOD', function (v) { pick.condition = v; });
      cond.style.gridTemplateColumns = 'repeat(3,1fr)';
      append(pg, el('div', { class: 'line' },
        el('div', { class: 'top' }, el('div', { class: 'grow' }, el('div', { class: 'name' }, it.name), el('div', { class: 'sku' }, it.sku),
          el('div', { class: 'meta' }, 'ขาย ' + it.qty + ' · คืนแล้ว ' + it.returnedQty + ' · คืนได้อีก ' + it.returnableQty + ' ' + it.unit))),
        it.returnableQty > 0 ? [
          el('div', { class: 'row' }, el('div', { class: 'grow label' }, 'จำนวนที่คืน'),
            el('div', { class: 'stepper' }, el('button', { onclick: function () { setQ(pick.qty - 1); } }, '−'), qIn, el('button', { onclick: function () { setQ(pick.qty + 1); } }, '+'))),
          cond] : el('div', { class: 'muted small' }, 'คืนครบแล้ว')));
    });
    var note = textField('หมายเหตุ', 'เช่น เหตุผลที่ลูกค้าคืน', { multiline: true });
    append(pg, note);
    upd();
    app.appendChild(el('div', { class: 'footer-bar' }, el('div', { class: 'inner' }, footerBtn)));
    footerBtn.addEventListener('click', function () {
      var lines = [], summary = [];
      o.items.forEach(function (it) {
        var p = picks[it.sku];
        if (p.qty > 0) {
          lines.push({ sku: it.sku, qty: p.qty, condition: p.condition });
          var cl = COND.filter(function (c) { return c[0] === p.condition; })[0];
          summary.push({ sku: it.sku, name: it.name, unit: it.unit, qty: p.qty, sign: '+', extra: cl[1] + ' → ' + cl[2] });
        }
      });
      confirmSheet({ title: 'ยืนยันรับคืนสินค้า', rows: [['ช่องทาง', o.channelName], ['เลขออเดอร์', o.orderNo]], lines: summary }).then(function (ok) {
        if (!ok) return;
        submitWrite('return.customer', { channelId: o.channelId, orderNo: o.orderNo, lines: lines, note: note.input.value.trim() }, 'รับคืนออเดอร์ ' + o.orderNo).then(function (d) {
          if (!d) return;
          replaceTop(resultView, { title: 'รับคืนสินค้า', data: d, refLabel: 'เลขเอกสารรับคืน', ref: d.docNo, sub: 'ออเดอร์ ' + d.orderNo, sign: '+', againText: 'รับคืนออเดอร์อื่น', again: function () { replaceTop(viewCustomerReturn, { step: 2, channel: st.channel }); } });
        }).catch(showError);
      });
    });
  }

  /* ยกเลิกออเดอร์ */
  function viewCancel(app, st) {
    st = st || { step: 1 };
    var pg = orderFinderView(app, st, { title: 'ยกเลิกออเดอร์', self: viewCancel });
    if (!pg) return;
    var o = st.order;
    append(pg, el('div', { class: 'card' }, el('h3', null, 'สินค้าในออเดอร์'), o.items.map(function (i) {
      return el('div', { class: 'row', style: 'padding:6px 0' }, el('div', { class: 'grow' }, i.name, el('div', { class: 'small muted mono' }, i.sku)),
        el('div', { class: 'right' }, el('b', null, fmt(i.qty) + ' ' + i.unit), i.returnedQty ? el('div', { class: 'small muted' }, 'คืนแล้ว ' + i.returnedQty) : null));
    })));
    if (o.status === 'CANCELLED') { append(pg, el('div', { class: 'banner error' }, icon('alert'), el('div', null, 'ยกเลิกไปแล้วเมื่อ ' + o.cancelledAt + ' (' + o.cancelReason + ')'))); return; }
    var reason = selectField('เหตุผลการยกเลิก', list(State.settings.CANCEL_REASONS));
    var note = textField('หมายเหตุ', '', { multiline: true });
    append(pg, [el('div', { class: 'banner warn' }, icon('alert'), el('div', null, 'ระบบจะคืนสต๊อกเข้ายอดพร้อมขายเฉพาะจำนวนที่ยังไม่ได้รับคืน และเก็บประวัติเดิมไว้ทั้งหมด')), reason, note]);
    var btn = el('button', { class: 'btn btn-danger btn-lg', style: 'flex:1' }, 'ยกเลิกออเดอร์นี้');
    app.appendChild(el('div', { class: 'footer-bar' }, el('div', { class: 'inner' }, btn)));
    btn.addEventListener('click', function () {
      if (/^อื่น/.test(reason.input.value) && !note.input.value.trim()) { showError({ message: 'เลือก "อื่น ๆ" กรุณาระบุหมายเหตุ' }); return; }
      confirmSheet({ title: 'ยืนยันยกเลิกออเดอร์', danger: true, confirmText: 'ยืนยันยกเลิกและคืนสต๊อก',
        rows: [['ช่องทาง', o.channelName], ['เลขออเดอร์', o.orderNo], ['เหตุผล', reason.input.value]],
        lines: o.items.filter(function (i) { return i.returnableQty > 0; }).map(function (i) { return { sku: i.sku, name: i.name, unit: i.unit, qty: i.returnableQty, sign: '+' }; })
      }).then(function (ok) {
        if (!ok) return;
        submitWrite('order.cancel', { channelId: o.channelId, orderNo: o.orderNo, reason: reason.input.value, note: note.input.value.trim() }, 'ยกเลิกออเดอร์ ' + o.orderNo).then(function (d) {
          if (!d) return;
          replaceTop(resultView, { title: 'ยกเลิกออเดอร์', data: d, refLabel: 'เลขออเดอร์', ref: d.orderNo, sign: '+' });
        }).catch(showError);
      });
    });
  }

  /* ================================================================ */
  /* 3.6 เช็กสต๊อก                                                      */
  /* ================================================================ */
  function viewCheck(app, st) {
    st = st || {};
    var holder = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    function show(p) {
      clear(holder);
      var hist = el('div', { class: 'card' }, el('h3', null, 'ประวัติล่าสุด'), el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' })));
      var actions = el('div', { class: 'row', style: 'flex-wrap:wrap' },
        State.perms.write && p.balance.inspection > 0 ? el('button', { class: 'btn btn-outline', onclick: function () { go(viewInspect, { product: p }); } }, icon('shield'), 'ผลตรวจสอบ') : null,
        State.perms.write ? el('button', { class: 'btn btn-outline', onclick: function () { go(viewCount, { product: p }); } }, icon('clip'), 'ตรวจนับ') : null,
        State.perms.write ? el('button', { class: 'btn btn-outline', onclick: function () { productForm(p, false).then(function (np) { if (np) show(np); }); } }, 'แก้ไขสินค้า') : null);
      append(holder, [productCard(p, el('div', { style: 'margin-top:12px' }, actions)), hist]);
      Api.read('product.history', { sku: p.sku, limit: 30 }).then(function (d) {
        var body = d.items.length ? d.items.map(txRow) : el('div', { class: 'empty' }, 'ยังไม่มีการเคลื่อนไหว');
        clear(hist); append(hist, [el('h3', null, 'ประวัติล่าสุด (' + d.items.length + ')'), body]);
      }).catch(function (e) { clear(hist); append(hist, el('div', { class: 'err-text' }, e.message)); });
    }
    function lookup(code) {
      busy('กำลังค้นหา…');
      productCache = {};
      lookupProduct(code).then(function (p) {
        unbusy();
        if (p.notFound) return notFoundSheet(p.sku).then(function (np) { if (np) show(np); });
        beep(true); show(p);
      }).catch(showError);
    }
    var bar = scanBar({ title: 'สแกนเพื่อเช็กสต๊อก', onCode: lookup, search: function () { productPicker().then(function (p) { if (p) lookup(p.sku); }); } });
    page(app, 'เช็กสต๊อก', [bar, holder]);
    append(holder, el('div', { class: 'empty' }, 'สแกนบาร์โค้ดหรือค้นหาจากชื่อสินค้า'));
    if (st.sku) lookup(st.sku); else setTimeout(function () { bar.input.focus(); }, 100);
  }

  /* ================================================================ */
  /* 3.7 ตรวจนับและปรับยอด                                              */
  /* ================================================================ */
  function viewCount(app, st) {
    st = st || {};
    var holder = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    var footerBtn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1', disabled: true }, 'สแกนสินค้าที่จะตรวจนับ');
    var cur = null;
    function show(p) {
      cur = { product: p, status: 'AVAILABLE' };
      clear(holder);
      var sysEl = el('div', { style: 'font-size:28px;font-weight:700' });
      var diffEl = el('div', { style: 'font-size:28px;font-weight:700' });
      var counted = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 0, placeholder: 'จำนวนที่นับได้จริง', style: 'font-size:26px;text-align:center;font-weight:700;min-height:64px' });
      var reason = selectField('เหตุผล', list(State.settings.ADJUST_REASONS));
      var note = textField('หมายเหตุ', '', { multiline: true });
      function sys() { return cur.status === 'INSPECTION' ? p.balance.inspection : p.balance.available; }
      function upd() {
        sysEl.textContent = fmt(sys());
        var v = counted.value === '' ? null : Number(counted.value);
        if (v == null || v < 0 || Math.floor(v) !== v) { diffEl.textContent = '–'; diffEl.style.color = ''; footerBtn.disabled = true; footerBtn.textContent = 'กรอกจำนวนที่นับได้'; return; }
        var d = v - sys();
        diffEl.textContent = (d > 0 ? '+' : '') + fmt(d);
        diffEl.style.color = d === 0 ? 'var(--brand-dark)' : d > 0 ? 'var(--info)' : 'var(--danger)';
        footerBtn.disabled = false;
        footerBtn.textContent = d === 0 ? 'บันทึกผล (ยอดตรง)' : 'ตรวจสอบและยืนยันปรับยอด';
      }
      counted.addEventListener('input', upd);
      var stPick = choiceGroup([['AVAILABLE', 'นับยอดพร้อมขาย'], ['INSPECTION', 'นับยอดรอตรวจสอบ']], 'AVAILABLE', function (v) { cur.status = v; upd(); });
      append(holder, [productCard(p), el('div', { class: 'field' }, el('div', { class: 'label' }, 'ตรวจนับสถานะ'), stPick),
        el('div', { class: 'card' }, el('div', { class: 'row' },
          el('div', { class: 'grow' }, el('div', { class: 'small muted' }, 'ยอดในระบบ'), sysEl),
          el('div', { class: 'grow right' }, el('div', { class: 'small muted' }, 'ส่วนต่าง'), diffEl))),
        el('div', { class: 'field' }, el('label', null, 'จำนวนที่นับได้จริง (' + p.unit + ')'), counted), reason, note]);
      cur.counted = counted; cur.reason = reason; cur.note = note; cur.sys = sys;
      upd();
      setTimeout(function () { counted.focus(); }, 100);
    }
    function lookup(code) {
      busy('กำลังโหลดยอด…'); productCache = {};
      lookupProduct(code).then(function (p) {
        unbusy();
        if (p.notFound) return notFoundSheet(p.sku).then(function (np) { if (np) show(np); });
        beep(true); show(p);
      }).catch(showError);
    }
    footerBtn.addEventListener('click', function () {
      if (!cur) return;
      var p = cur.product, v = Number(cur.counted.value), sys = cur.sys(), d = v - sys;
      if (/^อื่น/.test(cur.reason.input.value) && !cur.note.input.value.trim()) { showError({ message: 'เลือก "อื่น ๆ" กรุณาระบุหมายเหตุ' }); return; }
      confirmSheet({ title: 'ยืนยันผลตรวจนับ', confirmText: d === 0 ? 'บันทึกผลตรวจนับ' : 'ยืนยันปรับยอด', danger: d < 0,
        rows: [['สินค้า', p.name], ['SKU', p.sku], ['สถานะ', STATUS_LABEL[cur.status]], ['ยอดในระบบ', fmt(sys)], ['นับได้จริง', fmt(v)], ['ส่วนต่าง', (d > 0 ? '+' : '') + fmt(d)], ['เหตุผล', cur.reason.input.value]]
      }).then(function (ok) {
        if (!ok) return;
        submitWrite('adjust', { sku: p.sku, status: cur.status, expectedQty: sys, countedQty: v, reason: cur.reason.input.value, note: cur.note.input.value.trim() }, 'ตรวจนับ ' + p.sku).then(function (data) {
          if (!data) return;
          replaceTop(resultView, { title: 'ตรวจนับสินค้า', data: data, refLabel: 'เลขเอกสาร', ref: data.docNo, sign: data.diff > 0 ? '+' : '', againText: 'ตรวจนับสินค้าถัดไป', again: function () { replaceTop(viewCount); } });
        }).catch(function (e) {
          showError(e).then(function () { if (e.code === 'STALE_BALANCE') lookup(p.sku); });
        });
      });
    });
    var bar = scanBar({ title: 'สแกนสินค้าที่จะตรวจนับ', onCode: lookup, search: function () { productPicker().then(function (p) { if (p) lookup(p.sku); }); } });
    page(app, 'ตรวจนับสินค้า', [bar, holder], footerBtn);
    if (st.product) lookup(st.product.sku); else setTimeout(function () { bar.input.focus(); }, 100);
  }

  /* ================================================================ */
  /* ผลตรวจสอบ: ย้ายของรอตรวจสอบ → พร้อมขาย / ตัดเสีย                    */
  /* ================================================================ */
  function viewInspect(app, st) {
    st = st || {};
    var holder = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    var footerBtn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1', disabled: true }, 'สแกนสินค้าที่ตรวจแล้ว');
    var cur = null;
    function show(p) {
      clear(holder);
      if (p.balance.inspection <= 0) {
        cur = null; footerBtn.disabled = true;
        append(holder, [productCard(p), el('div', { class: 'banner info' }, icon('alert'), el('div', null, 'สินค้านี้ไม่มียอดรอตรวจสอบ'))]);
        return;
      }
      cur = { product: p, target: 'TO_AVAILABLE' };
      var qty = el('input', { class: 'input', type: 'number', inputmode: 'numeric', min: 1, max: p.balance.inspection, value: p.balance.inspection, style: 'font-size:24px;text-align:center;font-weight:700' });
      var reasonF = selectField('เหตุผลการตัดเสีย', list(State.settings.WRITE_OFF_REASONS));
      reasonF.classList.add('hidden');
      var note = textField('หมายเหตุ', '', { multiline: true });
      var pick = choiceGroup([['TO_AVAILABLE', 'ตรวจผ่าน', 'ย้ายเข้ายอดพร้อมขาย'], ['TO_WRITE_OFF', 'ตรวจไม่ผ่าน', 'ตัดเสีย']], 'TO_AVAILABLE', function (v) {
        cur.target = v; reasonF.classList.toggle('hidden', v !== 'TO_WRITE_OFF');
        footerBtn.className = 'btn btn-lg ' + (v === 'TO_WRITE_OFF' ? 'btn-danger' : 'btn-primary');
      });
      cur.qty = qty; cur.reason = reasonF; cur.note = note;
      footerBtn.disabled = false; footerBtn.textContent = 'ตรวจสอบและยืนยัน';
      append(holder, [productCard(p), el('div', { class: 'field' }, el('div', { class: 'label' }, 'ผลการตรวจสอบ'), pick),
        el('div', { class: 'field' }, el('label', null, 'จำนวน (รอตรวจสอบมี ' + p.balance.inspection + ' ' + p.unit + ')'), qty), reasonF, note]);
    }
    function lookup(code) {
      busy('กำลังโหลด…'); productCache = {};
      lookupProduct(code).then(function (p) { unbusy(); if (p.notFound) return notFoundSheet(p.sku); beep(true); show(p); }).catch(showError);
    }
    footerBtn.addEventListener('click', function () {
      if (!cur) return;
      var p = cur.product, q = Number(cur.qty.value);
      if (!q || q < 1 || Math.floor(q) !== q || q > p.balance.inspection) { showError({ message: 'จำนวนต้องอยู่ระหว่าง 1 ถึง ' + p.balance.inspection }); return; }
      var toAv = cur.target === 'TO_AVAILABLE';
      confirmSheet({ title: toAv ? 'ยืนยันย้ายเข้ายอดพร้อมขาย' : 'ยืนยันตัดเสียจากยอดรอตรวจสอบ', danger: !toAv,
        rows: [['สินค้า', p.name], ['SKU', p.sku], ['จำนวน', fmt(q) + ' ' + p.unit], ['ผล', toAv ? 'ตรวจผ่าน → พร้อมขาย' : 'ตรวจไม่ผ่าน → ตัดเสีย (' + cur.reason.input.value + ')']]
      }).then(function (ok) {
        if (!ok) return;
        submitWrite('transfer', { sku: p.sku, qty: q, target: cur.target, reason: toAv ? '' : cur.reason.input.value, note: cur.note.input.value.trim() }, 'ผลตรวจสอบ ' + p.sku).then(function (d) {
          if (!d) return;
          replaceTop(resultView, { title: 'ผลตรวจสอบ', data: d, refLabel: 'เลขเอกสาร', ref: d.docNo, againText: 'ตรวจสินค้าถัดไป', again: function () { replaceTop(viewInspect); } });
        }).catch(showError);
      });
    });
    var bar = scanBar({ title: 'สแกนสินค้าที่ตรวจแล้ว', onCode: lookup, search: function () { productPicker().then(function (p) { if (p) lookup(p.sku); }); } });
    page(app, 'ผลตรวจสอบสินค้า', [el('div', { class: 'hint' }, 'สำหรับสินค้าที่อยู่ในยอด "รอตรวจสอบ" (เช่น ของคืนที่ชำรุด) เมื่อตรวจแล้วให้บันทึกผลที่นี่'), bar, holder], footerBtn);
    if (st.product) lookup(st.product.sku); else setTimeout(function () { bar.input.focus(); }, 100);
  }

  /* ================================================================ */
  /* ประวัติรายการ                                                       */
  /* ================================================================ */
  function viewHistory(app) {
    var from = el('input', { class: 'input', type: 'date', value: todayStr(6) });
    var to = el('input', { class: 'input', type: 'date', value: todayStr(0) });
    var type = selectField('ประเภท', [['', 'ทั้งหมด']].concat(Object.keys(TX_LABEL).map(function (k) { return [k, TX_LABEL[k]]; })));
    var ch = selectField('ช่องทางขาย', [['', 'ทั้งหมด']].concat(State.channels.map(function (c) { return [c.channelId, c.name]; })));
    var staff = selectField('พนักงาน', [['', 'ทั้งหมด']]);
    var sku = el('input', { class: 'input mono', placeholder: 'SKU', autocapitalize: 'characters' });
    var ord = el('input', { class: 'input mono', placeholder: 'เลขออเดอร์', autocapitalize: 'characters' });
    var out = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    Api.read('users.options', {}).then(function (d) { d.users.forEach(function (u) { append(staff.input, el('option', { value: u.id }, u.name)); }); }).catch(function () { });
    function run() {
      clear(out); append(out, el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' })));
      Api.read('history.search', { dateFrom: from.value, dateTo: to.value, type: type.input.value, channelId: ch.input.value, userId: staff.input.value, sku: sku.value.trim(), orderNo: ord.value.trim() }).then(function (d) {
        clear(out);
        append(out, el('div', { class: 'kpis' },
          el('div', { class: 'kpi' }, el('div', { class: 'v' }, fmt(d.matched)), el('div', { class: 'k' }, 'รายการที่พบ')),
          el('div', { class: 'kpi' }, el('div', { class: 'v', style: 'font-size:18px' }, '+' + fmt(d.sumIn) + ' / −' + fmt(d.sumOut)), el('div', { class: 'k' }, 'รวมเข้า / ออก'))));
        append(out, el('div', { class: 'card' }, d.items.length ? d.items.map(txRow) : el('div', { class: 'empty' }, 'ไม่พบรายการ'),
          d.truncated ? el('div', { class: 'hint' }, 'แสดง ' + d.items.length + ' รายการล่าสุด — ใช้ตัวกรองเพื่อจำกัดผล') : null));
      }).catch(function (e) { clear(out); append(out, el('div', { class: 'banner error' }, icon('alert'), el('div', null, e.message))); });
    }
    page(app, 'ประวัติรายการ', [
      el('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
        el('div', { class: 'row' }, el('div', { class: 'field grow' }, el('label', null, 'ตั้งแต่'), from), el('div', { class: 'field grow' }, el('label', null, 'ถึง'), to)),
        el('div', { class: 'row' }, el('div', { class: 'grow' }, type), el('div', { class: 'grow' }, ch)),
        staff,
        el('div', { class: 'row' }, el('div', { class: 'grow' }, sku), el('div', { class: 'grow' }, ord)),
        el('button', { class: 'btn btn-primary btn-block', onclick: run }, icon('search'), 'ค้นหา')),
      out
    ]);
    run();
  }

  /* ================================================================ */
  /* Dashboard                                                          */
  /* ================================================================ */
  function viewDashboard(app) {
    var out = el('div', { style: 'display:flex;flex-direction:column;gap:14px' });
    function load() {
      clear(out); append(out, el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' })));
      Api.read('dashboard', {}).then(function (d) {
        clear(out);
        var t = d.todayStats, tot = d.totals;
        function kpi(v, k, c) { return el('div', { class: 'kpi' }, el('div', { class: 'v', style: c ? 'color:' + c : '' }, fmt(v)), el('div', { class: 'k' }, k)); }
        var maxQ = Math.max.apply(null, d.byChannel.map(function (c) { return c.qty7d; }).concat([1]));
        append(out, [
          el('div', { class: 'section-title' }, 'ภาพรวมสต๊อก'),
          el('div', { class: 'kpis' }, kpi(tot.skuCount, 'SKU ที่ใช้งาน'), kpi(tot.available, 'สินค้าพร้อมขาย', 'var(--brand-dark)'), kpi(tot.inspection, 'สินค้ารอตรวจสอบ', 'var(--warn)'), kpi(d.lowStockCount, 'SKU ใกล้หมด', d.lowStockCount ? 'var(--danger)' : '')),
          el('div', { class: 'section-title' }, 'วันนี้ ' + d.today),
          el('div', { class: 'kpis' }, kpi(t.ordersToday, 'ออเดอร์'), kpi(t.soldToday, 'ชิ้นที่ขายออก'), kpi(t.inToday, 'ชิ้นที่รับเข้า'), kpi(t.returnToday, 'ชิ้นที่รับคืน'), kpi(t.writeOffToday, 'ชิ้นที่ตัดเสีย'), kpi(t.cancelToday, 'ชิ้นคืนจากยกเลิก')),
          el('div', { class: 'card' }, el('h3', null, 'ขายออกแยกช่องทาง (7 วัน)'),
            d.byChannel.filter(function (c) { return c.orders7d; }).length ? d.byChannel.filter(function (c) { return c.orders7d; }).map(function (c) {
              return el('div', null, el('div', { class: 'bar-row' }, el('div', null, c.name), el('div', { class: 'bar' }, el('i', { style: 'width:' + Math.round(c.qty7d / maxQ * 100) + '%' })), el('div', { class: 'right' }, fmt(c.qty7d))),
                el('div', { class: 'small muted', style: 'margin:-6px 0 6px' }, 'วันนี้ ' + c.ordersToday + ' ออเดอร์ / ' + fmt(c.qtyToday) + ' ชิ้น · 7 วัน ' + c.orders7d + ' ออเดอร์'));
            }) : el('div', { class: 'empty' }, 'ยังไม่มียอดขายใน 7 วัน')),
          el('div', { class: 'card' }, el('h3', null, 'สินค้าใกล้หมด'),
            d.lowStock.length ? d.lowStock.map(function (l) {
              return el('button', { class: 'row', style: 'width:100%;border:0;background:none;padding:8px 0;border-bottom:1px solid var(--line);text-align:left;cursor:pointer', onclick: function () { go(viewCheck, { sku: l.sku }); } },
                el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, l.name), el('div', { class: 'small muted mono' }, l.sku)),
                el('div', { class: 'right' }, el('b', { style: 'color:var(--danger)' }, fmt(l.available) + ' ' + l.unit), el('div', { class: 'small muted' }, 'แจ้งเตือนที่ ' + fmt(l.minStock))));
            }) : el('div', { class: 'empty' }, 'ไม่มีสินค้าใกล้หมด')),
          el('div', { class: 'card' }, el('h3', null, 'ความเคลื่อนไหวล่าสุด'), d.recent.length ? d.recent.map(txRow) : el('div', { class: 'empty' }, 'ยังไม่มีรายการ'))
        ]);
      }).catch(function (e) { clear(out); append(out, el('div', { class: 'banner error' }, icon('alert'), el('div', null, e.message))); });
    }
    page(app, 'Dashboard', out, null, el('button', { class: 'icon-btn', 'aria-label': 'รีเฟรช', onclick: load }, icon('refresh')));
    load();
  }

  /* ================================================================ */
  /* การเงิน (ADMIN เท่านั้น) — ต้นทุนสินค้า / ยอดเงินที่ได้รับ / กำไรต่อออเดอร์  */
  /* ================================================================ */
  function money(n) {
    var v = Number(n || 0);
    return v.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function parseMoney(s) {
    var t = String(s == null ? '' : s).replace(/[,\s฿]/g, '');
    if (t === '' || !/^\d+(\.\d{1,2})?$/.test(t)) return null;
    return Number(t);
  }
  function moneyInput(value, placeholder) {
    return el('input', { class: 'input money-in', type: 'text', inputmode: 'decimal', autocomplete: 'off', placeholder: placeholder || '0.00', value: value == null ? '' : String(value) });
  }
  function profitColor(p) { return p < 0 ? 'var(--danger)' : 'var(--brand-dark)'; }
  function loadingBox() { return el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' })); }
  function errorBox(e) { return el('div', { class: 'banner error' }, icon('alert'), el('div', null, e.message)); }

  function costForm(item) {
    return sheet(function (close) {
      var inp = moneyInput(item.unitCost, 'ต้นทุนต่อ ' + item.unit);
      inp.setAttribute('autofocus', '');
      var note = el('input', { class: 'input', maxLength: 200, value: item.note || '', placeholder: 'เช่น ล็อตตู้ 10/2026 รวมค่าขนส่ง' });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, 'บันทึกต้นทุน');
      function doSave() {
        var v = parseMoney(inp.value);
        if (v == null) { err.textContent = 'กรุณาใส่ตัวเลข 0 ขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง)'; return; }
        save.disabled = true; err.textContent = '';
        submitWrite('finance.cost.save', { sku: item.sku, unitCost: v, note: note.value.trim() }, 'ต้นทุน ' + item.sku)
          .then(function (d) { if (d) { toast(d.message, 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; beep(false); });
      }
      save.addEventListener('click', doSave);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
      return [el('h2', null, 'ต้นทุนต่อชิ้น'),
        el('div', null, el('div', { style: 'font-weight:600' }, item.name), el('div', { class: 'small muted mono' }, item.sku)),
        el('div', { class: 'field' }, el('label', null, 'ต้นทุนต่อ ' + item.unit + ' (บาท)'), inp),
        el('div', { class: 'hint' }, 'สินค้านำเข้าจากจีน: รวมราคาซื้อ + ค่าขนส่งจีน-ไทยเฉลี่ยต่อชิ้น + ภาษีนำเข้า + ค่าส่งในไทย'),
        el('div', { class: 'field' }, el('label', null, 'หมายเหตุ (ถ้ามี)'), note),
        item.updatedAt ? el('div', { class: 'small muted' }, 'แก้ล่าสุด ' + item.updatedAt + ' โดย ' + item.updatedBy) : null,
        err, save, el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, 'ยกเลิก')];
    });
  }

  /** หน้ารวมเมนูการเงิน */
  function viewFinance(app) {
    var out = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    page(app, 'การเงิน', [
      el('div', { class: 'banner info' }, icon('shield'), el('div', null, 'เมนูนี้เห็นเฉพาะผู้ดูแลระบบ พนักงานไม่เห็นต้นทุนและกำไร')),
      out
    ]);
    append(out, loadingBox());
    Api.read('finance.summary', {}).then(function (d) {
      clear(out);
      function big(n, label, sub, color, onclick) {
        return el('button', { class: 'list-btn fin-big', onclick: onclick },
          el('div', { class: 'fin-num', style: 'color:' + color }, fmt(n)),
          el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, label), el('div', { class: 'small muted' }, sub)),
          icon('chev'));
      }
      append(out, [
        big(d.pendingCount, 'ออเดอร์รอบันทึกยอดเงิน', 'ส่งของแล้ว ยังไม่ได้กรอกเงินที่ได้รับ', d.pendingCount ? 'var(--warn)' : 'var(--ink-3)', function () { go(viewFinPending); }),
        big(d.missingCostCount, 'สินค้ายังไม่มีต้นทุน', 'จากสินค้าที่ใช้งาน ' + fmt(d.activeProductCount) + ' รายการ', d.missingCostCount ? 'var(--danger)' : 'var(--ink-3)', function () { go(viewFinCosts, { onlyMissing: true }); }),
        big(d.recordedCount, 'กำไรต่อออเดอร์', d.lossCount ? 'ขาดทุน ' + fmt(d.lossCount) + ' ออเดอร์' : 'ออเดอร์ที่บันทึกยอดเงินแล้ว', 'var(--brand-dark)', function () { go(viewFinRecords); }),
        el('button', { class: 'list-btn fin-big', onclick: function () { go(viewFinCosts, {}); } },
          el('div', { class: 'fin-num' }, el('div', { class: 'ic c-blue fin-ic' }, icon('coin'))),
          el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, 'ต้นทุนสินค้า'), el('div', { class: 'small muted' }, 'กรอก/แก้ต้นทุนต่อชิ้นของสินค้าทุกตัว')),
          icon('chev')),
        el('div', { class: 'card' }, el('h3', null, 'บันทึกล่าสุด'),
          d.recent.length ? d.recent.map(finRecordRow) : el('div', { class: 'empty' }, 'ยังไม่มีการบันทึกยอดเงิน'))
      ]);
    }).catch(function (e) { clear(out); append(out, errorBox(e)); });
  }

  function finRecordRow(r) {
    return el('button', { class: 'fin-row', onclick: function () { go(viewFinPayment, { internalOrderId: r.internalOrderId }); } },
      el('div', { class: 'grow' },
        el('div', { class: 'mono', style: 'font-weight:600;word-break:break-all' }, r.orderNo),
        el('div', { class: 'small muted' }, r.channelName + ' · รับเงิน ' + r.receivedDate + (r.orderStatus === 'CANCELLED' ? ' · ยกเลิกแล้ว' : ''))),
      el('div', { class: 'right' },
        el('div', { style: 'font-weight:700;color:' + profitColor(r.profit) }, (r.profit > 0 ? '+' : '') + money(r.profit)),
        el('div', { class: 'small muted' }, money(r.marginPct) + '% · รับ ' + money(r.receivedAmount))));
  }

  function channelChips(cur, onPick) {
    var opts = [['', 'ทุกช่องทาง']].concat(State.channels.map(function (c) { return [c.channelId, c.name]; }));
    return el('div', { class: 'tabs' }, opts.map(function (o) {
      return el('button', { class: 'chip' + (cur === o[0] ? ' on' : ''), onclick: function () { onPick(o[0]); } }, o[1]);
    }));
  }

  /** ออเดอร์รอบันทึกยอดเงิน */
  function viewFinPending(app, st) {
    st = st || { channelId: '', q: '' };
    var out = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    var bar = scanBar({
      title: 'สแกนเลขออเดอร์', placeholder: 'ค้นหา/สแกนเลขออเดอร์',
      onCode: function (v) { load(v, true); }
    });
    page(app, 'รอบันทึกยอดเงิน', [
      channelChips(st.channelId, function (c) { replaceTop(viewFinPending, { channelId: c, q: '' }); }),
      bar,
      el('div', { class: 'hint' }, 'แตะออเดอร์เพื่อกรอก "ราคาที่ลูกค้าจ่าย" และ "เงินที่ได้รับจริง"'),
      out
    ]);
    function load(q, auto) {
      st.q = q || '';
      clear(out); append(out, loadingBox());
      Api.read('finance.pending', { channelId: st.channelId, q: st.q }).then(function (d) {
        clear(out);
        if (auto && d.items.length === 1) { beep(true); go(viewFinPayment, { internalOrderId: d.items[0].internalOrderId }); return; }
        if (st.q) append(out, el('div', { class: 'row' }, el('div', { class: 'grow small muted' }, 'ผลค้นหา "' + st.q + '" — ' + fmt(d.total) + ' ออเดอร์'),
          el('button', { class: 'chip', onclick: function () { load(''); } }, 'ล้างค้นหา')));
        if (!d.items.length) {
          append(out, el('div', { class: 'card empty' }, st.q ? 'ไม่พบออเดอร์นี้ในรายการรอบันทึก (อาจบันทึกยอดเงินไปแล้ว ดูได้ที่ "กำไรต่อออเดอร์")' : 'ไม่มีออเดอร์รอบันทึกยอดเงิน'));
          return;
        }
        if (!st.q) append(out, el('div', { class: 'small muted' }, 'ทั้งหมด ' + fmt(d.total) + ' ออเดอร์ (ล่าสุดอยู่บนสุด)'));
        append(out, d.items.map(function (o) {
          return el('button', { class: 'list-btn', onclick: function () { go(viewFinPayment, { internalOrderId: o.internalOrderId }); } },
            el('div', { class: 'grow' },
              el('div', { class: 'mono', style: 'font-weight:600;word-break:break-all' }, o.orderNo),
              el('div', { class: 'small muted' }, o.channelName + ' · ' + fmt(o.totalQty) + ' ชิ้น · ส่ง ' + String(o.createdAt).substring(0, 16))),
            el('span', { class: 'badge ' + (o.days > 14 ? 'c-red' : o.days > 7 ? 'c-amber' : 'c-gray') }, o.days === 0 ? 'วันนี้' : o.days + ' วัน'));
        }));
        if (d.truncated) append(out, el('div', { class: 'hint' }, 'แสดง ' + d.items.length + ' ออเดอร์ล่าสุด — ค้นหาด้วยเลขออเดอร์เพื่อหาออเดอร์เก่า'));
      }).catch(function (e) { clear(out); append(out, errorBox(e)); });
    }
    load(st.q);
  }

  /** กรอกยอดเงินของ 1 ออเดอร์ (ใช้ทั้งบันทึกใหม่และแก้ไข) */
  function viewFinPayment(app, st) {
    var holder = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    var footerBtn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1', disabled: true }, 'บันทึกยอดเงิน');
    page(app, 'บันทึกยอดเงิน', holder, footerBtn);
    append(holder, loadingBox());
    Api.read('finance.order', { internalOrderId: st.internalOrderId }).then(function (d) { build(d); })
      .catch(function (e) { clear(holder); append(holder, errorBox(e)); });

    function build(d) {
      clear(holder);
      var o = d.order, rec = d.record;
      var cancelled = o.status === 'CANCELLED';
      append(holder, el('div', { class: 'card' },
        el('div', { class: 'row' }, el('div', { class: 'grow' }, el('div', { class: 'small muted' }, o.channelName),
          el('div', { class: 'mono', style: 'font-weight:700;font-size:19px;word-break:break-all' }, o.orderNo)),
          el('span', { class: 'badge ' + (rec ? 'c-green' : 'c-amber') }, rec ? 'บันทึกแล้ว' : 'รอบันทึก')),
        el('div', { class: 'small muted', style: 'margin-top:6px' }, 'ส่งเมื่อ ' + o.completedAt + ' · ' + fmt(o.totalQty) + ' ชิ้น · ' + (ORDER_STATUS_LABEL[o.status] || o.status))));
      if (cancelled) {
        append(holder, el('div', { class: 'banner error' }, icon('alert'), el('div', null, 'ออเดอร์นี้ถูกยกเลิกแล้ว ไม่ต้องบันทึกยอดเงิน')));
        if (rec) append(holder, el('div', { class: 'card' }, el('h3', null, 'ยอดเงินที่เคยบันทึก'), finRecordRow(rec)));
        return;
      }
      // ---- ต้นทุนสินค้า ----
      var costInputs = {};
      var costCard = el('div', { class: 'card' }, el('h3', null, 'ต้นทุนสินค้า'));
      d.lines.forEach(function (l) {
        var right;
        if (l.unitCost == null) {
          var ci = moneyInput('', 'ทุน/' + l.unit);
          ci.style.width = '120px'; ci.style.textAlign = 'right';
          ci.addEventListener('input', recalc);
          costInputs[l.sku] = ci;
          right = el('div', { class: 'right' }, ci, el('div', { class: 'small', style: 'color:var(--danger);margin-top:4px' }, 'ยังไม่มีต้นทุน'));
        } else {
          right = el('div', { class: 'right' }, el('div', { style: 'font-weight:600' }, money(l.lineCost)),
            el('div', { class: 'small muted' }, money(l.unitCost) + ' × ' + fmt(l.qty)));
        }
        append(costCard, el('div', { class: 'row fin-line' },
          el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, l.name),
            el('div', { class: 'small muted mono' }, l.sku),
            el('div', { class: 'small muted' }, 'คิดต้นทุน ' + fmt(l.qty) + ' ' + l.unit + (l.qtyReturned ? ' (ขาย ' + fmt(l.qtySold) + ' คืน ' + fmt(l.qtyReturned) + ')' : ''))),
          right));
      });
      if (Object.keys(costInputs).length) append(costCard, el('div', { class: 'hint' }, 'ต้นทุนที่กรอกตรงนี้จะถูกจำไว้ใช้กับออเดอร์ต่อไปด้วย'));
      else append(costCard, el('div', { class: 'hint' }, 'แก้ต้นทุนได้ที่ การเงิน → ต้นทุนสินค้า'));

      // ---- ยอดเงิน ----
      var sale = moneyInput(rec ? rec.salePrice : '', 'เช่น 500');
      var recv = moneyInput(rec ? rec.receivedAmount : '', 'เช่น 420');
      var date = el('input', { class: 'input', type: 'date', value: rec ? rec.receivedDate : todayStr(0), max: todayStr(0) });
      var note = el('input', { class: 'input', maxLength: 300, value: rec ? rec.note : '', placeholder: 'เช่น รอบโอน 15/10' });
      [sale, recv].forEach(function (i) { i.addEventListener('input', recalc); });
      append(holder, el('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:12px' },
        el('div', { class: 'field' }, el('label', null, 'ราคาที่ลูกค้าจ่าย (บาท)'), sale),
        el('div', { class: 'field' }, el('label', null, 'เงินที่ได้รับจริง (บาท)'), recv,
          el('div', { class: 'hint' }, 'ยอดที่แพลตฟอร์มโอนเข้าบัญชี หลังหักค่าธรรมเนียมแล้ว')),
        el('div', { class: 'row' }, el('div', { class: 'field grow' }, el('label', null, 'วันที่ได้รับเงิน'), date)),
        el('div', { class: 'field' }, el('label', null, 'หมายเหตุ (ถ้ามี)'), note)));
      append(holder, costCard);

      // ---- ผลกำไร (คำนวณสด) ----
      var calcBox = el('div', { class: 'card fin-calc' });
      append(holder, calcBox);
      if (rec) append(holder, el('div', { class: 'small muted', style: 'text-align:center' }, 'บันทึกล่าสุด ' + rec.updatedAt + ' โดย ' + rec.updatedBy));

      function current() {
        var s = parseMoney(sale.value), r = parseMoney(recv.value);
        var cost = 0, missing = [], newCosts = {}, bad = false;
        d.lines.forEach(function (l) {
          if (l.unitCost != null) { cost += l.lineCost; return; }
          if (!l.qty) return;
          var raw = costInputs[l.sku].value.trim();
          var c = parseMoney(raw);
          if (raw && c == null) bad = true;
          if (c == null) { missing.push(l.sku); return; }
          newCosts[l.sku] = c;
          cost += Math.round(c * l.qty * 100) / 100;
        });
        cost = Math.round(cost * 100) / 100;
        return { s: s, r: r, cost: cost, missing: missing, newCosts: newCosts, bad: bad,
          badSale: sale.value.trim() !== '' && s == null, badRecv: recv.value.trim() !== '' && r == null };
      }
      function recalc() {
        var c = current();
        clear(calcBox);
        var rows = [['ราคาที่ลูกค้าจ่าย', c.s == null ? '—' : money(c.s)],
          ['ค่าธรรมเนียม/ส่วนลดที่ถูกหัก', c.s == null || c.r == null ? '—' : '−' + money(c.s - c.r)],
          ['เงินที่ได้รับจริง', c.r == null ? '—' : money(c.r)],
          ['ต้นทุนสินค้า', c.missing.length ? 'ยังขาด ' + c.missing.length + ' รายการ' : '−' + money(c.cost)]];
        append(calcBox, el('dl', { class: 'kv' }, rows.map(function (r) { return [el('dt', null, r[0]), el('dd', null, r[1])]; })));
        var ready = c.s != null && c.r != null && !c.missing.length && !c.bad;
        if (ready) {
          var profit = Math.round((c.r - c.cost) * 100) / 100;
          var pct = c.s > 0 ? Math.round(profit / c.s * 10000) / 100 : 0;
          append(calcBox, el('div', { class: 'fin-profit', style: 'color:' + profitColor(profit) },
            el('div', { class: 'small' }, profit < 0 ? 'ขาดทุนต่อออเดอร์' : 'กำไรต่อออเดอร์'),
            el('div', { class: 'v' }, (profit > 0 ? '+' : '') + money(profit) + ' บาท'),
            el('div', null, money(pct) + '% ของราคาขาย')));
          if (c.r > c.s) append(calcBox, el('div', { class: 'banner warn' }, icon('alert'), el('div', null, 'เงินที่ได้รับมากกว่าราคาที่ลูกค้าจ่าย — ตรวจตัวเลขอีกครั้ง')));
        } else {
          var why = c.badSale || c.badRecv || c.bad ? 'ตัวเลขไม่ถูกต้อง (ใส่ได้ทศนิยมไม่เกิน 2 ตำแหน่ง)' :
            c.missing.length ? 'กรอกต้นทุนสินค้าให้ครบเพื่อดูกำไร' : 'กรอกราคาที่ลูกค้าจ่ายและเงินที่ได้รับ';
          append(calcBox, el('div', { class: 'hint', style: 'text-align:center;margin-top:8px' }, why));
        }
        footerBtn.disabled = !ready;
        footerBtn.textContent = rec ? 'บันทึกการแก้ไข' : 'บันทึกยอดเงิน';
        return c;
      }
      recalc();
      setTimeout(function () { (rec ? recv : sale).focus(); }, 120);

      footerBtn.addEventListener('click', function () {
        var c = recalc();
        if (footerBtn.disabled) return;
        if (!date.value || date.value > todayStr(0)) { showError({ message: 'วันที่ได้รับเงินต้องไม่เป็นวันในอนาคต' }); return; }
        var profit = Math.round((c.r - c.cost) * 100) / 100;
        var rows = [['ออเดอร์', o.orderNo], ['ราคาที่ลูกค้าจ่าย', money(c.s)], ['เงินที่ได้รับจริง', money(c.r)], ['ต้นทุนสินค้า', money(c.cost)],
          [profit < 0 ? 'ขาดทุน' : 'กำไร', money(profit) + ' บาท'], ['วันที่ได้รับเงิน', date.value]];
        Object.keys(c.newCosts).forEach(function (k) { rows.push(['ต้นทุนใหม่ ' + k, money(c.newCosts[k]) + ' / ชิ้น']); });
        confirmSheet({ title: rec ? 'ยืนยันแก้ไขยอดเงิน' : 'ยืนยันบันทึกยอดเงิน', confirmText: 'ยืนยันบันทึก', rows: rows, lines: [] }).then(function (ok) {
          if (!ok) return;
          submitWrite('finance.payment.save', {
            internalOrderId: o.internalOrderId, salePrice: c.s, receivedAmount: c.r, receivedDate: date.value,
            note: note.value.trim(), newCosts: c.newCosts
          }, 'ยอดเงินออเดอร์ ' + o.orderNo).then(function (res) {
            if (!res) return;
            replaceTop(finResultView, res);
          }).catch(function (e) {
            if (e.code === 'COST_MISSING') { showError(e).then(function () { replaceTop(viewFinPayment, st); }); return; }
            showError(e);
          });
        });
      });
    }
  }

  function finResultView(app, d) {
    beep(true);
    var r = d.record;
    page(app, 'บันทึกยอดเงิน', [
      el('div', { class: 'card result' },
        el('div', { class: 'big' }, icon('check')),
        el('h2', null, d.message),
        el('div', { class: 'muted', style: 'margin-top:6px' }, r.channelName + ' · เลขออเดอร์'),
        el('div', { class: 'doc' }, r.orderNo)),
      el('div', { class: 'card fin-calc' },
        el('dl', { class: 'kv' },
          el('dt', null, 'ราคาที่ลูกค้าจ่าย'), el('dd', null, money(r.salePrice)),
          el('dt', null, 'ค่าธรรมเนียม/ส่วนลด'), el('dd', null, '−' + money(r.feeAmount)),
          el('dt', null, 'เงินที่ได้รับจริง'), el('dd', null, money(r.receivedAmount)),
          el('dt', null, 'ต้นทุนสินค้า'), el('dd', null, '−' + money(r.costAmount))),
        el('div', { class: 'fin-profit', style: 'color:' + profitColor(r.profit) },
          el('div', { class: 'small' }, r.profit < 0 ? 'ขาดทุนต่อออเดอร์' : 'กำไรต่อออเดอร์'),
          el('div', { class: 'v' }, (r.profit > 0 ? '+' : '') + money(r.profit) + ' บาท'),
          el('div', null, money(r.marginPct) + '% ของราคาขาย')))
    ], [
      el('button', { class: 'btn btn-outline', style: 'flex:1', onclick: function () { stack = stack.slice(0, 2); render(); } }, 'เมนูการเงิน'),
      el('button', { class: 'btn btn-primary', style: 'flex:2', onclick: function () { stack = stack.slice(0, 2); go(viewFinPending); } }, 'ออเดอร์ถัดไป')
    ]);
  }

  /** กำไรต่อออเดอร์ (รายการที่บันทึกแล้ว) */
  function viewFinRecords(app, st) {
    st = st || { channelId: '', q: '', onlyLoss: false, from: '', to: '' };
    var out = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    var q = el('input', { class: 'input mono', placeholder: 'ค้นหาเลขออเดอร์', value: st.q, autocapitalize: 'characters', enterkeyhint: 'search' });
    var from = el('input', { class: 'input', type: 'date', value: st.from });
    var to = el('input', { class: 'input', type: 'date', value: st.to });
    q.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); apply(); } });
    function apply() { replaceTop(viewFinRecords, { channelId: st.channelId, q: q.value.trim(), onlyLoss: st.onlyLoss, from: from.value, to: to.value }); }
    page(app, 'กำไรต่อออเดอร์', [
      channelChips(st.channelId, function (c) { st.channelId = c; apply(); }),
      el('div', { class: 'card', style: 'display:flex;flex-direction:column;gap:10px' },
        q,
        el('div', { class: 'row' }, el('div', { class: 'field grow' }, el('label', null, 'รับเงินตั้งแต่'), from), el('div', { class: 'field grow' }, el('label', null, 'ถึง'), to)),
        el('div', { class: 'row' },
          el('button', { class: 'chip' + (st.onlyLoss ? ' on' : ''), onclick: function () { st.onlyLoss = !st.onlyLoss; apply(); } }, 'เฉพาะออเดอร์ขาดทุน'),
          el('div', { class: 'grow' }),
          el('button', { class: 'btn btn-primary', style: 'min-height:44px', onclick: apply }, icon('search'), 'ค้นหา'))),
      out
    ]);
    append(out, loadingBox());
    Api.read('finance.records', { channelId: st.channelId, q: st.q, onlyLoss: st.onlyLoss, dateFrom: st.from, dateTo: st.to }).then(function (d) {
      clear(out);
      append(out, el('div', { class: 'small muted' }, 'พบ ' + fmt(d.total) + ' ออเดอร์ · แตะเพื่อดูหรือแก้ไข'));
      append(out, el('div', { class: 'card' }, d.items.length ? d.items.map(finRecordRow) : el('div', { class: 'empty' }, 'ไม่พบรายการ')));
      if (d.truncated) append(out, el('div', { class: 'hint' }, 'แสดง ' + d.items.length + ' รายการล่าสุด — ใช้ตัวกรองเพื่อจำกัดผล'));
    }).catch(function (e) { clear(out); append(out, errorBox(e)); });
  }

  /** ต้นทุนสินค้า */
  function viewFinCosts(app, st) {
    st = st || {};
    var out = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    var bar = scanBar({ title: 'สแกนสินค้า', placeholder: 'ค้นหา/สแกน SKU หรือชื่อสินค้า', onCode: function (v) { st.q = v; load(true); } });
    page(app, 'ต้นทุนสินค้า', [
      el('div', { class: 'tabs' },
        el('button', { class: 'chip' + (!st.onlyMissing ? ' on' : ''), onclick: function () { replaceTop(viewFinCosts, { onlyMissing: false }); } }, 'ทั้งหมด'),
        el('button', { class: 'chip' + (st.onlyMissing ? ' on' : ''), onclick: function () { replaceTop(viewFinCosts, { onlyMissing: true }); } }, 'ยังไม่มีต้นทุน')),
      bar, out
    ]);
    function open(item) { costForm(item).then(function (ok) { if (ok) load(false); }); }
    function load(auto) {
      clear(out); append(out, loadingBox());
      Api.read('finance.costs', { q: st.q || '', onlyMissing: !!st.onlyMissing }).then(function (d) {
        clear(out);
        if (auto && d.items.length === 1) open(d.items[0]);
        if (st.q) append(out, el('div', { class: 'row' }, el('div', { class: 'grow small muted' }, 'ผลค้นหา "' + st.q + '" — ' + fmt(d.total) + ' รายการ'),
          el('button', { class: 'chip', onclick: function () { st.q = ''; load(false); } }, 'ล้างค้นหา')));
        if (!d.items.length) { append(out, el('div', { class: 'card empty' }, st.onlyMissing && !st.q ? 'สินค้าทุกตัวมีต้นทุนแล้ว' : 'ไม่พบสินค้า')); return; }
        append(out, d.items.map(function (it) {
          return el('button', { class: 'list-btn', onclick: function () { open(it); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, it.name), el('div', { class: 'small muted mono' }, it.sku)),
            it.unitCost == null ? el('span', { class: 'badge c-red' }, 'ยังไม่มีต้นทุน')
              : el('div', { class: 'right' }, el('div', { style: 'font-weight:700' }, money(it.unitCost)), el('div', { class: 'small muted' }, 'บาท/' + it.unit)));
        }));
        if (d.truncated) append(out, el('div', { class: 'hint' }, 'แสดง ' + d.items.length + ' รายการแรก — พิมพ์ค้นหาเพื่อหาสินค้าอื่น'));
      }).catch(function (e) { clear(out); append(out, errorBox(e)); });
    }
    load(false);
  }

  /* ================================================================ */
  /* ตั้งค่าระบบ (ADMIN)                                                */
  /* ================================================================ */
  function viewAdmin(app, st) {
    st = st || { tab: 'channels' };
    var tabs = [['channels', 'ช่องทางขาย'], ['users', 'พนักงาน'], ['products', 'สินค้า'], ['settings', 'ตั้งค่า'], ['system', 'ตรวจระบบ']];
    var body = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    page(app, 'ตั้งค่าระบบ', [el('div', { class: 'tabs' }, tabs.map(function (t) {
      return el('button', { class: 'chip' + (st.tab === t[0] ? ' on' : ''), onclick: function () { replaceTop(viewAdmin, { tab: t[0] }); } }, t[1]);
    })), body]);
    var loading = el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' }));
    append(body, loading);
    function fail(e) { clear(body); append(body, el('div', { class: 'banner error' }, icon('alert'), el('div', null, e.message))); }
    function reload() { replaceTop(viewAdmin, { tab: st.tab }); }

    if (st.tab === 'channels') {
      Api.read('admin.channels', {}).then(function (d) {
        clear(body);
        append(body, el('button', { class: 'btn btn-primary btn-block', onclick: function () { channelForm(null).then(function (s) { if (s) { refreshBoot(); reload(); } }); } }, icon('plus'), 'เพิ่มช่องทางขาย'));
        d.channels.forEach(function (c) {
          append(body, el('button', { class: 'list-btn', onclick: function () { channelForm(c).then(function (s) { if (s) { refreshBoot(); reload(); } }); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, c.name), el('div', { class: 'small muted' }, c.channelId + ' · ' + (c.mode === 'AUTO' ? 'ออกเลขอัตโนมัติ ' + c.prefix + '-yyyyMMdd-0001' : 'สแกนเลขออเดอร์จริง'))),
            el('span', { class: 'badge ' + (c.active ? 'c-green' : 'c-gray') }, c.active ? 'เปิด' : 'ปิด')));
        });
      }).catch(fail);
    } else if (st.tab === 'users') {
      Api.read('admin.users', {}).then(function (d) {
        clear(body);
        append(body, el('div', { class: 'hint' }, 'พนักงานใหม่ให้เปิดเมนูคลังสินค้าใน LINE หนึ่งครั้ง แล้วชื่อจะขึ้นที่นี่ในสถานะ "รออนุมัติ"'));
        d.users.sort(function (a, b) { return (a.active ? 1 : 0) - (b.active ? 1 : 0); }).forEach(function (u) {
          append(body, el('button', { class: 'list-btn', onclick: function () { userForm(u).then(function (s) { if (s) reload(); }); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, u.name), el('div', { class: 'small muted' }, (ROLE_LABEL[u.role] || u.role) + ' · LINE: ' + (u.lineName || '-')), el('div', { class: 'small muted mono' }, u.userId)),
            el('span', { class: 'badge ' + (u.active ? 'c-green' : 'c-amber') }, u.active ? 'ใช้งาน' : 'รออนุมัติ/ปิด')));
        });
      }).catch(fail);
    } else if (st.tab === 'products') {
      clear(body);
      append(body, [
        el('button', { class: 'btn btn-primary btn-block', onclick: function () {
          sheet(function (close) {
            var i = el('input', { class: 'input mono', placeholder: 'สแกน/พิมพ์ SKU ใหม่', autofocus: true, autocapitalize: 'characters' });
            return [el('h2', null, 'สร้างสินค้าใหม่'), i, el('button', { class: 'btn btn-primary btn-block', onclick: function () { if (i.value.trim()) close(i.value.trim()); } }, 'ถัดไป'),
              el('button', { class: 'btn btn-outline btn-block', onclick: function () { Scanner.open({ title: 'สแกน SKU ใหม่', onCode: function (c) { close(c); } }); } }, icon('scan'), 'สแกนด้วยกล้อง')];
          }).then(function (sku) { if (sku) productForm({ sku: sku.toUpperCase() }, true).then(function (p) { if (p) toast('สร้างสินค้าแล้ว', 'ok'); }); });
        } }, icon('plus'), 'สร้างสินค้าใหม่'),
        el('button', { class: 'btn btn-outline btn-block', onclick: function () {
          productPicker({ includeInactive: true, allowEmpty: true }).then(function (p) { if (p) productForm(p, false); });
        } }, icon('search'), 'ค้นหาและแก้ไขสินค้า')]);
    } else if (st.tab === 'settings') {
      Api.read('admin.settings', {}).then(function (d) {
        clear(body);
        d.settings.forEach(function (s) {
          append(body, el('button', { class: 'list-btn', disabled: !s.editable, onclick: function () { settingForm(s).then(function (ok) { if (ok) { refreshBoot(); reload(); } }); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, s.description), el('div', { class: 'small muted' }, s.key), el('div', { style: 'word-break:break-word' }, s.value)),
            s.editable ? null : el('span', { class: 'badge c-gray' }, 'ล็อก')));
        });
      }).catch(fail);
    } else {
      clear(body);
      var res = el('div');
      append(body, [
        el('div', { class: 'card' }, el('dl', { class: 'kv' },
          el('dt', null, 'เวอร์ชัน'), el('dd', null, State.app.version),
          el('dt', null, 'API'), el('dd', { class: 'small mono' }, C.API_URL),
          el('dt', null, 'LIFF ID'), el('dd', { class: 'mono' }, C.LIFF_ID))),
        el('button', { class: 'btn btn-primary btn-block', onclick: function () {
          clear(res); append(res, el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' })));
          Api.read('reconcile', {}).then(function (r) {
            clear(res);
            append(res, r.ok ? el('div', { class: 'banner ok' }, icon('check'), el('div', null, 'ยอดสต๊อกตรงกับประวัติธุรกรรมทุก SKU (' + r.checkedSkus + ' SKU) ตรวจเมื่อ ' + r.checkedAt))
              : el('div', { class: 'banner error' }, icon('alert'), el('div', null, 'พบยอดไม่ตรง ' + r.mismatches.length + ' SKU, รายการค้าง ' + r.pendingOperations + ' — ' + r.mismatches.map(function (m) { return m.sku; }).join(', '))));
          }).catch(function (e) { clear(res); append(res, el('div', { class: 'err-text' }, e.message)); });
        } }, icon('shield'), 'ตรวจความถูกต้องของยอดสต๊อก'), res]);
    }
  }

  function channelForm(c) {
    var isNew = !c; c = c || { mode: 'SCAN', active: true };
    return sheet(function (close) {
      var id = el('input', { class: 'input mono', value: c.channelId || '', readOnly: !isNew, placeholder: 'เช่น FACEBOOK', autocapitalize: 'characters' });
      var name = el('input', { class: 'input', value: c.name || '', placeholder: 'ชื่อที่แสดง' });
      var prefix = el('input', { class: 'input mono', value: c.prefix || '', placeholder: 'เช่น FB', autocapitalize: 'characters' });
      var prefixF = el('div', { class: 'field' + (c.mode === 'AUTO' ? '' : ' hidden') }, el('label', null, 'คำนำหน้าเลขออเดอร์'), prefix);
      var mode = choiceGroup([['SCAN', 'สแกนเลขออเดอร์จริง', 'แพลตฟอร์มออนไลน์'], ['AUTO', 'ระบบออกเลขให้', 'ขายเอง/หน้าร้าน']], c.mode, function (v) { prefixF.classList.toggle('hidden', v !== 'AUTO'); });
      var active = el('input', { type: 'checkbox', checked: c.active !== false, style: 'width:22px;height:22px' });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, 'บันทึก');
      save.addEventListener('click', function () {
        save.disabled = true; err.textContent = '';
        submitWrite('admin.channel.save', { isNew: isNew, channelId: id.value.trim().toUpperCase(), name: name.value.trim(), mode: mode.value(), prefix: prefix.value.trim().toUpperCase(), active: active.checked, sortOrder: c.sortOrder }, 'บันทึกช่องทาง ' + name.value)
          .then(function (d) { if (d) { toast(d.message, 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; });
      });
      return [el('h2', null, isNew ? 'เพิ่มช่องทางขาย' : 'แก้ไขช่องทางขาย'),
        el('div', { class: 'field' }, el('label', null, 'รหัสช่องทาง (A-Z, 0-9)'), id), el('div', { class: 'field' }, el('label', null, 'ชื่อช่องทาง'), name),
        el('div', { class: 'field' }, el('div', { class: 'label' }, 'วิธีระบุเลขออเดอร์'), mode), prefixF,
        el('label', { class: 'row' }, active, 'เปิดใช้งาน'), err, save, el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, 'ยกเลิก')];
    });
  }

  function userForm(u) {
    return sheet(function (close) {
      var name = el('input', { class: 'input', value: u.name });
      var role = choiceGroup([['STAFF', 'พนักงาน', 'ทำรายการสต๊อกได้'], ['ADMIN', 'ผู้ดูแลระบบ', 'ทำได้ทุกอย่าง'], ['VIEWER', 'ดูอย่างเดียว', 'ดูยอด/รายงาน']], u.role);
      var active = el('input', { type: 'checkbox', checked: u.active, style: 'width:22px;height:22px' });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, u.active ? 'บันทึก' : 'บันทึก / อนุมัติ');
      save.addEventListener('click', function () {
        save.disabled = true;
        submitWrite('admin.user.save', { userId: u.userId, name: name.value.trim(), role: role.value(), active: active.checked }, 'บันทึกพนักงาน ' + name.value)
          .then(function (d) { if (d) { toast(d.message, 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; });
      });
      if (!u.active) active.checked = true;
      return [el('h2', null, 'ข้อมูลพนักงาน'), el('div', { class: 'small muted mono' }, u.userId),
        el('div', { class: 'field' }, el('label', null, 'ชื่อที่แสดงในประวัติ'), name),
        el('div', { class: 'field' }, el('div', { class: 'label' }, 'บทบาท'), role),
        el('label', { class: 'row' }, active, 'อนุญาตให้ใช้งาน'), err, save,
        el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, 'ยกเลิก')];
    });
  }

  function settingForm(s) {
    return sheet(function (close) {
      var input;
      if (s.key === 'SCAN_MODE') input = choiceGroup([['QTY', 'สแกนแล้วกรอกจำนวน'], ['EACH', 'สแกนทีละชิ้น (+1)']], s.value);
      else input = el(/_REASONS$|_TYPES$/.test(s.key) ? 'textarea' : 'input', { class: 'input', value: s.value });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, 'บันทึก');
      save.addEventListener('click', function () {
        save.disabled = true;
        var v = typeof input.value === 'function' ? input.value() : input.value;
        submitWrite('admin.setting.save', { key: s.key, value: v }, 'ตั้งค่า ' + s.key).then(function (d) { if (d) { toast(d.message, 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; });
      });
      return [el('h2', null, s.description), el('div', { class: 'small muted' }, s.key + (/_REASONS$|_TYPES$/.test(s.key) ? ' — คั่นแต่ละรายการด้วยเครื่องหมายจุลภาค ( , )' : '')), input, err, save,
        el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, 'ยกเลิก')];
    });
  }

  function refreshBoot() {
    return Api.read('bootstrap', {}).then(function (d) { State.settings = d.settings; State.channels = d.channels; State.perms = d.perms; }).catch(function () { });
  }

  /* ================================================================ */
  /* หน้าจอพิเศษ: ยังไม่ตั้งค่า / รออนุมัติ / ผิดพลาด                       */
  /* ================================================================ */
  function viewMessage(app, m) {
    clear(app);
    append(app, el('div', { class: 'boot' },
      el('div', { class: 'boot-logo', style: m.kind === 'error' ? 'background:var(--danger)' : '' }, m.kind === 'error' ? '!' : 'WMS'),
      el('h2', { style: 'margin:0;color:var(--ink)' }, m.title),
      el('p', { style: 'white-space:pre-line;margin:0' }, m.message),
      m.code ? el('div', { class: 'card', style: 'width:100%' }, el('div', { class: 'small muted' }, m.codeLabel || 'รหัส'), el('div', { class: 'mono', style: 'word-break:break-all;font-weight:600' }, m.code),
        el('button', { class: 'btn btn-outline btn-block', style: 'margin-top:10px', onclick: function () {
          try { navigator.clipboard.writeText(m.code).then(function () { toast('คัดลอกแล้ว', 'ok'); }); } catch (e) { toast('คัดลอกไม่ได้ กรุณาจดรหัส', 'error'); }
        } }, 'คัดลอกรหัส')) : null,
      el('button', { class: 'btn btn-primary btn-block', onclick: function () { location.reload(); } }, icon('refresh'), 'ลองใหม่')));
  }

  /* ================================================================ */
  /* Boot                                                               */
  /* ================================================================ */
  function configured() {
    return C.LIFF_ID && C.API_URL && C.LIFF_ID.indexOf('YOUR_') !== 0 && C.API_URL.indexOf('YOUR_') < 0;
  }

  function boot() {
    var app = $('#app');
    if (!configured()) {
      viewMessage(app, { title: 'ยังไม่ได้ตั้งค่าการเชื่อมต่อ', message: 'ผู้ดูแลระบบต้องแก้ไฟล์ config.js ใส่ LIFF_ID และ API_URL ก่อนใช้งาน (ดูคู่มือติดตั้ง ขั้นตอนที่ 7)', kind: 'error' });
      return;
    }
    Auth.init().then(function () {
      return Api.raw('bootstrap', {});
    }).then(function (j) {
      sessionStorage.removeItem('wms_relogin');
      var d = j.data;
      State.user = d.user; State.perms = d.perms; State.settings = d.settings; State.channels = d.channels; State.app = d.app;
      stack = [[viewHome]];
      try { history.replaceState({ d: 1 }, ''); } catch (e) { /* */ }
      render();
      return checkPending(false).then(function (r) { if (r !== null) render(); });
    }).catch(function (e) {
      if (e && e.code === 'AUTH_EXPIRED') return Auth.relogin();
      if (e && e.code === 'USER_PENDING') {
        viewMessage(app, { title: 'รอผู้ดูแลอนุมัติ', message: 'ระบบลงทะเบียนชื่อ LINE ของคุณ' + (e.details && e.details.name ? ' (' + e.details.name + ')' : '') + ' แล้ว\nกรุณาแจ้งผู้ดูแลระบบให้อนุมัติในเมนู ตั้งค่าระบบ > พนักงาน', code: e.details && e.details.userId, codeLabel: 'รหัสผู้ใช้ LINE ของคุณ' });
        return;
      }
      viewMessage(app, { title: 'เปิดระบบไม่สำเร็จ', message: (e && e.message) || String(e), kind: 'error' });
    });
  }

  // เปิดให้ทดสอบอัตโนมัติเข้าถึงสถานะได้ (ไม่มีข้อมูลลับ)
  window.__WMS__ = { State: State, Scanner: Scanner, Pending: Pending };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
