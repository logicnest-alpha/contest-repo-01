// Billing counter: generate GST bills and record payments.
import { api, esc, rupee, chip, timeOf, dateTimeOf, billPreview, modal, toast, act } from '../core.js';

export async function render(ctx) {
  ctx.title('Billing', '<span class="live-dot">updates every 10 s</span>');
  let selected = ctx.params[0] ? Number(ctx.params[0]) : null;

  ctx.root.innerHTML = `<div class="billing">
      <div class="card"><div class="card-head"><h2>Waiting at the counter</h2></div><div id="queue"></div></div>
      <div id="detail"></div></div>`;
  const $ = (s) => ctx.root.querySelector(s);

  async function loadQueue() {
    const list = await api('/orders?scope=billing');
    if (!selected && list.length) selected = list[list.length - 1].order_id;
    $('#queue').innerHTML = list.length ? list.slice().reverse().map((o) => `
      <div class="qitem ${o.order_id === selected ? 'on' : ''}" data-id="${o.order_id}">
        <div><b>${o.table_no ? esc(o.table_no) : 'Takeaway'}</b> <span class="muted small">#${o.order_id}</span>
          <div class="small muted">${esc(o.customer_name || o.waiter)} · ${timeOf(o.created_at)}</div></div>
        <div class="right">${chip(o.status === 'SERVED' ? 'SERVED' : 'BILLED')}
          <div class="num small" style="margin-top:4px">${rupee(o.bill_total || o.amount)}</div></div>
      </div>`).join('') : '<div class="empty">No orders waiting for a bill</div>';
    ctx.root.querySelectorAll('.qitem').forEach((el) => {
      el.onclick = () => { selected = Number(el.dataset.id); loadQueue(); loadDetail(); };
    });
    return list;
  }

  async function loadDetail() {
    if (!selected) { $('#detail').innerHTML = ''; return; }
    const o = await api(`/orders/${selected}`);
    const live = o.lines.filter((l) => l.status !== 'CANCELLED');
    const subtotal = live.reduce((s, l) => s + Number(l.line_total), 0);
    const where = o.table_no ? `Table ${esc(o.table_no)} · ${o.guests} guests` : `Takeaway · ${esc(o.customer_name || 'Guest')}`;
    const linesHtml = live.map((l) => `<div class="rl"><span>${l.quantity} × ${esc(l.name)}</span><span>${rupee(l.line_total, 2)}</span></div>`).join('');

    if (o.status === 'SERVED') {
      $('#detail').innerHTML = `<div class="card">
        <div class="card-head"><h2>Order #${o.order_id}</h2>${chip(o.status)}</div>
        <p class="muted small" style="margin-top:0">${where}</p>
        <div class="receipt">${linesHtml}</div>
        <div class="row" style="margin-top:14px"><label for="disc" style="margin:0">Discount %</label>
          <input id="disc" type="number" min="0" max="50" step="1" value="0" style="width:90px"></div>
        <div class="totals" id="preview"></div>
        <button class="btn btn-primary btn-lg btn-block" id="gen" style="margin-top:14px">Generate bill</button>
      </div>`;
      const preview = () => {
        const p = billPreview(subtotal, $('#disc').value);
        $('#preview').innerHTML = `
          <div><span>Subtotal</span><span class="num">${rupee(p.sub, 2)}</span></div>
          ${p.disc ? `<div><span>Discount</span><span class="num">−${rupee(p.disc, 2)}</span></div>` : ''}
          <div><span>CGST 2.5%</span><span class="num">${rupee(p.cgst, 2)}</span></div>
          <div><span>SGST 2.5%</span><span class="num">${rupee(p.sgst, 2)}</span></div>
          <div class="muted"><span>Round off</span><span class="num">${p.roundOff.toFixed(2)}</span></div>
          <div class="grand"><span>Total</span><span class="num">${rupee(p.total)}</span></div>`;
      };
      $('#disc').oninput = preview;
      preview();
      $('#gen').onclick = (e) => act(e.target, async () => {
        await api(`/orders/${o.order_id}/bill`, { method: 'POST', body: { discount_pct: Number($('#disc').value || 0) } });
        toast('Bill generated', 'ok');
        await loadQueue();
        await loadDetail();
      });
      return;
    }

    const b = o.bill;
    if (!b) { $('#detail').innerHTML = `<div class="card"><p>Order #${o.order_id} is ${esc(o.status)}.</p></div>`; return; }
    const paid = b.payments.reduce((s, p) => s + Number(p.amount), 0);
    const balance = Math.round((Number(b.total) - paid) * 100) / 100;
    const receipt = `
      <div class="receipt" id="print-area">
        <div style="text-align:center"><b>SPICE ROUTE</b><br>Hyderabad<br>Tax invoice (demo)</div><hr>
        <div class="rl"><span>Bill #${b.bill_id}</span><span>${dateTimeOf(b.created_at)}</span></div>
        <div class="rl"><span>${where}</span><span>Order #${o.order_id}</span></div><hr>
        ${linesHtml}<hr>
        <div class="rl"><span>Subtotal</span><span>${rupee(b.subtotal, 2)}</span></div>
        ${Number(b.discount) ? `<div class="rl"><span>Discount ${Number(b.discount_pct)}%</span><span>−${rupee(b.discount, 2)}</span></div>` : ''}
        <div class="rl"><span>CGST 2.5%</span><span>${rupee(b.cgst, 2)}</span></div>
        <div class="rl"><span>SGST 2.5%</span><span>${rupee(b.sgst, 2)}</span></div>
        <div class="rl"><span>Round off</span><span>${Number(b.round_off).toFixed(2)}</span></div><hr>
        <div class="rl"><b>TOTAL</b><b>${rupee(b.total, 2)}</b></div>
        ${b.payments.map((p) => `<div class="rl"><span>Paid (${esc(p.mode)})</span><span>${rupee(p.amount, 2)}</span></div>`).join('')}
        <hr><div style="text-align:center">Thank you! Visit again.</div>
      </div>`;

    $('#detail').innerHTML = `<div class="grid cols-2">
      <div class="card">${receipt}
        <button class="btn btn-block" id="print" style="margin-top:12px">Print receipt</button></div>
      <div class="card">
        <div class="card-head"><h2>Payment</h2>${chip(o.status)}</div>
        ${o.status === 'PAID' ? '<div class="notice">This bill is fully paid. The table is free again.</div>' : `
        <div class="totals" style="margin-top:0">
          <div><span>Bill total</span><span class="num">${rupee(b.total, 2)}</span></div>
          <div><span>Paid so far</span><span class="num">${rupee(paid, 2)}</span></div>
          <div class="grand"><span>Balance</span><span class="num">${rupee(balance, 2)}</span></div>
        </div>
        <div class="stack" style="margin-top:14px">
          <div><label>Mode</label><div class="seg" id="mode">
            <button data-m="UPI" class="on">UPI</button><button data-m="CASH">Cash</button><button data-m="CARD">Card</button></div></div>
          <div><label for="amt">Amount</label><input id="amt" type="number" min="1" step="0.01" value="${balance}"></div>
          <div id="cashbox" class="hidden"><label for="tender">Cash received</label>
            <input id="tender" type="number" min="0" step="1" placeholder="e.g. 2000"><div class="change" id="change"></div></div>
          <button class="btn btn-primary btn-lg" id="pay">Record payment</button>
        </div>`}
      </div></div>`;

    $('#print').onclick = () => window.print();
    if (o.status === 'PAID') return;
    let mode = 'UPI';
    ctx.root.querySelectorAll('#mode button').forEach((btn) => {
      btn.onclick = () => {
        mode = btn.dataset.m;
        ctx.root.querySelectorAll('#mode button').forEach((x) => x.classList.toggle('on', x === btn));
        $('#cashbox').classList.toggle('hidden', mode !== 'CASH');
      };
    });
    const showChange = () => {
      const t = Number($('#tender').value);
      const a = Number($('#amt').value);
      $('#change').textContent = t >= a && a > 0 ? `Return change: ${rupee(t - a, 2)}` : '';
    };
    $('#tender').oninput = showChange;
    $('#amt').oninput = showChange;
    $('#pay').onclick = (e) => act(e.target, async () => {
      const res = await api(`/bills/${b.bill_id}/payments`, { method: 'POST', body: { amount: Number($('#amt').value), mode } });
      if (Number(res.balance) === 0) {
        toast(`Paid in full${o.table_no ? ` — ${o.table_no} is free` : ''}`, 'ok');
        const done = modal(`<h2>Payment complete</h2>${receipt.replace('id="print-area"', '')}
          <div class="modal-actions"><button class="btn" data-close>Close</button></div>`);
        done.el.querySelector('[data-close]').focus();
      } else {
        toast(`Part payment saved. Balance ${rupee(res.balance, 2)}`, 'ok');
      }
      await loadQueue();
      await loadDetail();
    });
  }

  await loadQueue();
  await loadDetail();
  ctx.poll(loadQueue, 10000);
}
