import { api, esc, rupee, confirmBox, toast, act } from '../core.js';

const BLUE = '#2a78d6';
const GRID = '#ece9e2';
const INK = '#55534e';

let charts = [];
let days = 7;

function bar(canvas, labels, values, { horizontal = false, money = false } = {}) {
  if (!window.Chart) return;
  const fmt = (v) => (money ? rupee(v) : Number(v).toLocaleString('en-IN'));
  // the value axis gets number formatting; the category axis keeps Chart.js's own labels
  const valueTicks = { color: INK, callback: (v) => fmt(v) };
  const categoryTicks = { color: INK, autoSkip: true, maxRotation: 0 };
  charts.push(new window.Chart(canvas, {
    type: 'bar',
    data: { labels, datasets: [{ data: values, backgroundColor: BLUE, borderRadius: 4, maxBarThickness: 26 }] },
    options: {
      indexAxis: horizontal ? 'y' : 'x',
      maintainAspectRatio: false,
      animation: { duration: 250 },
      plugins: {
        legend: { display: false },
        tooltip: { callbacks: { label: (c) => fmt(c.parsed[horizontal ? 'x' : 'y']) } },
      },
      scales: {
        x: { grid: { color: horizontal ? GRID : 'transparent' }, ticks: horizontal ? valueTicks : categoryTicks, beginAtZero: true },
        y: { grid: { color: horizontal ? 'transparent' : GRID }, ticks: horizontal ? categoryTicks : valueTicks, beginAtZero: true },
      },
    },
  }));
}

function destroyCharts() {
  charts.forEach((c) => c.destroy());
  charts = [];
}

