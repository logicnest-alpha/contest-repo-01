// Menu management (manager): prices, availability, new dishes.
import { api, esc, rupee, vegDot, modal, toast, act } from '../core.js';

export async function render(ctx) {
  ctx.title('Menu');
  let data;
  ctx.actions('<button class="btn btn-primary" id="add">+ Add dish</button>').querySelector('#add').onclick = addDialog;

  async function load() {
    data = await api('/menu');
    ctx.root.innerHTML = data.categories.map((c) => {
      const items = data.items.filter((i) => i.category_id === c.category_id);
      return `<div class="card table-wrap" style="margin-bottom:16px">
        <div class="card-head"><h2>${esc(c.name)}</h2><span class="muted small">${items.length} dishes</span></div>
        <table class="data"><thead><tr><th>Dish</th><th style="width:130px">Price (₹)</th><th class="right">Prep</th>
          <th class="right">Can make</th><th>Available</th></tr></thead>
        <tbody>${items.map((i) => `<tr data-id="${i.item_id}">
          <td><div class="row" style="gap:7px">${vegDot(i.is_veg)}<b>${esc(i.name)}</b></div>
            <div class="small muted">${esc(i.description || '')}</div></td>
          <td><input type="number" min="1" step="1" value="${Number(i.price)}" data-f="price" aria-label="Price of ${esc(i.name)}"></td>
          <td class="right num">${i.prep_minutes} min</td>
          <td class="right num">${i.servings_left === null ? '—' : `${i.servings_left} plates`}</td>
          <td><label class="row" style="margin:0;gap:6px"><input type="checkbox" data-f="is_available" ${i.is_available ? 'checked' : ''}>
            ${i.is_available ? 'On menu' : 'Hidden'}</label></td>
        </tr>`).join('')}</tbody></table></div>`;
    }).join('');

    ctx.root.querySelectorAll('[data-f]').forEach((input) => {
      input.onchange = async () => {
        const id = input.closest('tr').dataset.id;
        const field = input.dataset.f;
        const value = field === 'price' ? Number(input.value) : input.checked;
        const ok = await act(null, () => api(`/menu/items/${id}`, { method: 'PATCH', body: { [field]: value } }));
        if (ok) toast(field === 'price' ? `Price updated to ${rupee(value)}` : (value ? 'Dish is back on the menu' : 'Dish hidden from the menu'), 'ok');
        load();
      };
    });
  }

  function addDialog() {
    const m = modal(`<h2>Add a dish</h2>
      <div class="stack">
        <div><label for="n">Name</label><input id="n" type="text" maxlength="60"></div>
        <div><label for="d">Description</label><input id="d" type="text" maxlength="200"></div>
        <div class="row">
          <div style="flex:1"><label for="c">Category</label><select id="c">${data.categories.map((c) =>
            `<option value="${c.category_id}">${esc(c.name)}</option>`).join('')}</select></div>
          <div style="width:110px"><label for="p">Price (₹)</label><input id="p" type="number" min="1"></div>
          <div style="width:100px"><label for="t">Prep (min)</label><input id="t" type="number" min="1" value="15"></div>
        </div>
        <label class="row" style="gap:6px"><input type="checkbox" id="v" checked> Vegetarian</label>
      </div>
      <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="save">Save dish</button></div>`);
    m.el.querySelector('#save').onclick = (e) => act(e.target, async () => {
      const v = (s) => m.el.querySelector(s);
      await api('/menu/items', { method: 'POST', body: {
        name: v('#n').value, description: v('#d').value, category_id: Number(v('#c').value),
        price: Number(v('#p').value), prep_minutes: Number(v('#t').value), is_veg: v('#v').checked,
      } });
      m.close();
      toast('Dish added', 'ok');
      load();
    });
  }

  await load();
}
