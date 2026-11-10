Warning: truncated output (original token count: 59724)
Total output lines: 2879

/* LINE WMS — LIFF Frontend (Vanilla JS)
 * หน้าจอทั้งหมดของพนักงาน: รับเข้า ขายหน้าร้าน (บิลเงินสด) ขายออกแพลตฟอร์ม (ใบรายการสินค้า) รับคืน ส่งคืน ตัดเสีย เช็กสต๊อก ตรวจนับ ประวัติ Dashboard ตั้งค่า และการเงิน (ADMIN)
 * หลักความปลอดภัย: หน้าจอส่งเฉพาะ LINE ID Token ไปให้ Server ตรวจ ไม่ส่ง/ไม่เชื่อ User ID เอง
 */
(function () {
  'use strict';

  var C = window.APP_CONFIG || {};
  var State = { user: null, perms: {}, settings: {}, channels: [], app: {} };

  var TX_LABEL = { IN: _t('รับเข้า'), OUT: _t('ขายออก'), RETURN: _t('รับคืน'), SUPPLIER_RETURN: _t('ส่งคืนซัพพลายเออร์'), WRITE_OFF: _t('ตัดเสีย'), ADJUST: _t('ปรับยอด'), TRANSFER: _t('ย้ายสถานะ'), CANCEL: _t('ยกเลิกออเดอร์') };
  var STATUS_LABEL = { AVAILABLE: _t('พร้อมขาย'), INSPECTION: _t('รอตรวจสอบ') };
  var ORDER_STATUS_LABEL = { COMPLETED: _t('ตัดสต๊อกแล้ว'), RETURNED_PARTIAL: _t('คืนบางส่วน'), RETURNED_FULL: _t('คืนครบแล้ว'), CANCELLED: _t('ยกเลิกแล้ว') };
  var COND = [['GOOD', _t('สภาพดี'), _t('เข้ายอดพร้อมขาย')], ['CHECK', _t('ชำรุด รอตรวจ'), _t('เข้ายอดรอตรวจสอบ')], ['DAMAGED', _t('เสียหาย'), _t('ตัดเสียทันที')]];
  var ROLE_LABEL = { ADMIN: _t('ผู้ดูแลระบบ'), STAFF: _t('พนักงาน'), VIEWER: _t('ดูอย่างเดียว') };

  /* ================================================================ */
  /* Icons (inline SVG)                                                */
  /* ================================================================ */
  var P = {
    back: '<path d="M15 18l-6-6 6-6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9M12 3c-2.5 2.7-3.8 5.7-3.8 9s1.3 6.3 3.8 9"/>',
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
    receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
    box: '<path d="M21 8l-9-5-9 5v8l9 5 9-5z"/><path d="M3 8l9 5 9-5M12 13v8"/>',
    chev: '<path d="M9 6l6 6-6 6"/>',
    store: '<path d="M3 9l1.5-5h15L21 9"/><path d="M3 9a3 3 0 006 0 3 3 0 006 0 3 3 0 006 0"/><path d="M5 12v8h14v-8M10 20v-5h4v5"/>',
    doc: '<path d="M7 3h7l5 5v13H7z"/><path d="M14 3v5h5M10 13h6M10 17h6"/>',
    printer: '<path d="M7 9V3h10v6"/><rect x="3" y="9" width="18" height="8" rx="2"/><path d="M7 14h10v7H7z"/>'
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
        el('div', { class: 'actions' }, el('button', { class: 'btn btn-primary btn-block', onclick: function () { close(true); } }, _t('ตกลง')))
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
        cfg.rows ? el('dl', { class: 'kv' }, cfg.rows.map(function (r) { return [el('dt', null, r[0]), el('dd', null, I18N.d(r[1]))]; })) : null,
        lines.length ? el('div', { class: 'card', style: 'box-shadow:none;background:var(--bg)' },
          lines.map(function (l) {
            return el('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--line)' },
              el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, l.name), el('div', { class: 'small muted mono' }, l.sku + (l.extra ? ' · ' + l.extra : ''))),
              el('div', { style: 'font-weight:700;font-size:18px' }, (l.sign || '') + fmt(l.qty) + ' ' + (_u(l.unit) || '')));
          }),
          el('div', { class: 'summary-total', style: 'padding-top:8px' }, el('span', null, _t('รวม ') + lines.length + _t(' รายการ')), el('span', null, fmt(total) + _t(' หน่วย')))) : null,
        el('div', { class: 'actions' },
          el('button', { class: 'btn btn-lg btn-block ' + (cfg.danger ? 'btn-danger' : 'btn-primary'), onclick: function (e) { e.currentTarget.disabled = true; close(true); } }, icon('check'), cfg.confirmText || _t('ยืนยันบันทึก')),
          el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, _t('กลับไปแก้ไข')))
      ];
    });
  }
  var busyEl = null;
  function busy(msg) {
    if (!busyEl) { busyEl = el('div', { class: 'busy' }, el('div', { class: 'spinner' }), el('div', { class: 'busy-msg' })); document.body.appendChild(busyEl); }
    busyEl.querySelector('.busy-msg').textContent = msg || _t('กำลังโหลด…');
  }
  function unbusy() { if (busyEl) { busyEl.remove(); busyEl = null; } }

  /* ================================================================ */
  /* Auth (LIFF)                                                        */
  /* ================================================================ */
  var Auth = {
    init: function () {
      if (!window.liff) return Promise.reject(appErr('LIFF_MISSING', _t('โหลด LINE LIFF SDK ไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วเปิดใหม่')));
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
        return alertSheet(_t('เข้าสู่ระบบไม่สำเร็จ'), _t('กรุณาปิดหน้าจอนี้แล้วเปิดเมนูคลังสินค้าใน LINE ใหม่อีกครั้ง'), 'error');
      }
      sessionStorage.setItem('wms_relogin', String(n + 1));
      busy(_t('กำลังเข้าสู่ระบบใหม่…'));
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
          try { json = JSON.parse(text); } catch (e) { throw appErr('BAD_RESPONSE', _t('เซิร์ฟเวอร์ตอบกลับไม่ถูกต้อง'), null, { network: true }); }
          if (!json.ok) throw appErr(json.error.code, I18N.err(json.error.code, json.error.message), json.error.details, { serverMessage: json.error.message });
          return json;
        }, function (err) {
          clearTimeout(timer);
          if (err && err.code) throw err;
          throw appErr('NETWORK', _t('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ต'), null, { network: true });
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
          if (n <= 0) throw appErr('UNCERTAIN', _t('ยังไม่ทราบผลการบันทึก'), null, { uncertain: true });
          return sleep(2000).then(function () { return poll(n - 1); });
        }, function (e) {
          if (n <= 0) throw appErr('UNCERTAIN', _t('ยังไม่ทราบผลการบันทึก'), null, { uncertain: true });
          return sleep(2000).then(function () { return poll(n - 1); });
        });
      }
      function go() {
        attempt++;
        return Api.raw(action, payload, requestId).then(function (j) { return { data: j.data, replay: !!j.replay }; }, function (e) {
          if (e.network) {
            if (attempt < 3) { busy(_t('สัญญาณไม่ดี กำลังลองส่งอีกครั้ง (') + attempt + '/2)…'); return sleep(1500 * attempt).then(go); }
            return poll(2);
          }
          if (e.code === 'BUSY' && attempt < 4) { busy(_t('มีพนักงานอื่นกำลังบันทึก รอสักครู่…')); return sleep(1500).then(go); }
          if (e.code === 'UNCERTAIN') { busy(_t('กำลังตรวจสอบผลการบันทึก…')); return sleep(1500).then(function () { return poll(3); }); }
          throw e;
        });
      }
      return go();
    }
  };

  /** เรียก Supabase สำหรับงานที่ย้ายแยกเข้ามาแล้ว โดยไม่เปลี่ยน API งานคลังเดิม */
  function supabaseAction(action, payload) {
    if (!C.SUPABASE_API_URL || !C.SUPABASE_PUBLISHABLE_KEY) {
      return Promise.reject(appErr('SUPABASE_CONFIG', _t('ยังไม่ได้ตั้งค่า Supabase')));
    }
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctl) ctl.abort(); }, C.REQUEST_TIMEOUT_MS || 30000);
    return fetch(C.SUPABASE_API_URL, {
      method: 'POST',
      headers: { apikey: C.SUPABASE_PUBLISHABLE_KEY },
      body: JSON.stringify({ action: action, idToken: Auth.token(), payload: payload || {} }),
      signal: ctl ? ctl.signal : undefined,
      cache: 'no-store'
    }).then(function (res) { return res.text(); }).then(function (raw) {
      clearTimeout(timer);
      var json;
      try { json = JSON.parse(raw); } catch (e) { throw appErr('BAD_RESPONSE', _t('Supabase ตอบกลับไม่ถูกต้อง')); }
      if (!json.ok) throw appErr(json.error.code, json.error.message, json.error.details);
      return json.data;
    }, function (err) {
      clearTimeout(timer);
      if (err && err.code) throw err;
      throw appErr('SUPABASE_NETWORK', _t('เชื่อมต่อ Supabase ไม่สำเร็จ'), null, { network: true });
    });
  }

  /** ทดสอบการยืนยัน LINE กับ Supabase */
  function connectSupabase() { return supabaseAction('bootstrap', {}).then(function (d) { return d; }); }

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
    busy(_t('กำลังบันทึก… ห้ามปิดหน้าจอ'));
    return Api.write(action, payload, rid).then(function (r) {
      Pending.clear(); unbusy(); productCache = {};
      if (r.replay) toast(_t('รายการนี้ถูกบันทึกไว้แล้ว (ไม่บันทึกซ้ำ)'), 'ok');
      return r.data;
    }, function (e) {
      unbusy();
      if (e.uncertain) {
        return sheet(function (close) {
          return [
            el('h2', null, _t('ยังไม่ทราบผลการบันทึก')),
            el('div', { class: 'banner warn' }, icon('alert'), el('div', null, _t('สัญญาณขาดระหว่างบันทึก "') + label + _t('" ระบบเก็บรายการไว้แล้ว กดตรวจสอบสถานะได้เลย ห้ามทำรายการเดิมซ้ำด้วยมือ'))),
            el('div', { class: 'actions' },
              el('button', { class: 'btn btn-primary btn-block', onclick: function () { close('check'); } }, icon('refresh'), _t('ตรวจสอบสถานะ')),
              el('button', { class: 'btn btn-outline btn-block', onclick: function () { close('later'); } }, _t('ไว้ตรวจทีหลัง')))
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
    busy(_t('กำลังตรวจสอบรายการล่าสุด…'));
    return Api.raw('request.status', { requestId: p.requestId }).then(function (j) {
      unbusy();
      if (j.data.status === 'DONE') {
        Pending.clear(); productCache = {};
        return alertSheet(_t('บันทึกสำเร็จแล้ว'), '"' + p.label + _t('" ถูกบันทึกเรียบร้อย') + resultRef(j.data.data)).then(function () { return j.data.data; });
      }
      return sheet(function (close) {
        return [
          el('h2', null, _t('รายการยังไม่ถูกบันทึก')),
          el('div', { class: 'msg' }, '"' + p.label + _t('" ยังไม่พบในระบบ ต้องการส่งรายการเดิมอีกครั้งหรือไม่?\n(ระบบใช้รหัสคำขอเดิม จึงไม่บันทึกซ้ำแน่นอน)')),
          el('div', { class: 'actions' },
            el('button', { class: 'btn btn-primary btn-block', onclick: function () { close('resend'); } }, _t('ส่งรายการเดิมอีกครั้ง')),
            el('button', { class: 'btn btn-outline btn-block', onclick: function () { close('drop'); } }, _t('ยกเลิกรายการนี้')))
        ];
      }, { locked: true }).then(function (c) {
        if (c === 'resend') {
          return submitWrite(p.action, p.payload, p.label, p.requestId).then(function (d) {
            if (d) return alertSheet(_t('บันทึกสำเร็จ'), '"' + p.label + _t('" บันทึกเรียบร้อย') + resultRef(d)).then(function () { return d; });
            return null;
          }).catch(showError);
        }
        Pending.clear();
        return null;
      });
    }, function (e) {
      unbusy();
      if (interactive) toast(_t('ยังตรวจสอบไม่ได้: ') + e.message, 'error');
      return null;
    });
  }
  function resultRef(d) {
    if (!d) return '';
    return d.orderNo ? _t('\nเลขออเดอร์: ') + d.orderNo : (d.docNo ? _t('\nเลขเอกสาร: ') + d.docNo : '');
  }

  function showError(e) {
    unbusy();
    if (!e) return;
    beep(false);
    var title = {
      INSUFFICIENT_STOCK: _t('สต๊อกไม่พอ'), DUPLICATE_ORDER: _t('ออเดอร์ซ้ำ'), SKU_NOT_FOUND: _t('ไม่พบสินค้า'), FORBIDDEN: _t('ไม่มีสิทธิ์'),
      RETURN_EXCEEDS: _t('รับคืนเกินจำนวน'), STALE_BALANCE: _t('ยอดในระบบเปลี่ยน'), NETWORK: _t('เชื่อมต่อไม่ได้'), BUSY: _t('ระบบไม่ว่าง')
    }[e.code] || _t('ทำรายการไม่สำเร็จ');
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
      el('button', { class: 'icon-btn', 'aria-label': _t('ย้อนกลับ'), onclick: function () { history.length > 1 ? history.back() : back(); } }, icon('back')),
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
      var last = el('div', { class: 'last', id: 'scan-last' }, cfg.continuous ? _t('โหมดสแกนต่อเนื่อง: สแกนทีละชิ้น ระบบนับให้อัตโนมัติ') : _t('เล็งบาร์โค้ด/QR ให้อยู่ในกรอบ'));
      var manual = el('input', { class: 'input', placeholder: _t('หรือพิมพ์รหัส แล้วกด Enter'), autocapitalize: 'characters', autocomplete: 'off', enterkeyhint: 'go' });
      manual.addEventListener('keydown', function (e) {
        if…44724 tokens truncated… + ' · ' + b.channelName + (b.customerName ? ' · ' + b.customerName : '') + ' · ' + b.seller)),
          el('div', { class: 'right' },
            el('div', { style: 'font-weight:700' + (cancelled ? ';color:var(--ink-3);text-decoration:line-through' : '') }, money(b.total)),
            el('div', { class: 'small' }, cancelled ? el('span', { class: 'badge c-red' }, _t('ยกเลิก', 'badge')) : [el('span', { class: 'badge ' + (b.paymentMethod === 'CASH' ? 'c-green' : 'c-blue') }, I18N.lang === 'th' ? b.paymentLabel : (b.paymentMethod === 'CASH' ? _t('เงินสด') : _t('โอนเงิน'))), b.priceEdited ? el('span', { class: 'badge c-amber', style: 'margin-left:4px' }, _t('มีส่วนลด')) : null])));
      })));
    }).catch(function (e) { clear(out); append(out, errorBox(e)); });
  }

  /** ดูบิล + พิมพ์ซ้ำ (สำเนา) */
  function viewBillDoc(app, st) {
    var holder = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    var btn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1', disabled: true }, icon('printer'), _t('พิมพ์สำเนา (') + paperSize() + ')');
    page(app, _t('บิลเงินสด'), holder, btn);
    append(holder, loadingBox());
    Api.read('pos.bill', { internalOrderId: st.internalOrderId, billNo: st.billNo }).then(function (d) {
      clear(holder);
      var b = d.bill;
      if (b.status === 'CANCELLED') append(holder, el('div', { class: 'banner error' }, icon('alert'), el('div', null, _t('บิลนี้ถูกยกเลิกแล้ว (พิมพ์ได้โดยมีตรา "ยกเลิกแล้ว")'))));
      else if (b.status === 'RETURNED_PARTIAL' || b.status === 'RETURNED_FULL') append(holder, el('div', { class: 'banner warn' }, icon('alert'), el('div', null, _t('มีการรับคืนสินค้าจากบิลนี้แล้ว — บิลแสดงรายการตอนขาย'))));
      if (I18N.lang !== 'th') append(holder, el('div', { class: 'hint' }, _t('เอกสารที่พิมพ์ออกเป็นภาษาไทย')));
      append(holder, docPreview(billDoc(b, true)));
      btn.disabled = false;
      btn.onclick = function () { printBill(b, true); };
    }).catch(function (e) { clear(holder); append(holder, errorBox(e)); });
  }

  /** ใบรายการสินค้าของออเดอร์แพลตฟอร์ม */
  function viewPackingDoc(app, st) {
    var holder = el('div', { style: 'display:flex;flex-direction:column;gap:12px' });
    var btn = el('button', { class: 'btn btn-primary btn-lg', style: 'flex:1' }, icon('printer'), _t('พิมพ์ใบรายการสินค้า (') + paperSize() + ')');
    page(app, _t('ใบรายการสินค้า'), holder, btn);
    function show(o) {
      clear(holder);
      if (o.status === 'CANCELLED') append(holder, el('div', { class: 'banner error' }, icon('alert'), el('div', null, _t('ออเดอร์นี้ถูกยกเลิกแล้ว'))));
      if (I18N.lang !== 'th') append(holder, el('div', { class: 'hint' }, _t('เอกสารที่พิมพ์ออกเป็นภาษาไทย')));
      append(holder, docPreview(packingDoc(o, !st.fresh)));
      btn.onclick = function () { printPacking(o, !st.fresh); };
    }
    if (st.order) { show(st.order); return; }
    append(holder, loadingBox()); btn.disabled = true;
    Api.read('order.get', { channelId: st.channelId, orderNo: st.orderNo }).then(function (d) { btn.disabled = false; show(d.order); })
      .catch(function (e) { clear(holder); append(holder, errorBox(e)); });
  }

  /* ================================================================ */
  /* ราคาขายหลัก (ADMIN แก้ได้)                                          */
  /* ================================================================ */
  function priceForm(item) {
    return sheet(function (close) {
      var inp = moneyInput(item.salePrice, _t('ราคาต่อ ') + _u(item.unit));
      inp.setAttribute('autofocus', '');
      var note = el('input', { class: 'input', maxLength: 200, value: item.note || '', placeholder: _t('เช่น ราคาโปรเดือนนี้') });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, _t('บันทึกราคาขาย'));
      function doSave() {
        var v = parseMoney(inp.value);
        if (v == null) { err.textContent = _t('กรุณาใส่ตัวเลข 0 ขึ้นไป (ทศนิยมไม่เกิน 2 ตำแหน่ง)'); return; }
        save.disabled = true; err.textContent = '';
        submitWrite('product.price.save', { sku: item.sku, salePrice: v, note: note.value.trim() }, _t('ราคาขาย ') + item.sku)
          .then(function (d) { if (d) { productCache = {}; toast(I18N.srv(d.message, 'บันทึกเรียบร้อย'), 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; beep(false); });
      }
      save.addEventListener('click', doSave);
      inp.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); doSave(); } });
      return [el('h2', null, _t('ราคาขายหลัก')),
        el('div', null, el('div', { style: 'font-weight:600' }, item.name), el('div', { class: 'small muted mono' }, item.sku)),
        el('div', { class: 'field' }, el('label', null, _t('ราคาขายต่อ ') + _u(item.unit) + _t(' (บาท)')), inp),
        el('div', { class: 'hint' }, _t('ราคานี้ขึ้นอัตโนมัติในเมนูขายหน้าร้าน พนักงานยังแก้ราคา/ให้ส่วนลดในแต่ละบิลได้')),
        el('div', { class: 'field' }, el('label', null, _t('หมายเหตุ (ถ้ามี)')), note),
        item.updatedAt ? el('div', { class: 'small muted' }, _t('แก้ล่าสุด ') + item.updatedAt + _t(' โดย ') + item.updatedBy) : null,
        err, save, el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, _t('ยกเลิก'))];
    });
  }

  function viewPrices(app, st) {
    st = st || {};
    var out = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    var bar = scanBar({ title: _t('สแกนสินค้า'), placeholder: _t('ค้นหา/สแกน SKU หรือชื่อสินค้า'), onCode: function (v) { st.q = v; load(true); } });
    page(app, _t('ราคาขายหลัก'), [
      el('div', { class: 'tabs' },
        el('button', { class: 'chip' + (!st.onlyMissing ? ' on' : ''), onclick: function () { replaceTop(viewPrices, { onlyMissing: false }); } }, _t('ทั้งหมด')),
        el('button', { class: 'chip' + (st.onlyMissing ? ' on' : ''), onclick: function () { replaceTop(viewPrices, { onlyMissing: true }); } }, _t('ยังไม่มีราคา'))),
      bar, out
    ]);
    function open(item) { if (!State.perms.admin) return; priceForm(item).then(function (ok) { if (ok) load(false); }); }
    function load(auto) {
      clear(out); append(out, loadingBox());
      Api.read('product.prices', { q: st.q || '', onlyMissing: !!st.onlyMissing }).then(function (d) {
        clear(out);
        if (auto && d.items.length === 1) open(d.items[0]);
        if (!st.q && d.missingCount && !st.onlyMissing) append(out, el('div', { class: 'banner warn' }, icon('alert'), el('div', null, _t('สินค้า ', 'count') + fmt(d.missingCount) + _t(' รายการยังไม่มีราคาขายหลัก'))));
        if (st.q) append(out, el('div', { class: 'row' }, el('div', { class: 'grow small muted' }, _t('ผลค้นหา "') + st.q + '" — ' + fmt(d.total) + _t(' รายการ')),
          el('button', { class: 'chip', onclick: function () { st.q = ''; load(false); } }, _t('ล้างค้นหา'))));
        if (!d.items.length) { append(out, el('div', { class: 'card empty' }, st.onlyMissing && !st.q ? _t('สินค้าทุกตัวมีราคาขายแล้ว') : _t('ไม่พบสินค้า'))); return; }
        append(out, d.items.map(function (it) {
          return el('button', { class: 'list-btn', onclick: function () { open(it); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, it.name), el('div', { class: 'small muted mono' }, it.sku)),
            it.salePrice == null ? el('span', { class: 'badge c-red' }, _t('ยังไม่มีราคา'))
              : el('div', { class: 'right' }, el('div', { style: 'font-weight:700' }, money(it.salePrice)), el('div', { class: 'small muted' }, _t('บาท/') + _u(it.unit))));
        }));
        if (d.truncated) append(out, el('div', { class: 'hint' }, _t('แสดง ') + d.items.length + _t(' รายการแรก — พิมพ์ค้นหาเพื่อหาสินค้าอื่น')));
      }).catch(function (e) { clear(out); append(out, errorBox(e)); });
    }
    load(false);
  }

  /* ================================================================ */
  /* ตั้งค่าระบบ (ADMIN)                                                */
  /* ================================================================ */
  function viewAdmin(app, st) {
    st = st || { tab: 'channels' };
    var tabs = [['channels', _t('ช่องทางขาย')], ['users', _t('พนักงาน')], ['products', _t('สินค้า')], ['settings', _t('ตั้งค่า')], ['system', _t('ตรวจระบบ')]];
    var body = el('div', { style: 'display:flex;flex-direction:column;gap:10px' });
    page(app, _t('ตั้งค่าระบบ'), [el('div', { class: 'tabs' }, tabs.map(function (t) {
      return el('button', { class: 'chip' + (st.tab === t[0] ? ' on' : ''), onclick: function () { replaceTop(viewAdmin, { tab: t[0] }); } }, t[1]);
    })), body]);
    var loading = el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' }));
    append(body, loading);
    function fail(e) { clear(body); append(body, el('div', { class: 'banner error' }, icon('alert'), el('div', null, e.message))); }
    function reload() { replaceTop(viewAdmin, { tab: st.tab }); }

    if (st.tab === 'channels') {
      Api.read('admin.channels', {}).then(function (d) {
        clear(body);
        append(body, el('button', { class: 'btn btn-primary btn-block', onclick: function () { channelForm(null).then(function (s) { if (s) { refreshBoot(); reload(); } }); } }, icon('plus'), _t('เพิ่มช่องทางขาย')));
        d.channels.forEach(function (c) {
          append(body, el('button', { class: 'list-btn', onclick: function () { channelForm(c).then(function (s) { if (s) { refreshBoot(); reload(); } }); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, c.name), el('div', { class: 'small muted' }, c.channelId + ' · ' + (c.mode === 'AUTO' ? _t('ขายตรง · บิลเงินสด เลข ') + c.prefix + '-yyyyMMdd-0001' : _t('แพลตฟอร์ม · ใบรายการสินค้า')))),
            el('span', { class: 'badge ' + (c.active ? 'c-green' : 'c-gray') }, c.active ? _t('เปิด') : _t('ปิด', 'state'))));
        });
      }).catch(fail);
    } else if (st.tab === 'users') {
      Api.read('admin.users', {}).then(function (d) {
        clear(body);
        append(body, el('div', { class: 'hint' }, _t('พนักงานใหม่ให้เปิดเมนูคลังสินค้าใน LINE หนึ่งครั้ง แล้วชื่อจะขึ้นที่นี่ในสถานะ "รออนุมัติ"')));
        d.users.sort(function (a, b) { return (a.active ? 1 : 0) - (b.active ? 1 : 0); }).forEach(function (u) {
          append(body, el('button', { class: 'list-btn', onclick: function () { userForm(u).then(function (s) { if (s) reload(); }); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, u.name), el('div', { class: 'small muted' }, (ROLE_LABEL[u.role] || u.role) + ' · LINE: ' + (u.lineName || '-')), el('div', { class: 'small muted mono' }, u.userId)),
            el('span', { class: 'badge ' + (u.active ? 'c-green' : 'c-amber') }, u.active ? _t('ใช้งาน') : _t('รออนุมัติ/ปิด'))));
        });
      }).catch(fail);
    } else if (st.tab === 'products') {
      clear(body);
      append(body, [
        el('button', { class: 'btn btn-primary btn-block', onclick: function () {
          sheet(function (close) {
            var i = el('input', { class: 'input mono', placeholder: _t('สแกน/พิมพ์ SKU ใหม่'), autofocus: true, autocapitalize: 'characters' });
            return [el('h2', null, _t('สร้างสินค้าใหม่')), i, el('button', { class: 'btn btn-primary btn-block', onclick: function () { if (i.value.trim()) close(i.value.trim()); } }, _t('ถัดไป')),
              el('button', { class: 'btn btn-outline btn-block', onclick: function () { Scanner.open({ title: _t('สแกน SKU ใหม่'), onCode: function (c) { close(c); } }); } }, icon('scan'), _t('สแกนด้วยกล้อง'))];
          }).then(function (sku) { if (sku) productForm({ sku: sku.toUpperCase() }, true).then(function (p) { if (p) toast(_t('สร้างสินค้าแล้ว'), 'ok'); }); });
        } }, icon('plus'), _t('สร้างสินค้าใหม่')),
        el('button', { class: 'btn btn-outline btn-block', onclick: function () {
          productPicker({ includeInactive: true, allowEmpty: true }).then(function (p) { if (p) productForm(p, false); });
        } }, icon('search'), _t('ค้นหาและแก้ไขสินค้า')),
        el('button', { class: 'btn btn-outline btn-block', onclick: function () { go(viewPrices, {}); } }, icon('coin'), _t('ราคาขายหลัก'))]);
    } else if (st.tab === 'settings') {
      Api.read('admin.settings', {}).then(function (d) {
        clear(body);
        d.settings.forEach(function (s) {
          append(body, el('button', { class: 'list-btn', disabled: !s.editable, onclick: function () { settingForm(s).then(function (ok) { if (ok) { refreshBoot(); reload(); } }); } },
            el('div', { class: 'grow' }, el('div', { style: 'font-weight:600' }, I18N.setting(s.key, s.description)), el('div', { class: 'small muted' }, s.key), el('div', { style: 'word-break:break-word' + (s.value ? '' : ';color:var(--ink-3)') }, s.value || _t('(ว่าง)'))),
            s.editable ? null : el('span', { class: 'badge c-gray' }, _t('ล็อก'))));
        });
      }).catch(fail);
    } else {
      clear(body);
      var res = el('div');
      var supabaseRes = el('div');
      append(body, [
        el('div', { class: 'card' }, el('dl', { class: 'kv' },
          el('dt', null, _t('เวอร์ชัน')), el('dd', null, State.app.version),
          el('dt', null, _t('เวอร์ชันหน้าจอ')), el('dd', null, I18N.version),
          el('dt', null, 'API'), el('dd', { class: 'small mono' }, C.API_URL),
          el('dt', null, 'Supabase (ทดลอง)'), el('dd', { class: 'small mono' }, C.SUPABASE_API_URL || _t('ยังไม่ตั้งค่า')),
          el('dt', null, 'LIFF ID'), el('dd', { class: 'mono' }, C.LIFF_ID))),
        el('button', { class: 'btn btn-outline btn-block', onclick: function () {
          clear(supabaseRes); append(supabaseRes, loadingBox());
          connectSupabase().then(function (d) {
            clear(supabaseRes);
            append(supabaseRes, el('div', { class: 'banner ok' }, icon('check'), el('div', null,
              _t('Supabase ยืนยัน LINE ID และอ่านสิทธิ์ผู้ใช้สำเร็จ · ') + (ROLE_LABEL[d.user.role] || d.user.role) + _t(' · ') + d.channels.length + _t(' ช่องทาง'))));
          }).catch(function (e) {
            clear(supabaseRes);
            append(supabaseRes, el('div', { class: 'banner error' }, icon('alert'), el('div', null, e.message)));
          });
        } }, icon('shield'), _t('ทดลองเชื่อมต่อ LINE กับ Supabase')),
        supabaseRes,
        el('button', { class: 'btn btn-primary btn-block', onclick: function () {
          clear(res); append(res, el('div', { class: 'empty' }, el('div', { class: 'spinner', style: 'margin:0 auto' })));
          Api.read('reconcile', {}).then(function (r) {
            clear(res);
            append(res, r.ok ? el('div', { class: 'banner ok' }, icon('check'), el('div', null, _t('ยอดสต๊อกตรงกับประวัติธุรกรรมทุก SKU (') + r.checkedSkus + _t(' SKU) ตรวจเมื่อ ') + r.checkedAt))
              : el('div', { class: 'banner error' }, icon('alert'), el('div', null, _t('พบยอดไม่ตรง ') + r.mismatches.length + _t(' SKU, รายการค้าง ') + r.pendingOperations + ' — ' + r.mismatches.map(function (m) { return m.sku; }).join(', '))));
          }).catch(function (e) { clear(res); append(res, el('div', { class: 'err-text' }, e.message)); });
        } }, icon('shield'), _t('ตรวจความถูกต้องของยอดสต๊อก')), res]);
    }
  }

  function channelForm(c) {
    var isNew = !c; c = c || { mode: 'SCAN', active: true };
    return sheet(function (close) {
      var id = el('input', { class: 'input mono', value: c.channelId || '', readOnly: !isNew, placeholder: _t('เช่น FACEBOOK'), autocapitalize: 'characters' });
      var name = el('input', { class: 'input', value: c.name || '', placeholder: _t('ชื่อที่แสดง') });
      var prefix = el('input', { class: 'input mono', value: c.prefix || '', placeholder: _t('เช่น FB'), autocapitalize: 'characters' });
      var prefixF = el('div', { class: 'field' + (c.mode === 'AUTO' ? '' : ' hidden') }, el('label', null, _t('คำนำหน้าเลขบิล')), prefix);
      var mode = choiceGroup([['SCAN', _t('แพลตฟอร์ม'), _t('สแกนเลขออเดอร์จริง · ใบรายการสินค้า')], ['AUTO', _t('ขายตรง'), _t('ระบบออกเลขบิล · บิลเงินสด')]], c.mode, function (v) { prefixF.classList.toggle('hidden', v !== 'AUTO'); });
      var active = el('input', { type: 'checkbox', checked: c.active !== false, style: 'width:22px;height:22px' });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, _t('บันทึก'));
      save.addEventListener('click', function () {
        save.disabled = true; err.textContent = '';
        submitWrite('admin.channel.save', { isNew: isNew, channelId: id.value.trim().toUpperCase(), name: name.value.trim(), mode: mode.value(), prefix: prefix.value.trim().toUpperCase(), active: active.checked, sortOrder: c.sortOrder }, _t('บันทึกช่องทาง ') + name.value)
          .then(function (d) { if (d) { toast(I18N.srv(d.message, 'บันทึกเรียบร้อย'), 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; });
      });
      return [el('h2', null, isNew ? _t('เพิ่มช่องทางขาย') : _t('แก้ไขช่องทางขาย')),
        el('div', { class: 'field' }, el('label', null, _t('รหัสช่องทาง (A-Z, 0-9)')), id), el('div', { class: 'field' }, el('label', null, _t('ชื่อช่องทาง')), name),
        el('div', { class: 'field' }, el('div', { class: 'label' }, _t('ประเภทช่องทาง')), mode), prefixF,
        el('label', { class: 'row' }, active, _t('เปิดใช้งาน')), err, save, el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, _t('ยกเลิก'))];
    });
  }

  function userForm(u) {
    return sheet(function (close) {
      var name = el('input', { class: 'input', value: u.name });
      var role = choiceGroup([['STAFF', _t('พนักงาน'), _t('ทำรายการสต๊อกได้')], ['ADMIN', _t('ผู้ดูแลระบบ'), _t('ทำได้ทุกอย่าง')], ['VIEWER', _t('ดูอย่างเดียว'), _t('ดูยอด/รายงาน')]], u.role);
      var active = el('input', { type: 'checkbox', checked: u.active, style: 'width:22px;height:22px' });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, u.active ? _t('บันทึก') : _t('บันทึก / อนุมัติ'));
      save.addEventListener('click', function () {
        save.disabled = true;
        submitWrite('admin.user.save', { userId: u.userId, name: name.value.trim(), role: role.value(), active: active.checked }, _t('บันทึกพนักงาน ') + name.value)
          .then(function (d) { if (d) { toast(I18N.srv(d.message, 'บันทึกเรียบร้อย'), 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; });
      });
      if (!u.active) active.checked = true;
      return [el('h2', null, _t('ข้อมูลพนักงาน')), el('div', { class: 'small muted mono' }, u.userId),
        el('div', { class: 'field' }, el('label', null, _t('ชื่อที่แสดงในประวัติ')), name),
        el('div', { class: 'field' }, el('div', { class: 'label' }, _t('บทบาท')), role),
        el('label', { class: 'row' }, active, _t('อนุญาตให้ใช้งาน')), err, save,
        el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, _t('ยกเลิก'))];
    });
  }

  function settingForm(s) {
    return sheet(function (close) {
      var input;
      if (s.key === 'SCAN_MODE') input = choiceGroup([['QTY', _t('สแกนแล้วกรอกจำนวน')], ['EACH', _t('สแกนทีละชิ้น (+1)')]], s.value);
      else if (s.key === 'PAPER_SIZE') input = choiceGroup([['A5', 'A5', _t('บิลทั่วไป ประหยัดกระดาษ')], ['A4', 'A4', _t('เต็มแผ่น เหมาะกับรายการยาว')]], String(s.value).toUpperCase() === 'A4' ? 'A4' : 'A5');
      else input = el(/_REASONS$|_TYPES$|^SHOP_ADDRESS$/.test(s.key) ? 'textarea' : 'input', { class: 'input', value: s.value, placeholder: /^(SHOP_|BILL_)/.test(s.key) ? _t('เว้นว่างได้') : '' });
      var err = el('div', { class: 'err-text' });
      var save = el('button', { class: 'btn btn-primary btn-block btn-lg' }, _t('บันทึก'));
      save.addEventListener('click', function () {
        save.disabled = true;
        var v = typeof input.value === 'function' ? input.value() : input.value;
        submitWrite('admin.setting.save', { key: s.key, value: v }, _t('ตั้งค่า ') + s.key).then(function (d) { if (d) { toast(I18N.srv(d.message, 'บันทึกเรียบร้อย'), 'ok'); close(true); } else close(false); })
          .catch(function (e) { save.disabled = false; err.textContent = e.message; });
      });
      return [el('h2', null, I18N.setting(s.key, s.description)), el('div', { class: 'small muted' }, s.key + (/_REASONS$|_TYPES$/.test(s.key) ? _t(' — คั่นแต่ละรายการด้วยเครื่องหมายจุลภาค ( , )') : '')), input, err, save,
        el('button', { class: 'btn btn-outline btn-block', onclick: function () { close(false); } }, _t('ยกเลิก'))];
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
    append(app, el('div', { class: 'boot' }, langButton('lang-btn-boot'),
      el('div', { class: 'boot-logo', style: m.kind === 'error' ? 'background:var(--danger)' : '' }, m.kind === 'error' ? '!' : 'WMS'),
      el('h2', { style: 'margin:0;color:var(--ink)' }, m.title),
      el('p', { style: 'white-space:pre-line;margin:0' }, m.message),
      m.code ? el('div', { class: 'card', style: 'width:100%' }, el('div', { class: 'small muted' }, m.codeLabel || _t('รหัส')), el('div', { class: 'mono', style: 'word-break:break-all;font-weight:600' }, m.code),
        el('button', { class: 'btn btn-outline btn-block', style: 'margin-top:10px', onclick: function () {
          try { navigator.clipboard.writeText(m.code).then(function () { toast(_t('คัดลอกแล้ว'), 'ok'); }); } catch (e) { toast(_t('คัดลอกไม่ได้ กรุณาจดรหัส'), 'error'); }
        } }, _t('คัดลอกรหัส'))) : null,
      el('button', { class: 'btn btn-primary btn-block', onclick: function () { location.reload(); } }, icon('refresh'), _t('ลองใหม่'))));
  }

  /* ================================================================ */
  /* Boot                                                               */
  /* ================================================================ */
  /** ลิงก์ตรงไปเอกสาร (เปิดจากปุ่ม "เปิดในเบราว์เซอร์") เช่น ?doc=bill&id=ORD-... */
  function deepLink() {
    var sp;
    try {
      sp = new URLSearchParams(location.search);
      if (!sp.get('doc') && sp.get('liff.state')) sp = new URLSearchParams(String(sp.get('liff.state')).replace(/^[^?]*\?/, ''));
    } catch (e) { return null; }
    var doc = sp.get('doc');
    if (doc === 'bill' && sp.get('id')) return [viewBillDoc, { internalOrderId: sp.get('id') }];
    if (doc === 'pack' && sp.get('ch') && sp.get('no')) return [viewPackingDoc, { channelId: sp.get('ch'), orderNo: sp.get('no') }];
    return null;
  }

  function configured() {
    return C.LIFF_ID && C.API_URL && C.LIFF_ID.indexOf('YOUR_') !== 0 && C.API_URL.indexOf('YOUR_') < 0;
  }

  function boot() {
    var app = $('#app');
    if (!configured()) {
      viewMessage(app, { title: _t('ยังไม่ได้ตั้งค่าการเชื่อมต่อ'), message: _t('ผู้ดูแลระบบต้องแก้ไฟล์ config.js ใส่ LIFF_ID และ API_URL ก่อนใช้งาน (ดูคู่มือติดตั้ง ขั้นตอนที่ 7)'), kind: 'error' });
      return;
    }
    Auth.init().then(function () {
      return Api.raw('bootstrap', {});
    }).then(function (j) {
      sessionStorage.removeItem('wms_relogin');
      var d = j.data;
      State.user = d.user; State.perms = d.perms; State.settings = d.settings; State.channels = d.channels; State.app = d.app;
      stack = [[viewHome]];
      var deep = deepLink();
      if (deep) stack.push(deep);
      try { history.replaceState({ d: 1 }, '', deep ? location.pathname : undefined); } catch (e) { /* */ }
      render();
      return checkPending(false).then(function (r) { if (r !== null) render(); });
    }).catch(function (e) {
      if (e && e.code === 'AUTH_EXPIRED') return Auth.relogin();
      if (e && e.code === 'USER_PENDING') {
        viewMessage(app, { title: _t('รอผู้ดูแลอนุมัติ'), message: _t('ระบบลงทะเบียนชื่อ LINE ของคุณ') + (e.details && e.details.name ? ' (' + e.details.name + ')' : '') + _t(' แล้ว\nกรุณาแจ้งผู้ดูแลระบบให้อนุมัติในเมนู ตั้งค่าระบบ > พนักงาน'), code: e.details && e.details.userId, codeLabel: _t('รหัสผู้ใช้ LINE ของคุณ') });
        return;
      }
      viewMessage(app, { title: _t('เปิดระบบไม่สำเร็จ'), message: (e && e.message) || String(e), kind: 'error' });
    });
  }

  // เปิดให้ทดสอบอัตโนมัติเข้าถึงสถานะได้ (ไม่มีข้อมูลลับ)
  window.__WMS__ = { State: State, Scanner: Scanner, Pending: Pending, bahtText: bahtText };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();

