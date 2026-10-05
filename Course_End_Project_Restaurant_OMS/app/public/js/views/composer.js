// Menu picker + cart, used for a new dine-in order, a new takeaway order,
// or adding dishes to an existing order.
import { api, esc, rupee, vegDot, billPreview, toast, act } from '../core.js';

export async function render(ctx) {
  const addTo = ctx.params[0] ? Number(ctx.params[0]) : null;
  const q = ctx.query;
  const takeaway = q.get('type') === 'TAKEAWAY';
  let header;
  if (addTo) {
    const o = await api(`/orders/${addTo}`);
    header = `Add to order #${addTo}${o.table_no ? ` · ${o.table_no}` : ' · Takeaway'}`;
  } else if (takeaway) {
    header = 'New takeaway order';
  } else {
    header = `New order · ${q.get('no') || 'Table'}`;
  }
  ctx.title(header);

  const { categories, items } = await api('/menu');
  const cart = new Map();                      // item_id -> { item, qty, notes }
  let activeCat = 'all';
  let search = '';
  let vegOnly = false;

  ctx.root.innerHTML = `
    <div class="composer">
      <div>
        <div class="row">
          <input type="text" id="search" placeholder="Search dishes…" style="max-width:320px">
          <label class="row small" style="margin:0;gap:6px"><input type="checkbox" id="veg"> Veg only</label>
        </div>
        <div class="cat-tabs" id="cats"></div>
        <div class="menu-grid" id="dishes"></div>
      </div>
      <aside class="card cart">
        <div class="card-head"><h2>Order</h2><span class="muted small" id="count"></span></div>
        ${!addTo && takeaway ? `
          <div class="stack" style="margin-bottom:8px">
            <div><label for="cn">Customer name</label><input id="cn" type="text" maxlength="60" value="${esc(q.get('name') || '')}"></div>
            <div><label for="cp">Mobile</label><input id="cp" type="tel" maxlength="10" value="${esc(q.get('phone') || '')}"></div>
          </div>` : ''}
        ${!addTo && !takeaway ? `
          <div style="margin-bottom:8px"><label for="guests">Guests</label>
          <input id="guests" type="number" min="1" max="20" value="${esc(q.get('guests') || 2)}"></div>` : ''}
        <div id="lines"></div>
        <div class="totals" id="totals"></div>
        <button class="btn btn-primary btn-lg btn-block" id="place" style="margin-top:14px" disabled>
          ${addTo ? 'Add to order' : 'Send to kitchen'}</button>
        <a class="btn btn-block" style="margin-top:8px" href="${addTo ? `#/orders/${addTo}` : '#/tables'}">Cancel</a>
      </aside>
    </div>`;

  const $ = (sel) => ctx.root.querySelector(sel);

  function renderCats() {
    $('#cats').innerHTML = [['all', 'All'], ...categories.map((c) => [String(c.category_id), c.name])]
      .map(([id, name]) => `<button data-cat="${id}" class="${activeCat === id ? 'on' : ''}">${esc(name)}</button>`).join('');
    $('#cats').querySelectorAll('button').forEach((b) => {
      b.onclick = () => { activeCat = b.dataset.cat; renderCats(); renderDishes(); };
    });
  }

  function renderDishes() {
    const list = items.filter((i) =>
      (activeCat === 'all' || String(i.category_id) === activeCat)
      && (!vegOnly || i.is_veg)
      && (!search || i.name.toLowerCase().includes(search)));
    $('#dishes').innerHTML = list.length ? list.map((i) => {
      const left = i.servings_left;
      const out = !i.is_available || left === 0;
      const inCart = cart.get(i.item_id)?.qty || 0;
      return `<button class="dish" data-id="${i.item_id}" ${out ? 'disabled' : ''}>
        <div class="dn">${vegDot(i.is_veg)}<span>${esc(i.name)}</span></div>
        <div class="dd">${esc(i.description || '')}</div>
        <div class="dp"><span>${rupee(i.price)}</span>
          <span class="left ${left !== null && left < 5 ? 'low' : ''}">${!i.is_available ? 'Unavailable'
            : left === null ? '' : left === 0 ? 'Out of stock' : `${left} left`}${inCart ? ` · ${inCart} in order` : ''}</span></div>
      </button>`;
    }).join('') : '<div class="empty">No dishes match</div>';
    $('#dishes').querySelectorAll('.dish').forEach((b) => {
      b.onclick = () => {
        const item = items.find((i) => i.item_id === Number(b.dataset.id));
        const line = cart.get(item.item_id) || { item, qty: 0, notes: '' };
        line.qty += 1;
        cart.set(item.item_id, line);
        renderCart();
        renderDishes();
      };
    });
  }

  function renderCart() {
    const lines = [...cart.values()];
    const subtotal = lines.reduce((s, l) => s + l.qty * Number(l.item.price), 0);
    $('#count').textContent = lines.length ? `${lines.reduce((s, l) => s + l.qty, 0)} items` : '';
    $('#lines').innerHTML = lines.length ? lines.map((l) => `
      <div class="cart-line" data-id="${l.item.item_id}">
        <div class="nm">${esc(l.item.name)}<div class="muted small">${rupee(l.item.price)} each</div></div>
        <div class="stack" style="align-items:flex-end;gap:4px">
          <div class="qty"><button data-d="-1" aria-label="Less">−</button><span>${l.qty}</span><button data-d="1" aria-label="More">+</button></div>
          <span class="num small">${rupee(l.qty * l.item.price)}</span></div>
        <input type="text" maxlength="100" placeholder="Note for the kitchen (e.g. less spicy)" value="${esc(l.notes)}">
      </div>`).join('') : '<div class="empty">Tap dishes on the left to add them</div>';
    $('#lines').querySelectorAll('.cart-line').forEach((row) => {
      const id = Number(row.dataset.id);
      row.querySelectorAll('[data-d]').forEach((b) => {
        b.onclick = () => {
          const l = cart.get(id);
          l.qty += Number(b.dataset.d);
          if (l.qty <= 0) cart.delete(id);
          renderCart();
          renderDishes();
        };
      });
      row.querySelector('input').oninput = (e) => { cart.get(id).notes = e.target.value; };
    });
    const p = billPreview(subtotal, 0);
    $('#totals').innerHTML = lines.length ? `
      <div><span>Subtotal</span><span class="num">${rupee(p.sub, 2)}</span></div>
      <div class="muted"><span>GST 5% (CGST + SGST)</span><span class="num">${rupee(p.cgst + p.sgst, 2)}</span></div>
      <div class="grand"><span>Estimated total</span><span class="num">${rupee(p.total)}</span></div>` : '';
    $('#place').disabled = !lines.length;
  }

  $('#search').oninput = (e) => { search = e.target.value.trim().toLowerCase(); renderDishes(); };
  $('#veg').onchange = (e) => { vegOnly = e.target.checked; renderDishes(); };

  $('#place').onclick = (e) => act(e.target, async () => {
    const payload = [...cart.values()].map((l) => ({ item_id: l.item.item_id, qty: l.qty, notes: l.notes }));
    if (addTo) {
      await api(`/orders/${addTo}/items`, { method: 'POST', body: { items: payload } });
      toast('Dishes sent to the kitchen', 'ok');
      location.hash = `#/orders/${addTo}`;
      return;
    }
    const body = takeaway
      ? { order_type: 'TAKEAWAY', customer_name: $('#cn').value.trim(), phone: $('#cp').value.trim(), items: payload }
      : { order_type: 'DINE_IN', table_id: Number(q.get('table')), guests: Number($('#guests').value), items: payload };
    const { order_id } = await api('/orders', { method: 'POST', body });
    toast(`Order #${order_id} sent to the kitchen`, 'ok');
    location.hash = `#/orders/${order_id}`;
  });

  renderCats();
  renderDishes();
  renderCart();
}
