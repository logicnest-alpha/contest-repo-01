import { api, esc, rupee, chip, minsAgo, modal, hasRole } from '../core.js';

export async function render(ctx) {
  ctx.title('Tables', '<span class="live-dot">updates every 5 s</span>');
  if (hasRole('WAITER')) {
    ctx.actions('<button class="btn btn-primary" id="takeaway">+ New takeaway</button>')
      .querySelector('#takeaway').onclick = takeawayDialog;
  }

  async function load() {
    const tables = await api('/tables');
    const areas = [...new Set(tables.map((t) => t.area))];
    const count = (s) => tables.filter((t) => t.table_state === s).length;
    ctx.root.innerHTML = `
      <div class="legend">
        ${['FREE', 'OCCUPIED', 'FOOD_READY', 'BILLING'].map((s) => `${chip(s)} <span class="small muted">${count(s)}</span>`).join(' ')}
      </div>
      ${areas.map((area) => `
        <div class="area-title">${esc(area)}</div>
        <div class="floor">
          ${tables.filter((t) => t.area === area).map((t) => `
            <button class="tcard ${t.table_state}" data-id="${t.table_id}" data-order="${t.order_id || ''}">
              <div class="row"><span class="tno">${esc(t.table_no)}</span><span class="spacer"></span>${chip(t.table_state)}</div>
              <div class="meta">${t.capacity} seats${t.order_id ? ` · ${t.guests} guests · ${esc(t.waiter)}` : ''}</div>
              ${t.order_id ? `<div class="meta">Order #${t.order_id} · ${minsAgo(t.seated_at)} min</div>
                <div class="amt">${rupee(t.running_total)}</div>` : '<div class="amt muted">Tap to seat guests</div>'}
            </button>`).join('')}
        </div>`).join('')}`;

    ctx.root.querySelectorAll('.tcard').forEach((card) => {
      card.onclick = () => {
        if (card.dataset.order) {
          location.hash = `#/orders/${card.dataset.order}`;
        } else if (hasRole('WAITER')) {
          const t = tables.find((x) => String(x.table_id) === card.dataset.id);
          seatDialog(t);
        }
      };
    });
  }

  function seatDialog(t) {
    const m = modal(`<h2>Seat guests at ${esc(t.table_no)}</h2>
      <label for="g">Number of guests (max ${t.capacity})</label>
      <input id="g" type="number" min="1" max="${t.capacity}" value="${Math.min(2, t.capacity)}">
      <div class="modal-actions"><button class="btn" data-close>Cancel</button>
      <button class="btn btn-primary" id="go">Take order</button></div>`);
    m.el.querySelector('#go').onclick = () => {
      const g = Number(m.el.querySelector('#g').value);
      m.close();
      location.hash = `#/new-order?table=${t.table_id}&no=${encodeURIComponent(t.table_no)}&guests=${g}`;
    };
  }

  await load();
  ctx.poll(load, 5000);
}

export function takeawayDialog() {
  const m = modal(`<h2>New takeaway order</h2>
    <div class="stack">
      <div><label for="n">Customer name</label><input id="n" type="text" maxlength="60" placeholder="optional"></div>
      <div><label for="ph">Mobile number</label><input id="ph" type="tel" maxlength="10" placeholder="optional, 10 digits"></div>
    </div>
    <div class="modal-actions"><button class="btn" data-close>Cancel</button>
    <button class="btn btn-primary" id="go">Choose dishes</button></div>`);
  m.el.querySelector('#go').onclick = () => {
    const q = new URLSearchParams({ type: 'TAKEAWAY', name: m.el.querySelector('#n').value.trim(), phone: m.el.querySelector('#ph').value.trim() });
    m.close();
    location.hash = `#/new-order?${q}`;
  };
}
