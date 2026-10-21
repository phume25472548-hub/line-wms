(function () {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };
  var loginView = $('login-view'), dashboardView = $('dashboard-view');
  var form = $('login-form'), password = $('password'), loginError = $('login-error');
  var logoutButton = $('logout'), submitButton = $('login-submit');

  function showError(node, message) { node.textContent = message; node.hidden = false; }
  function clearError(node) { node.textContent = ''; node.hidden = true; }
  function text(value, fallback) { return value == null || value === '' ? (fallback || '—') : String(value); }
  function number(value) { var n = Number(value); return Number.isFinite(n) ? n.toLocaleString('zh-CN') : '0'; }
  function node(tag, className, content) {
    var el = document.createElement(tag);
    if (className) el.className = className;
    if (content != null) el.textContent = String(content);
    return el;
  }
  function showDashboard() { loginView.hidden = true; dashboardView.hidden = false; logoutButton.hidden = false; }
  function showLogin() { dashboardView.hidden = true; loginView.hidden = false; logoutButton.hidden = true; }
  async function request(path, options) {
    var response = await fetch(path, Object.assign({ credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' } }, options || {}));
    var data;
    try { data = await response.json(); } catch (_) { throw new Error('服务器暂时无法处理请求，请稍后重试。'); }
    if (!response.ok || !data.ok) {
      var error = new Error(data && data.error || '请求失败，请稍后重试。');
      error.status = response.status;
      throw error;
    }
    return data.data;
  }
  function statusLabel(status) {
    var labels = { COMPLETED: '已完成', RETURNED_PARTIAL: '部分退货', RETURNED_FULL: '已全部退货', CANCELLED: '已取消', PROCESSING: '处理中', PENDING: '待处理', SHIPPED: '已发货' };
    return labels[String(status || '').toUpperCase()] || text(status, '状态待更新');
  }
  function statusClass(status) {
    var value = String(status || '').toUpperCase();
    if (value === 'CANCELLED') return 'status cancelled';
    if (value === 'PENDING' || value === 'PROCESSING') return 'status pending';
    return 'status';
  }
  function renderStock(rows) {
    var grid = $('stock-grid');
    grid.replaceChildren();
    $('sku-count').textContent = number(rows.length) + ' 件商品';
    if (!rows.length) { grid.appendChild(node('div', 'empty-state', '暂无可显示的库存数据。')); return; }
    rows.forEach(function (item) {
      var card = node('article', 'stock-card');
      card.appendChild(node('div', 'stock-name', text(item.name, '未命名商品')));
      card.appendChild(node('div', 'stock-meta', text(item.sku, '—') + (item.category ? ' · ' + item.category : '')));
      var values = node('div', 'stock-values');
      var available = node('div', 'stock-value available');
      available.appendChild(node('span', '', '可售库存'));
      available.appendChild(node('strong', '', number(item.available)));
      var inspection = node('div', 'stock-value');
      inspection.appendChild(node('span', '', '待检库存'));
      inspection.appendChild(node('strong', '', number(item.inspection)));
      values.append(available, inspection);
      card.appendChild(values);
      var total = node('div', 'stock-total');
      total.append(node('span', '', '库存合计'), node('strong', '', number(item.total) + ' ' + text(item.unit, '件')));
      card.appendChild(total);
      grid.appendChild(card);
    });
  }
  function renderOrders(rows) {
    var list = $('orders-list');
    list.replaceChildren();
    $('order-count').textContent = number(rows.length) + ' 笔订单';
    if (!rows.length) { list.appendChild(node('div', 'empty-state', '暂无近期订单。')); return; }
    rows.forEach(function (order) {
      var card = node('article', 'order-card');
      var id = node('div', '');
      id.appendChild(node('div', 'order-number', text(order.orderNo, '订单号待更新')));
      id.appendChild(node('div', 'order-sub', text(order.channelName, '订单') + (order.createdAt ? ' · ' + order.createdAt : '')));
      var quantity = node('div', 'order-field');
      quantity.append(node('span', '', '商品数量'), node('strong', '', number(order.quantity) + ' 件'));
      var lines = node('div', 'order-field');
      lines.append(node('span', '', '商品种类'), node('strong', '', number(order.itemCount) + ' 种'));
      card.append(id, quantity, lines, node('span', statusClass(order.status), statusLabel(order.status)));
      list.appendChild(card);
    });
  }
  async function loadSnapshot() {
    $('load-error').hidden = true;
    $('stock-grid').replaceChildren(node('div', 'loading-card', '正在安全加载库存…'));
    $('orders-list').replaceChildren(node('div', 'loading-card', '正在加载订单…'));
    try {
      var data = await request('/api/partner/snapshot');
      renderStock(Array.isArray(data.stocks) ? data.stocks : []);
      renderOrders(Array.isArray(data.orders) ? data.orders : []);
      $('sync-note').textContent = data.updatedAt ? '数据更新时间：' + data.updatedAt : '';
      $('sync-note').hidden = !data.updatedAt;
    } catch (error) {
      if (error.status === 401) { showLogin(); return; }
      showError($('load-error'), error.message);
      $('stock-grid').replaceChildren(node('div', 'empty-state', '库存数据暂不可用。'));
      $('orders-list').replaceChildren(node('div', 'empty-state', '订单数据暂不可用。'));
    }
  }

  form.addEventListener('submit', async function (event) {
    event.preventDefault();
    clearError(loginError);
    submitButton.disabled = true;
    submitButton.firstElementChild.textContent = '正在验证…';
    try {
      await request('/api/partner/login', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ password: password.value }) });
      password.value = '';
      showDashboard();
      await loadSnapshot();
    } catch (error) {
      showError(loginError, error.status === 401 ? '密码不正确，请重试。' : error.message);
    } finally {
      submitButton.disabled = false;
      submitButton.firstElementChild.textContent = '安全登录';
    }
  });
  $('show-password').addEventListener('click', function () {
    var show = password.type === 'password';
    password.type = show ? 'text' : 'password';
    this.textContent = show ? '隐藏' : '显示';
    this.setAttribute('aria-label', show ? '隐藏密码' : '显示密码');
  });
  $('refresh').addEventListener('click', loadSnapshot);
  logoutButton.addEventListener('click', async function () {
    try { await request('/api/partner/logout', { method: 'POST' }); } catch (_) { /* 即使网络中断，隐藏的数据也会随页面重新登录。 */ }
    showLogin();
  });

  request('/api/partner/snapshot').then(function () { showDashboard(); return loadSnapshot(); }).catch(function (error) { if (error.status === 401) showLogin(); else { showLogin(); } });
})();
