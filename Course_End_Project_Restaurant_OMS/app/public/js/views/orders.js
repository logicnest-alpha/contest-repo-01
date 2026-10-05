import { api, esc, rupee, chip, timeOf, dateTimeOf, hasRole } from '../core.js';
import { takeawayDialog } from './tables.js';

let scope = 'open';

export async function render(ctx) {
  ctx.title('Orders', '<span class="live-dot">updates every 10 s</span>');
  const actions = ctx.actions(`
    <div class="seg" role="group" aria-label="Show">
      <button data-s="open">Open</button><button data-s="today">Today</button><button data-s="recent">Recent</button>
    </div>
    ${hasRole('WAITER') ? '<button class="btn btn-primary" id="takeaway">+ New takeaway</button>' : ''}`);
  actions.querySelectorAll('[data-s]').forEach((b) => { b.onclick = () => { scope = b.dataset.s; load(); }; });
  const tk = actions.querySelector('#takeaway');
  if (tk) tk.onclick = takeawayDialog;

  async function load() {
    actions.querySelectorAll('[data-s]').forEach((b) => b.classList.toggle('on', b.dataset.s === scope));
    const rows = await api(`/orders?scope=${scope}`);
    ctx.root.innerHTML = `<div class="card table-wrap">${rows.length ? `
      <table class="data">
        <thead><tr><th>Order</th><th>Where</th><th>Customer</th><th>Waiter</th><th class="right">Items</th>
          <th class="right">Amount</th><th>Status</th><th>Placed</th></tr></thead>
        <tbody>${rows.map((o) => `
          <tr class="click" data-id="${o.order_id}">
            <td><b>#${o.order_id}</b></td>
            <td>${o.table_no ? `${esc(o.table_no)} · ${o.guests} guests` : 'Takeaway'}</td>
            <td>${esc(o.customer_name || '—')}</td>
            <td>${esc(o.waiter)}</td>
            <td class="right num">${o.items}</td>
            <td class="right num">${rupee(o.bill_total || o.amount)}</td>
            <td>${chip(o.status)}</td>
            <td class="small muted">${scope === 'recent' ? dateTimeOf(o.created_at) : timeOf(o.created_at)}</td>
          </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">No orders here</div>'}</div>`;
    ctx.root.querySelectorAll('tr.click').forEach((tr) => {
      tr.onclick = () => { location.hash = `#/orders/${tr.dataset.id}`; };
    });
  }

  await load();
  ctx.poll(load, 10000);
}
