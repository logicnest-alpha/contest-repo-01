// Shared helpers: API calls, formatting, chips, toasts, modals, background-task progress.

export const state = { user: null, meta: null };

export async function api(path, { method = 'GET', body } = {}) {
  const res = await fetch(`/api${path}`, {
    method,
    headers: body === undefined ? {} : { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
    credentials: 'same-origin',
  });
  let data = null;
  try { data = await res.json(); } catch { /* empty body */ }
  if (res.status === 401 && !path.startsWith('/auth/')) {
    state.user = null;
    location.hash = '#/login';
  }
  if (!res.ok) {
    const err = new Error((data && data.error) || `Request failed (${res.status})`);
    err.data = data;
    throw err;
  }
  return data;
}

export async function loadMeta() {
  state.meta = await api('/meta');
  return state.meta;
}

// ---------- formatting ----------
const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);
export const n = (v) => Number(v || 0).toLocaleString('en-IN');
export const pct = (v) => (v === null || v === undefined ? '–' : `${v}%`);

export function ago(ts) {
  if (!ts) return '–';
  const s = Math.round((Date.now() - new Date(ts).getTime()) / 1000);
  if (s < 0) return `in ${fmtDur(-s)}`;
  if (s < 60) return 'just now';
  return `${fmtDur(s)} ago`;
}
function fmtDur(s) {
  if (s < 3600) return `${Math.round(s / 60)}m`;
  if (s < 86400) return `${Math.round(s / 3600)}h`;
  return `${Math.round(s / 86400)}d`;
}
export const dateTime = (ts) => (ts ? new Date(ts).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' }) : '–');
export const dateOnly = (ts) => (ts ? new Date(ts).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '–');

const LABEL = {
  not_interested: 'Not interested', wrong_person: 'Wrong person', ooo: 'Out of office', unsubscribe: 'Unsubscribe',
  unsubscribed: 'Unsubscribed', interested: 'Interested', meeting: 'Meeting', replied: 'Replied', contacted: 'Contacted',
  new: 'New', bounced: 'Bounced', bounce: 'Bounce', question: 'Question', referral: 'Referral', other: 'Other',
  valid: 'Valid', risky: 'Risky', invalid: 'Invalid', unknown: 'Unverified', active: 'Active', paused: 'Paused',
  error: 'Error', draft: 'Draft', completed: 'Completed', stopped: 'Stopped', failed: 'Failed', inbox: 'Inbox',
  spam: 'Spam', missing: 'Missing', sent: 'Sent', queued: 'Queued', seed: 'Seed', sender: 'Sender', running: 'Running', done: 'Done',
};
export const label = (s) => LABEL[s] || String(s || '').replace(/_/g, ' ');
export const chip = (s, text) => (s ? `<span class="chip ${esc(s)}">${esc(text || label(s))}</span>` : '');
export const tags = (list) => (list || []).map((t) => `<span class="tag">${esc(t)}</span>`).join('');

export function scoreClass(v, good = 80, warn = 60) {
  if (v === null || v === undefined) return '';
  return v >= good ? 'good' : v >= warn ? 'warn' : 'bad';
}
export function meter(value, { good = 80, warn = 60 } = {}) {
  if (value === null || value === undefined) return '<span class="muted">–</span>';
  const cls = value >= good ? '' : value >= warn ? 'warn' : 'bad';
  return `<div class="row" style="gap:8px;flex-wrap:nowrap"><div class="meter ${cls}" style="flex:1"><span style="width:${Math.max(2, Math.min(100, value))}%"></span></div><span class="small num">${value}%</span></div>`;
}

// Stacked bar chart: series = [{ key, color, label }], rows = [{ day, ...values }]
export function bars(rows, series) {
  const max = Math.max(1, ...rows.map((r) => series.reduce((s, x) => s + (r[x.key] || 0), 0)));
  const cols = rows.map((r) => {
    const segs = series.slice().reverse().map((x) => `<div class="seg" style="height:${(100 * (r[x.key] || 0)) / max}%;background:${x.color}"></div>`).join('');
    const tip = `${esc(r.day)}: ${series.map((x) => `${x.label} ${r[x.key] || 0}`).join(' · ')}`;
    return `<div class="col"><div class="tip">${tip}</div>${segs}<div class="x">${esc(String(r.day).slice(5))}</div></div>`;
  }).join('');
  const legend = series.map((x) => `<span><i style="background:${x.color}"></i>${esc(x.label)}</span>`).join('');
  return `<div class="legend">${legend}</div><div class="bars">${cols}</div>`;
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

export function errorToast(err) {
  toast(err.message || String(err), 'error');
}

// ---------- modal ----------
// Returns { el, close }. `onOk` may return false to keep the modal open.
export function modal({ title, body, okText = 'Save', cancelText = 'Cancel', wide = false, onOk, footer = true }) {
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal ${wide ? 'wide' : ''}" role="dialog" aria-modal="true">
      <div class="modal-h"><h2>${esc(title)}</h2><button class="x-btn" data-x aria-label="Close">&times;</button></div>
      <div class="modal-b">${body}</div>
      ${footer ? `<div class="modal-f"><button class="btn" data-x>${esc(cancelText)}</button>${onOk ? `<button class="btn primary" data-ok>${esc(okText)}</button>` : ''}</div>` : ''}
    </div>`;
  const onKey = (e) => { if (e.key === 'Escape' && overlay === document.querySelector('.overlay:last-of-type')) close(); };
  const close = () => { overlay.remove(); document.removeEventListener('keydown', onKey); };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('click', (e) => { if (e.target === overlay || e.target.closest('[data-x]')) close(); });
  document.body.appendChild(overlay);
  const ok = overlay.querySelector('[data-ok]');
  if (ok && onOk) {
    ok.addEventListener('click', async () => {
      ok.disabled = true;
      try {
        const keep = await onOk(overlay);
        if (keep !== false) close();
      } catch (err) {
        errorToast(err);
      } finally {
        ok.disabled = false;
      }
    });
  }
  const first = overlay.querySelector('input, select, textarea');
  if (first) first.focus();
  return { el: overlay, close };
}

export function confirmBox(message, okText = 'Yes, continue') {
  return new Promise((resolve) => {
    const m = modal({ title: 'Please confirm', body: `<p>${esc(message)}</p>`, okText, onOk: () => resolve(true) });
    m.el.addEventListener('click', (e) => { if (e.target === m.el || e.target.closest('[data-x]')) resolve(false); });
  });
}

// Collect named form fields into an object (checkboxes -> booleans, multi checkboxes -> arrays).
export function formData(root) {
  const out = {};
  root.querySelectorAll('[name]').forEach((el) => {
    const name = el.name;
    if (el.type === 'checkbox') {
      if (el.dataset.multi !== undefined) {
        out[name] = out[name] || [];
        if (el.checked) out[name].push(el.value);
      } else out[name] = el.checked;
    } else if (el.type === 'radio') {
      if (el.checked) out[name] = el.value;
    } else out[name] = el.value;
  });
  return out;
}

// Poll a background task and show its progress in `el`. Resolves with the finished task.
export async function followTask(taskId, el, labelText) {
  for (;;) {
    const t = await api(`/tasks/${taskId}`);
    if (el) {
      const p = t.total ? Math.round((100 * t.progress) / t.total) : (t.status === 'running' ? 5 : 100);
      el.innerHTML = `<div class="small mb">${esc(labelText || t.label)} ${t.total ? `(${t.progress}/${t.total})` : ''} ${chip(t.status)}</div>
        <div class="progress"><span style="width:${p}%"></span></div>`;
    }
    if (t.status !== 'running') return t;
    await new Promise((r) => setTimeout(r, 1500));
  }
}

export function resultSummary(result) {
  if (!result || typeof result !== 'object') return '';
  return Object.entries(result)
    .filter(([, v]) => typeof v !== 'object' || (Array.isArray(v) && v.length))
    .map(([k, v]) => (Array.isArray(v) ? `<div class="small muted">${esc(k)}: ${v.map(esc).join('<br>')}</div>` : `<b>${esc(label(k))}</b>: ${esc(v)}`))
    .join(' &nbsp; ');
}