export async function render(ctx) {
  ctx.title('Dashboard', '<span class="live-dot">live</span>');
  const actions = ctx.actions(`
    <div class="seg" role="group" aria-label="Period">
      <button data-days="1">Today</button><button data-days="7">7 days</button><button data-days="30">30 days</button>
    </div>
    <button class="btn" id="reset">Reset demo data</button>`);
  actions.querySelectorAll('[data-days]').forEach((b) => {
    b.onclick = () => { days = Number(b.dataset.days); load(); };
  });
  actions.querySelector('#reset').onclick = async (e) => {
    const ok = await confirmBox('Reset demo data?',
      'This deletes every order, bill and payment and regenerates 30 days of sample history plus a live service.', 'Reset');
    if (!ok) return;
    const res = await act(e.target, () => api('/admin/reset-demo', { method: 'POST' }));
    if (res) { toast(res.message, 'ok'); load(); }
  };
  ctx.onCleanup(destroyCharts);

  async function load() {
    actions.querySelectorAll('[data-days]').forEach((b) => b.classList.toggle('on', Number(b.dataset.days) === days));
    const d = await api(`/reports/summary?days=${days}`);
    destroyCharts();
    const period = days === 1 ? 'today' : `last ${days} days`;
    const k = d.kpi;
    const l = d.live;
    const payTotal = d.payments.reduce((s, p) => s + Number(p.amount), 0) || 1;

    ctx.root.innerHTML = `
      <div class="grid cols-4">
        <div class="card kpi"><div class="label">Revenue</div><div class="value">${rupee(k.revenue)}</div><div class="sub">${period}, incl. GST</div></div>
        <div class="card kpi"><div class="label">Orders</div><div class="value">${k.orders}</div><div class="sub">${k.takeaway} takeaway</div></div>
        <div class="card kpi"><div class="label">Average order</div><div class="value">${rupee(k.avg_order)}</div><div class="sub">per paid bill</div></div>
        <div class="card kpi"><div class="label">Guests served</div><div class="value">${Number(k.guests).toLocaleString('en-IN')}</div><div class="sub">dine-in covers</div></div>
      </div>
      <div class="card livebar" style="margin-top:16px">
        <span>Right now:</span>
        <span><b>${l.occupied}/${l.tables}</b> tables occupied</span>
        <span><b>${l.open_orders}</b> open orders</span>
        <span><b>${l.kitchen}</b> dishes in the kitchen queue</span>
        <span><b style="color:${l.low_stock ? 'var(--danger)' : 'inherit'}">${l.low_stock}</b> ingredients low</span>
      </div>
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>Revenue by day</h2><span class="muted small">${period}</span></div>
          <div class="chart-box"><canvas id="c-daily" aria-label="Revenue by day"></canvas></div></div>
        <div class="card"><div class="card-head"><h2>Orders by hour of day</h2><span class="muted small">lunch and dinner peaks</span></div>
          <div class="chart-box"><canvas id="c-hourly" aria-label="Orders by hour"></canvas></div></div>
        <div class="card"><div class="card-head"><h2>Top dishes</h2><span class="muted small">plates sold</span></div>
          <div class="chart-box tall"><canvas id="c-top" aria-label="Top dishes"></canvas></div></div>
        <div class="card"><div class="card-head"><h2>Revenue by category</h2><span class="muted small">before GST</span></div>
          <div class="chart-box tall"><canvas id="c-cat" aria-label="Revenue by category"></canvas></div></div>
      </div>
      <div class="grid cols-3" style="margin-top:16px">
        <div class="card"><div class="card-head"><h2>Payment modes</h2></div>
          ${d.payments.length ? `<table class="data"><tbody>${d.payments.map((p) => `
            <tr><td>${esc(p.mode)}</td>
                <td style="width:45%"><div class="bar"><span style="width:${(100 * p.amount / payTotal).toFixed(1)}%"></span></div></td>
                <td class="right num">${(100 * p.amount / payTotal).toFixed(0)}%</td>
                <td class="right num">${rupee(p.amount)}</td></tr>`).join('')}</tbody></table>` : '<div class="empty">No payments yet</div>'}
        </div>
        <div class="card"><div class="card-head"><h2>Waiter performance</h2></div>
          ${d.waiters.length ? `<table class="data"><thead><tr><th>Waiter</th><th class="right">Orders</th><th class="right">Revenue</th><th class="right">Avg bill</th></tr></thead>
          <tbody>${d.waiters.map((w) => `<tr><td>${esc(w.waiter)}</td><td class="right num">${w.orders}</td>
            <td class="right num">${rupee(w.revenue)}</td><td class="right num">${rupee(w.avg_bill)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">No orders yet</div>'}
        </div>
        <div class="card"><div class="card-head"><h2>Low stock</h2><a href="#/inventory" class="small">Inventory</a></div>
          ${d.low_stock.length ? `<table class="data"><tbody>${d.low_stock.map((s) => `
            <tr><td>${esc(s.name)}</td><td class="right num">${Number(s.stock_qty)} ${esc(s.unit)}</td>
            <td class="right small muted">reorder at ${Number(s.reorder_level)}</td></tr>`).join('')}</tbody></table>`
            : '<div class="empty">All ingredients above reorder level</div>'}
        </div>
      </div>
      <div class="card" style="margin-top:16px"><div class="card-head"><h2>Kitchen speed</h2><span class="muted small">slowest dishes, ${period}</span></div>
        ${d.kitchen.length ? `<div class="table-wrap"><table class="data"><thead><tr><th>Dish</th><th class="right">Target prep</th>
          <th class="right">Average prep</th><th class="right">Order to table</th><th class="right">Plates</th></tr></thead>
          <tbody>${d.kitchen.map((r) => `<tr><td>${esc(r.name)}</td><td class="right num">${r.target} min</td>
            <td class="right num">${r.avg_prep} min</td><td class="right num">${r.avg_to_table} min</td><td class="right num">${r.servings}</td></tr>`).join('')}
          </tbody></table></div>` : '<div class="empty">No completed dishes in this period</div>'}
      </div>`;

    const dayLabel = (s) => new Date(`${s}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
    bar(ctx.root.querySelector('#c-daily'), d.daily.map((x) => dayLabel(x.day)), d.daily.map((x) => Number(x.revenue)), { money: true });
    bar(ctx.root.querySelector('#c-hourly'), d.hourly.map((x) => (x.hour > 12 ? `${x.hour - 12} PM` : x.hour === 12 ? '12 PM' : `${x.hour} AM`)),
      d.hourly.map((x) => x.orders));
    bar(ctx.root.querySelector('#c-top'), d.top_items.map((x) => x.name), d.top_items.map((x) => x.qty), { horizontal: true });
    bar(ctx.root.querySelector('#c-cat'), d.categories.map((x) => x.name), d.categories.map((x) => Number(x.revenue)), { horizontal: true, money: true });
  }

  await load();
  ctx.poll(load, 30000);
}
