// Router and layout.
import { state, api, esc, loadMeta } from './core.js';
import * as login from './views/login.js';
import * as dashboard from './views/dashboard.js';
import * as mailboxes from './views/mailboxes.js';
import * as warmup from './views/warmup.js';
import * as leads from './views/leads.js';
import * as finder from './views/finder.js';
import * as campaigns from './views/campaigns.js';
import * as campaign from './views/campaign.js';
import * as inbox from './views/inbox.js';
import * as settingsView from './views/settings.js';

const ICON = {
  dashboard: '<path d="M3 13h8V3H3zm0 8h8v-6H3zm10 0h8V11h-8zm0-18v6h8V3z"/>',
  inbox: '<path d="M4 4h16l2 9v7H2v-7zm1.6 2-1.4 7H9a3 3 0 0 0 6 0h4.8l-1.4-7z"/>',
  mailboxes: '<path d="M3 5h18v14H3zm2 2v.5l7 4.5 7-4.5V7zm0 3v7h14v-7l-7 4.5z"/>',
  warmup: '<path d="M13 2s1 3-1 6-1 5 1 5 3-3 3-3 3 3 3 6a7 7 0 0 1-14 0c0-5 5-7 5-11 0 0 3 0 3-3z"/>',
  leads: '<path d="M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-7 9a7 7 0 0 1 14 0zm15-9a3 3 0 1 0 0-6v6zm1 9h4a6 6 0 0 0-5-5.9A8.9 8.9 0 0 1 18 20z"/>',
  finder: '<path d="M10 3a7 7 0 0 1 5.6 11.2l5.1 5.1-1.4 1.4-5.1-5.1A7 7 0 1 1 10 3zm0 2a5 5 0 1 0 0 10 5 5 0 0 0 0-10z"/>',
  campaigns: '<path d="M3 11l16-7v16L3 13zm3 3h3v6H6z"/>',
  settings: '<path d="M12 8a4 4 0 1 1 0 8 4 4 0 0 1 0-8zm8.6 5.4.9-1.4-.9-1.4-2.3-.3-.6-1.4.9-2.2-1.2-1.2-2.2.9-1.4-.6L13.4 3h-2.8l-.4 2.4-1.4.6-2.2-.9-1.2 1.2.9 2.2-.6 1.4-2.3.3-.9 1.4.9 1.4 2.3.3.6 1.4-.9 2.2 1.2 1.2 2.2-.9 1.4.6.4 2.4h2.8l.4-2.4 1.4-.6 2.2.9 1.2-1.2-.9-2.2.6-1.4z"/>',
};

const ROUTES = [
  { re: /^#\/login$/, view: login, public: true },
  { re: /^#\/dashboard$/, view: dashboard, nav: ['dashboard', 'Dashboard'] },
  { re: /^#\/inbox$/, view: inbox, nav: ['inbox', 'Unified inbox'] },
  { re: /^#\/campaigns$/, view: campaigns, nav: ['campaigns', 'Campaigns'] },
  { re: /^#\/campaigns\/(\d+)$/, view: campaign, parent: 'campaigns' },
  { re: /^#\/leads$/, view: leads, nav: ['leads', 'Leads'] },
  { re: /^#\/finder$/, view: finder, nav: ['finder', 'Lead finder'] },
  { re: /^#\/mailboxes$/, view: mailboxes, nav: ['mailboxes', 'Domains & mailboxes'], group: 'Deliverability' },
  { re: /^#\/warmup$/, view: warmup, nav: ['warmup', 'Warmup'] },
  { re: /^#\/settings$/, view: settingsView, nav: ['settings', 'Settings'] },
];

let current = null;

function layout(activeKey) {
  const sched = state.meta && state.meta.scheduler;
  const navHtml = ROUTES.filter((r) => r.nav).map((r) => {
    const [key, text] = r.nav;
    const group = r.group ? `<div class="nav-label">${esc(r.group)}</div>` : '';
    const badge = key === 'inbox' ? '<span class="badge hidden" id="unread-badge"></span>' : '';
    return `${group}<a href="#/${key}" class="${key === activeKey ? 'active' : ''}"><svg viewBox="0 0 24 24" aria-hidden="true">${ICON[key]}</svg>${text}${badge}</a>`;
  }).join('');
  return `
  <div class="shell">
    <aside class="sidebar" id="sidebar">
      <div class="brand"><div class="brand-mark">CO</div><div><div class="brand-name">Cold Outreach</div><div class="brand-sub">engine</div></div></div>
      <nav class="nav">${navHtml}</nav>
      <div class="sidebar-foot">
        <div><span class="engine-dot ${sched && sched.leader ? 'on' : ''}"></span>${sched && sched.leader ? 'Engines running' : 'Engines not running here'}</div>
        <div class="muted small" style="margin:4px 0 8px">${esc(state.user || '')}</div>
        <button id="logout">Log out</button>
      </div>
    </aside>
    <div class="main">
      <header class="topbar">
        <div class="row"><button class="btn small menu-btn" id="menu">☰</button><div><h1 id="page-title"></h1><div class="sub" id="page-sub"></div></div></div>
        <div class="toolbar" id="page-actions"></div>
      </header>
      <main class="content" id="view"></main>
    </div>
  </div>`;
}

async function refreshBadge() {
  const el = document.getElementById('unread-badge');
  if (!el) return;
  try {
    const d = await api('/inbox?per_page=1');
    el.textContent = d.counts.unread;
    el.classList.toggle('hidden', !d.counts.unread);
  } catch { /* ignore */ }
}

async function render() {
  const hash = location.hash || '#/dashboard';
  const route = ROUTES.find((r) => r.re.test(hash));
  if (!route) { location.hash = '#/dashboard'; return; }
  if (current && current.unmount) current.unmount();
  document.querySelectorAll('.overlay').forEach((o) => o.remove());
  current = route.view;
  const app = document.getElementById('app');

  if (!route.public && !state.user) {
    try {
      state.user = (await api('/auth/me')).email;
      await loadMeta();
    } catch {
      location.hash = '#/login';
      return;
    }
  }
  if (route.public) {
    app.innerHTML = '<div id="view"></div>';
    await route.view.mount(document.getElementById('view'), []);
    return;
  }
  const activeKey = route.nav ? route.nav[0] : route.parent;
  app.innerHTML = layout(activeKey);
  document.getElementById('logout').onclick = async () => {
    await api('/auth/logout', { method: 'POST' }).catch(() => {});
    state.user = null;
    location.hash = '#/login';
  };
  document.getElementById('menu').onclick = () => document.getElementById('sidebar').classList.toggle('open');
  const params = hash.match(route.re).slice(1);
  const ctx = {
    setTitle(title, sub = '') {
      document.getElementById('page-title').textContent = title;
      document.getElementById('page-sub').textContent = sub;
      document.title = `${title} · Cold Outreach Engine`;
    },
    setActions(html) {
      const el = document.getElementById('page-actions');
      el.innerHTML = html;
      return el;
    },
  };
  try {
    await route.view.mount(document.getElementById('view'), params, ctx);
  } catch (err) {
    document.getElementById('view').innerHTML = `<div class="callout bad">${esc(err.message)}</div>`;
  }
  refreshBadge();
}

window.addEventListener('hashchange', render);
render();
setInterval(refreshBadge, 60000);
