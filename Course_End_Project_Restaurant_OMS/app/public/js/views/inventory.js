// Ingredient stock; deducted automatically by a database trigger when dishes are ordered.
import { api, esc, rupee, chip, modal, toast, act, hasRole } from '../core.js';

export async function render(ctx) {
  ctx.title('Inventory', '<span class="live-dot">stock falls automatically as orders are placed</span>');

  async function load() {
    const rows = await api('/inventory');
    const value = rows.reduce((s, r) => s + Number(r.stock_qty) * Number(r.cost_per_unit), 0);
    const low = rows.filter((r) => r.low).length;
    ctx.root.innerHTML = `
      <div class="grid cols-3" style="margin-bottom:16px">
        <div class="card kpi"><div class="label">Ingredients</div><div class="value">${rows.length}</div></div>
        <div class="card kpi"><div class="label">Below reorder level</div><div class="value" style="color:${low ? 'var(--danger)' : 'inherit'}">${low}</div></div>
        <div class="card kpi"><div class="label">Stock value</div><div class="value">${rupee(value)}</div></div>
      </div>
      <div class="card table-wrap"><table class="data">
        <thead><tr><th>Ingredient</th><th>Stock vs normal level</th><th class="right">In stock</th>
          <th class="right">Reorder at</th><th>Status</th><th class="right">Used in</th><th></th></tr></thead>
        <tbody>${rows.map((r) => {
          const pct = Math.min(100, (100 * Number(r.stock_qty)) / Math.max(Number(r.par_qty), 0.001));
          return `<tr>
            <td><b>${esc(r.name)}</b></td>
            <td style="width:24%"><div class="bar ${r.low ? 'low' : ''}"><span style="width:${pct.toFixed(0)}%"></span></div></td>
            <td class="right num">${Number(r.stock_qty)} ${esc(r.unit)}</td>
            <td class="right num">${Number(r.reorder_level)} ${esc(r.unit)}</td>
            <td>${r.low ? chip('LOW') : '<span class="small muted">OK</span>'}</td>
            <td class="right num">${r.used_in} dishes</td>
            <td class="right">${hasRole() ? `<button class="btn btn-sm" data-id="${r.ingredient_id}" data-name="${esc(r.name)}" data-unit="${esc(r.unit)}">Restock</button>` : ''}</td>
          </tr>`;
        }).join('')}</tbody></table></div>`;

    ctx.root.querySelectorAll('[data-id]').forEach((btn) => {
      btn.onclick = () => {
        const m = modal(`<h2>Restock ${esc(btn.dataset.name)}</h2>
          <label for="q">Quantity received (${esc(btn.dataset.unit)})</label><input id="q" type="number" min="0.1" step="0.1">
          <div class="modal-actions"><button class="btn" data-close>Cancel</button><button class="btn btn-primary" id="ok">Add to stock</button></div>`);
        m.el.querySelector('#ok').onclick = (e) => act(e.target, async () => {
          await api(`/inventory/${btn.dataset.id}/restock`, { method: 'POST', body: { qty: Number(m.el.querySelector('#q').value) } });
          m.close();
          toast('Stock updated', 'ok');
          load();
        });
      };
    });
  }

  await load();
  ctx.poll(load, 15000);
}
