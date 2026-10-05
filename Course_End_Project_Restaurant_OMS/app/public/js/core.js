// Shared helpers: session, API calls, formatting, toasts and modals.

export const state = { user: null, token: null };

export function loadSession() {
  try {
    const saved = JSON.parse(localStorage.getItem('rms-session') || 'null');
    if (saved && saved.token) Object.assign(state, saved);
  } catch { /* storage unavailable */ }
}

export function saveSession(token, user) {
  state.token = token;
  state.user = user;
  try { localStorage.setItem('rms-session', JSON.stringify({ token, user })); } catch { /* ignore */ }
}

export function clearSession() {
  state.token = null;
  state.user = null;
  try { localStorage.removeItem('rms-session'); } catch { /* ignore */ }
}

export async function api(path, { method = 'GET', body } = {}) {
  const headers = { 'content-type': 'application/json' };
  if (state.token) headers.authorization = `Bearer ${state.token}`;
  const res = await fetch(`/api${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && state.token) {
    clearSession();
    location.hash = '#/login';
  }
  if (!res.ok) throw new Error((data && data.error) || `Request failed (${res.status})`);
  return data;
}

// ---------- formatting ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

export const rupee = (n, digits = 0) =>
  '₹' + Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: digits, maximumFractionDigits: digits });

export const minsAgo = (ts) => Math.max(0, Math.round((Date.now() - new Date(ts).getTime()) / 60000));

export const timeOf = (ts) =>
  new Date(ts).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export const dateTimeOf = (ts) =>
  new Date(ts).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });

export const LABEL = {
  FREE: 'Free', OCCUPIED: 'Occupied', FOOD_READY: 'Food ready', BILLING: 'Bill pending',
  PLACED: 'Placed', PREPARING: 'Preparing', READY: 'Ready', SERVED: 'Served',
  BILLED: 'Billed', PAID: 'Paid', CANCELLED: 'Cancelled', PENDING: 'To do', LOW: 'Low stock',
};
export const chip = (s) => `<span class="chip ${esc(s)}">${esc(LABEL[s] || s)}</span>`;
export const vegDot = (veg) =>
  `<span class="veg-dot ${veg ? '' : 'non'}" title="${veg ? 'Veg' : 'Non-veg'}" aria-label="${veg ? 'Veg' : 'Non-veg'}"></span>`;

export const hasRole = (...roles) => state.user && (state.user.role === 'MANAGER' || roles.includes(state.user.role));

// Same arithmetic as fn_generate_bill (GST 5% = CGST 2.5% + SGST 2.5%), for preview only
export function billPreview(subtotal, discountPct) {
  const sub = Number(subtotal) || 0;
  const disc = Math.round(sub * (Number(discountPct) || 0)) / 100;
  const taxable = sub - disc;
  const gst = Math.round(taxable * 2.5) / 100;
  const exact = taxable + 2 * gst;
  const total = Math.round(exact);
  return { sub, disc, taxable, cgst: gst, sgst: gst, roundOff: total - exact, total };
}

// ---------- toasts ----------
export function toast(message, type = '') {
  const box = document.getElementById('toasts');
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.textContent = message;
  box.appendChild(el);
  setTimeout(() => el.remove(), type === 'error' ? 6000 : 3500);
}

// ---------- modals ----------
export function modal(html) {
  const back = document.createElement('div');
  back.className = 'modal-back';
  back.innerHTML = `<div class="modal" role="dialog" aria-modal="true">${html}</div>`;
  const close = () => back.remove();
  back.addEventListener('click', (e) => {
    if (e.target === back || e.target.closest('[data-close]')) close();
  });
  document.addEventListener('keydown', function onKey(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onKey); }
  });
  document.body.appendChild(back);
  const first = back.querySelector('input, select, textarea, button.btn-primary');
  if (first) first.focus();
  return { el: back.querySelector('.modal'), close };
}

export function confirmBox(title, text, okLabel = 'Confirm') {
  return new Promise((resolve) => {
    const m = modal(`<h2>${esc(title)}</h2><p>${esc(text)}</p>
      <div class="modal-actions"><button class="btn" data-no>Cancel</button>
      <button class="btn btn-primary" data-yes>${esc(okLabel)}</button></div>`);
    m.el.querySelector('[data-yes]').onclick = () => { m.close(); resolve(true); };
    m.el.querySelector('[data-no]').onclick = () => { m.close(); resolve(false); };
  });
}

// Run an async action with a busy button and error toast
export async function act(button, fn) {
  if (button) button.disabled = true;
  try {
    return await fn();
  } catch (err) {
    toast(err.message, 'error');
    return undefined;
  } finally {
    if (button) button.disabled = false;
  }
}
