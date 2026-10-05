// Router, layout and role-based navigation.
import { state, loadSession, clearSession, esc } from './core.js';
import * as login from './views/login.js';
import * as dashboard from './views/dashboard.js';
import * as tables from './views/tables.js';
import * as composer from './views/composer.js';
import * as orders from './views/orders.js';
import * as orderDetail from './views/order-detail.js';
import * as kitchen from './views/kitchen.js';
import * as billing from './views/billing.js';
import * as menu from './views/menu.js';
import * as inventory from './views/inventory.js';

const ICON = {
  dashboard: '<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
  tables: '<path d="M4 6h16v3H4zM6 9v9h2V9zm10 0v9h2V9z"/>',
  orders: '<path d="M6 2h12a1 1 0 0 1 1 1v18l-3-2-3 2-3-2-3 2-3-2V3a1 1 0 0 1 1-1zm2 5v2h8V7zm0 4v2h8v-2z"/>',
  kitchen: '<path d="M12 3a4 4 0 0 0-4 4H7a3 3 0 0 0 0 6v6h10v-6a3 3 0 0 0 0-6h-1a4 4 0 0 0-4-4z"/>',
  billing: '<path d="M3 6h18v12H3zm2 2v2h14V8zm0 6v2h5v-2z"/>',
  menu: '<path d="M4 4h16v2H4zm0 7h16v2H4zm0 7h10v2H4z"/>',
  inventory: '<path d="M3 7l9-4 9 4v10l-9 4-9-4zm9 2L5.5 6.2 12 9.4l6.5-3.2z"/>',
};

// path pattern, view module, roles (MANAGER always allowed), nav label
const ROUTES = [
  { re: /^#\/login$/, view: login, roles: null },
  { re: /^#\/dashboard$/, view: dashboard, roles: [], nav: ['dashboard', 'Dashboard'] },
  { re: /^#\/tables$/, view: tables, roles: ['WAITER'], nav: ['tables', 'Tables'] },
  { re: /^#\/orders$/, view: orders, roles: ['WAITER', 'CASHIER'], nav: ['orders', 'Orders'] },
  { re: /^#\/new-order$/, view: composer, roles: ['WAITER'] },
  { re: /^#\/orders\/(\d+)\/add$/, view: composer, roles: ['WAITER'] },
  { re: /^#\/orders\/(\d+)$/, view: orderDetail, roles: ['WAITER', 'CHEF', 'CASHIER'] },
  { re: /^#\/kitchen$/, view: kitchen, roles: ['WAITER', 'CHEF'], nav: ['kitchen', 'Kitchen'] },
  { re: /^#\/billing(?:\/(\d+))?$/, view: billing, roles: ['CASHIER'], nav: ['billing', 'Billing'] },
  { re: /^#\/menu$/, view: menu, roles: [], nav: ['menu', 'Menu'] },
  { re: /^#\/inventory$/, view: inventory, roles: ['CHEF'], nav: ['inventory', 'Inventory'] },
];

const HOME = { MANAGER: '#/dashboard', WAITER: '#/tables', CHEF: '#/kitchen', CASHIER: '#/billing' };

const allowed = (route) =>
  !route.roles || state.user.role === 'MANAGER' || route.roles.includes(state.user.role);

let cleanups = [];
function runCleanups() {
  cleanups.forEach((fn) => { try { fn(); } catch { /* ignore */ } });
  cleanups = [];
}

function renderShell() {
  const app = document.getElementById('app');
  const links = ROUTES.filter((r) => r.nav && allowed(r)).map((r) => {
    const [key, label] = r.nav;
    return `<a href="#/${key}" data-nav="${key}"><svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${ICON[key]}</svg>${label}</a>`;
  }).join('');
  app.innerHTML = `
    <div class="shell">
      <aside class="sidebar">
        <div class="brand"><div class="brand-mark">R</div>
          <div><div class="brand-name">Spice Route</div><div class="brand-sub">Order Management</div></div></div>
        <nav class="nav">${links}</nav>
        <div class="sidebar-foot">
          <div class="who">${esc(state.user.full_name)}</div>
          <div class="muted small">${esc(state.user.role)}</div>
          <a href="#" id="logout" class="small">Log out</a>
        </div>
      </aside>
      <div class="main">
        <header class="topbar"><div class="row"><h1 id="page-title"></h1><span id="page-sub"></span></div>
          <div class="row" id="page-actions"></div></header>
        <section class="content" id="view"></section>
      </div>
    </div>`;
  document.getElementById('logout').onclick = (e) => {
    e.preventDefault();
    clearSession();
    location.hash = '#/login';
  };
}

async function route() {
  runCleanups();
  const hash = location.hash || '';
  if (!state.token) {
    if (hash !== '#/login') { location.hash = '#/login'; return; }
  }
  const [path, queryString] = hash.split('?');
  const match = ROUTES.map((r) => ({ r, m: path.match(r.re) })).find((x) => x.m);
  if (!match || (state.token && path === '#/login')) {
    location.hash = state.token ? HOME[state.user.role] : '#/login';
    return;
  }
  const { r, m } = match;

  if (r.view === login) {
    document.getElementById('app').innerHTML = '';
    await login.render({ root: document.getElementById('app'), onLogin: () => { location.hash = HOME[state.user.role]; } });
    return;
  }
  if (!allowed(r)) { location.hash = HOME[state.user.role]; return; }

  if (!document.querySelector('.shell')) renderShell();
  document.querySelectorAll('.nav a').forEach((a) => {
    a.classList.toggle('active', path.startsWith(`#/${a.dataset.nav}`));
  });
  const root = document.getElementById('view');
  root.innerHTML = '<div class="empty">Loading…</div>';
  document.getElementById('page-actions').innerHTML = '';
  document.getElementById('page-sub').innerHTML = '';

  const ctx = {
    root,
    params: m.slice(1),
    query: new URLSearchParams(queryString || ''),
    title(text, subHtml = '') {
      document.getElementById('page-title').textContent = text;
      document.getElementById('page-sub').innerHTML = subHtml;
      document.title = `${text} · Restaurant OMS`;
    },
    actions(html) {
      const box = document.getElementById('page-actions');
      box.innerHTML = html;
      return box;
    },
    onCleanup(fn) { cleanups.push(fn); },
    // poll(fn, ms): call fn now and every ms while this view is open and the tab is visible
    poll(fn, ms = 5000) {
      const id = setInterval(() => { if (!document.hidden) fn(); }, ms);
      cleanups.push(() => clearInterval(id));
    },
  };
  try {
    await r.view.render(ctx);
  } catch (err) {
    root.innerHTML = `<div class="notice">${esc(err.message)}</div>`;
  }
}

loadSession();
window.addEventListener('hashchange', () => {
  if (state.token && !document.querySelector('.shell') && location.hash !== '#/login') renderShell();
  route();
});
if (state.token) renderShell();
route();
