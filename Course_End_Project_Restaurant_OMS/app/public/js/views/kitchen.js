// Kitchen Display System: one ticket per dish, three columns.
import { api, esc, vegDot, hasRole, act } from '../core.js';

const COLUMNS = [
  ['PENDING', 'To do'],
  ['PREPARING', 'Cooking'],
  ['READY', 'Ready to serve'],
];

export async function render(ctx) {
  ctx.title('Kitchen', '<span class="live-dot">updates every 5 s</span>');

  async function load() {
    const queue = await api('/kitchen');
    ctx.root.innerHTML = `<div class="kds">${COLUMNS.map(([status, label]) => {
      const list = queue.filter((q) => q.status === status);
      return `<div class="kcol"><div class="kcol-head"><span>${label}</span><span class="chip ${status}">${list.length}</span></div>
        ${list.length ? list.map(ticket).join('') : '<div class="empty small">Nothing here</div>'}</div>`;
    }).join('')}</div>`;
    ctx.root.querySelectorAll('[data-item]').forEach((btn) => {
      btn.onclick = async () => {
        const ok = await act(btn, () => api(`/order-items/${btn.dataset.item}`, { method: 'PATCH', body: { status: btn.dataset.status } }));
        if (ok) load();
      };
    });
  }

  function ticket(q) {
    const late = q.status !== 'READY' && q.waiting_min > q.prep_minutes;
    const buttons = [];
    if (q.status === 'PENDING' && hasRole('CHEF')) buttons.push(['PREPARING', 'Start cooking', 'btn-primary']);
    if (q.status === 'PREPARING' && hasRole('CHEF')) buttons.push(['READY', 'Mark ready', 'btn-primary']);
    if (q.status === 'READY' && hasRole('WAITER')) buttons.push(['SERVED', 'Served', 'btn-primary']);
    return `<div class="ticket ${late ? 'late' : ''}">
      <div class="tt"><span class="row" style="gap:7px">${vegDot(q.is_veg)}${q.quantity} × ${esc(q.item_name)}</span>
        <span class="timer">${q.waiting_min} min</span></div>
      <div class="where">${q.table_no ? `Table ${esc(q.table_no)}` : 'Takeaway'} · <a href="#/orders/${q.order_id}">Order #${q.order_id}</a>
        · target ${q.prep_minutes} min</div>
      ${q.notes ? `<div class="note">${esc(q.notes)}</div>` : ''}
      ${buttons.length ? `<div class="row">${buttons.map(([s, label, cls]) =>
        `<button class="btn btn-sm ${cls}" data-item="${q.order_item_id}" data-status="${s}">${label}</button>`).join('')}</div>` : ''}
    </div>`;
  }

  await load();
  ctx.poll(load, 5000);
}
