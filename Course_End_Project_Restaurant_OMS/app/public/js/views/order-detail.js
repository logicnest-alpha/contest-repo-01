import { api, esc, rupee, chip, vegDot, timeOf, minsAgo, hasRole, confirmBox, toast, act } from '../core.js';

const OPEN = ['PLACED', 'PREPARING', 'READY', 'SERVED'];

export async function render(ctx) {
  const id = Number(ctx.params[0]);

  async function setStatus(btn, itemId, status) {
    const ok = await act(btn, () => api(`/order-items/${itemId}`, { method: 'PATCH', body: { status } }));
    if (ok) load();
  }

  async function load() {
    const o = await api(`/orders/${id}`);
    ctx.title(`Order #${o.order_id}`, chip(o.status));
    const open = OPEN.includes(o.status);
    const allPending = o.lines.every((l) => ['PENDING', 'CANCELLED'].includes(l.status));
    const actions = ctx.actions(`
      ${open && hasRole('WAITER') ? `<a class="btn" href="#/orders/${o.order_id}/add">+ Add dishes</a>` : ''}
      ${open && allPending && hasRole('WAITER') ? '<button class="btn btn-danger" id="cancel">Cancel order</button>' : ''}
      ${['SERVED', 'BILLED'].includes(o.status) && hasRole('CASHIER') ? `<a class="btn btn-primary" href="#/billing/${o.order_id}">${o.status === 'SERVED' ? 'Generate bill' : 'Take payment'}</a>` : ''}`);
    const cancel = actions.querySelector('#cancel');
    if (cancel) {
      cancel.onclick = async () => {
        if (!(await confirmBox('Cancel this order?', 'All dishes will be cancelled and their ingredients returned to stock.', 'Cancel order'))) return;
        const done = await act(cancel, () => api(`/orders/${o.order_id}/cancel`, { method: 'POST' }));
        if (done) { toast('Order cancelled', 'ok'); load(); }
      };
    }

    const lineActions = (l) => {
      const b = [];
      if (!open) return '';
      if (l.status === 'PENDING' && hasRole('CHEF')) b.push(['PREPARING', 'Start']);
      if (['PENDING', 'PREPARING'].includes(l.status) && hasRole('CHEF')) b.push(['READY', 'Ready']);
      if (l.status === 'READY' && hasRole('WAITER')) b.push(['SERVED', 'Serve']);
      if (l.status === 'PENDING' && hasRole('WAITER')) b.push(['CANCELLED', 'Cancel']);
      return b.map(([s, label]) => `<button class="btn btn-sm ${s === 'CANCELLED' ? 'btn-danger' : ''}" data-item="${l.order_item_id}" data-status="${s}">${label}</button>`).join(' ');
    };

    const live = o.lines.filter((l) => l.status !== 'CANCELLED');
    const subtotal = live.reduce((s, l) => s + Number(l.line_total), 0);
    const b = o.bill;
    const paid = b ? b.payments.reduce((s, p) => s + Number(p.amount), 0) : 0;

    ctx.root.innerHTML = `
      <div class="grid cols-3" style="margin-bottom:16px">
        <div class="card kpi"><div class="label">${o.table_no ? 'Table' : 'Takeaway'}</div>
          <div class="value">${o.table_no ? esc(o.table_no) : esc(o.customer_name || 'Guest')}</div>
          <div class="sub">${o.table_no ? `${o.guests} guests` : esc(o.phone || 'no phone')}</div></div>
        <div class="card kpi"><div class="label">Placed</div><div class="value">${timeOf(o.created_at)}</div>
          <div class="sub">${open ? `${minsAgo(o.created_at)} min ago` : ''} · by ${esc(o.waiter)}</div></div>
        <div class="card kpi"><div class="label">${b ? 'Bill total' : 'Running total'}</div>
          <div class="value">${rupee(b ? b.total : subtotal)}</div>
          <div class="sub">${b ? `paid ${rupee(paid)}` : 'before GST'}</div></div>
      </div>
      <div class="card table-wrap">
        <table class="data">
          <thead><tr><th>Dish</th><th class="right">Qty</th><th class="right">Price</th><th class="right">Amount</th>
            <th>Status</th><th>Timeline</th><th></th></tr></thead>
          <tbody>${o.lines.map((l) => `
            <tr>
              <td><div class="row" style="gap:7px">${vegDot(l.is_veg)}<b>${esc(l.name)}</b></div>
                ${l.notes ? `<div class="small muted">Note: ${esc(l.notes)}</div>` : ''}</td>
              <td class="right num">${l.quantity}</td>
              <td class="right num">${rupee(l.unit_price)}</td>
              <td class="right num">${l.status === 'CANCELLED' ? '<s>' : ''}${rupee(l.line_total)}${l.status === 'CANCELLED' ? '</s>' : ''}</td>
              <td>${chip(l.status)}</td>
              <td class="small muted">${[['ordered', l.created_at], ['started', l.started_at], ['ready', l.ready_at], ['served', l.served_at]]
                .filter(([, t]) => t).map(([k, t]) => `${k} ${timeOf(t)}`).join(' · ')}</td>
              <td class="right">${lineActions(l)}</td>
            </tr>`).join('')}</tbody>
        </table>
      </div>
      ${b ? `<div class="card" style="margin-top:16px;max-width:420px">
        <h2 style="margin-bottom:10px">Bill #${b.bill_id}</h2>
        <div class="totals">
          <div><span>Subtotal</span><span class="num">${rupee(b.subtotal, 2)}</span></div>
          ${Number(b.discount) ? `<div><span>Discount (${Number(b.discount_pct)}%)</span><span class="num">−${rupee(b.discount, 2)}</span></div>` : ''}
          <div><span>CGST 2.5%</span><span class="num">${rupee(b.cgst, 2)}</span></div>
          <div><span>SGST 2.5%</span><span class="num">${rupee(b.sgst, 2)}</span></div>
          <div class="muted"><span>Round off</span><span class="num">${Number(b.round_off).toFixed(2)}</span></div>
          <div class="grand"><span>Total</span><span class="num">${rupee(b.total)}</span></div>
          ${b.payments.map((p) => `<div class="muted"><span>Paid by ${esc(p.mode)} at ${timeOf(p.paid_at)}</span><span class="num">${rupee(p.amount, 2)}</span></div>`).join('')}
        </div></div>` : ''}`;

    ctx.root.querySelectorAll('[data-item]').forEach((btn) => {
      btn.onclick = () => setStatus(btn, btn.dataset.item, btn.dataset.status);
    });
  }

  await load();
  ctx.poll(load, 5000);
}
