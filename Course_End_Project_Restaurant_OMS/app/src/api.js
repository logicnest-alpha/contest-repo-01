// REST API. Every query is parameterised; business rules live in the
// database functions and triggers (see db/02_logic.sql).
const express = require('express');
const db = require('./db');
const { login, requireAuth, allow } = require('./auth');

const router = express.Router();
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const int = (v) => {
  const n = Number.parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
};
const bad = (res, msg) => res.status(400).json({ error: msg });

// ---------------------------------------------------------------- public
router.post('/auth/login', wrap(login));
router.get('/health', wrap(async (req, res) => {
  await db.query('SELECT 1');
  res.json({ ok: true, time: new Date().toISOString() });
}));

router.use(requireAuth);
router.get('/auth/me', (req, res) => res.json({ user: req.user }));

// ---------------------------------------------------------------- menu
router.get('/menu', wrap(async (req, res) => {
  const [cats, items] = await Promise.all([
    db.query('SELECT category_id, name FROM category ORDER BY sort_order'),
    db.query(`SELECT m.item_id, m.category_id, m.name, m.description, m.price, m.is_veg,
                     m.is_available, m.prep_minutes, s.servings_left
                FROM menu_item m LEFT JOIN v_menu_stock s ON s.item_id = m.item_id
               ORDER BY m.category_id, m.name`),
  ]);
  res.json({ categories: cats.rows, items: items.rows });
}));

router.post('/menu/items', allow(), wrap(async (req, res) => {
  const { category_id, name, description, price, is_veg, prep_minutes } = req.body;
  if (!name || !String(name).trim()) return bad(res, 'Enter a dish name');
  if (!(Number(price) > 0)) return bad(res, 'Price must be greater than 0');
  const { rows } = await db.query(
    `INSERT INTO menu_item (category_id, name, description, price, is_veg, prep_minutes)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING item_id`,
    [int(category_id), String(name).trim(), description || null, Number(price), !!is_veg, int(prep_minutes) || 15]
  );
  res.status(201).json(rows[0]);
}));

router.patch('/menu/items/:id', allow(), wrap(async (req, res) => {
  const editable = ['name', 'description', 'price', 'is_available', 'prep_minutes', 'category_id'];
  const sets = [];
  const values = [];
  for (const field of editable) {
    if (field in req.body) {
      values.push(req.body[field]);
      sets.push(`${field} = $${values.length}`);       // field names come from the allow-list
    }
  }
  if (!sets.length) return bad(res, 'Nothing to update');
  values.push(int(req.params.id));
  const { rows } = await db.query(
    `UPDATE menu_item SET ${sets.join(', ')} WHERE item_id = $${values.length} RETURNING *`, values);
  if (!rows.length) return res.status(404).json({ error: 'Menu item not found' });
  res.json(rows[0]);
}));

// ---------------------------------------------------------------- tables
router.get('/tables', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM v_table_status ORDER BY table_id');
  res.json(rows);
}));

// ---------------------------------------------------------------- orders
router.post('/orders', allow('WAITER'), wrap(async (req, res) => {
  const { order_type, table_id, guests, customer_name, phone, items } = req.body;
  const { rows } = await db.query(
    'SELECT fn_place_order($1, $2, $3, $4, $5, $6, $7::jsonb) AS order_id',
    [req.user.staff_id, order_type, int(table_id), int(guests), customer_name || null,
     phone || null, JSON.stringify(items || [])]
  );
  res.status(201).json(rows[0]);
}));

router.post('/orders/:id/items', allow('WAITER'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT fn_add_items($1, $2::jsonb) AS added',
    [int(req.params.id), JSON.stringify(req.body.items || [])]);
  res.status(201).json(rows[0]);
}));

router.post('/orders/:id/cancel', allow('WAITER'), wrap(async (req, res) => {
  await db.query('SELECT fn_cancel_order($1)', [int(req.params.id)]);
  res.json({ ok: true });
}));

const ORDER_LIST_SQL = `
  SELECT o.order_id, o.order_type, o.status, o.created_at, o.closed_at, o.guests,
         t.table_no, c.full_name AS customer_name, c.phone, s.full_name AS waiter,
         x.items, x.amount, b.bill_id, b.total AS bill_total,
         COALESCE((SELECT SUM(amount) FROM payment p WHERE p.bill_id = b.bill_id), 0) AS paid
    FROM orders o
    JOIN staff s ON s.staff_id = o.waiter_id
    LEFT JOIN dining_table t ON t.table_id = o.table_id
    LEFT JOIN customer c ON c.customer_id = o.customer_id
    LEFT JOIN bill b ON b.order_id = o.order_id
    LEFT JOIN LATERAL (
         SELECT COUNT(*) FILTER (WHERE status <> 'CANCELLED') AS items,
                COALESCE(SUM(quantity * unit_price) FILTER (WHERE status <> 'CANCELLED'), 0) AS amount
           FROM order_item WHERE order_id = o.order_id) x ON true`;

router.get('/orders', wrap(async (req, res) => {
  const scope = req.query.scope || 'open';
  const where = {
    open: "o.status NOT IN ('PAID','CANCELLED')",
    today: "o.created_at >= (date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata')",
    billing: "o.status IN ('SERVED','BILLED')",
    recent: 'true',
  }[scope];
  if (!where) return bad(res, 'Unknown scope');
  const { rows } = await db.query(`${ORDER_LIST_SQL} WHERE ${where} ORDER BY o.created_at DESC LIMIT 150`);
  res.json(rows);
}));

router.get('/orders/:id', wrap(async (req, res) => {
  const id = int(req.params.id);
  const [order, items, bill] = await Promise.all([
    db.query(`${ORDER_LIST_SQL} WHERE o.order_id = $1`, [id]),
    db.query(`SELECT oi.order_item_id, oi.item_id, m.name, m.is_veg, oi.quantity, oi.unit_price,
                     oi.quantity * oi.unit_price AS line_total, oi.notes, oi.status,
                     oi.created_at, oi.started_at, oi.ready_at, oi.served_at
                FROM order_item oi JOIN menu_item m ON m.item_id = oi.item_id
               WHERE oi.order_id = $1 ORDER BY oi.order_item_id`, [id]),
    db.query(`SELECT b.*, COALESCE(json_agg(p ORDER BY p.paid_at) FILTER (WHERE p.payment_id IS NOT NULL), '[]') AS payments
                FROM bill b LEFT JOIN payment p ON p.bill_id = b.bill_id
               WHERE b.order_id = $1 GROUP BY b.bill_id`, [id]),
  ]);
  if (!order.rows.length) return res.status(404).json({ error: 'Order not found' });
  res.json({ ...order.rows[0], lines: items.rows, bill: bill.rows[0] || null });
}));

// Who may move an item to which status
const STATUS_ROLES = {
  PREPARING: ['CHEF'],
  READY: ['CHEF'],
  SERVED: ['WAITER'],
  CANCELLED: ['WAITER'],
};
router.patch('/order-items/:id', wrap(async (req, res) => {
  const { status } = req.body;
  const roles = STATUS_ROLES[status];
  if (!roles) return bad(res, 'Unknown status');
  if (req.user.role !== 'MANAGER' && !roles.includes(req.user.role)) {
    return res.status(403).json({ error: `Only ${roles.join('/')} or MANAGER can mark an item ${status}` });
  }
  const { rows } = await db.query(
    'UPDATE order_item SET status = $1 WHERE order_item_id = $2 RETURNING order_item_id, order_id, status',
    [status, int(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Order item not found' });
  res.json(rows[0]);
}));

// ---------------------------------------------------------------- kitchen
router.get('/kitchen', wrap(async (req, res) => {
  const { rows } = await db.query('SELECT * FROM v_kitchen_queue ORDER BY created_at, order_item_id');
  res.json(rows);
}));

// ---------------------------------------------------------------- billing
router.post('/orders/:id/bill', allow('CASHIER'), wrap(async (req, res) => {
  const { rows } = await db.query('SELECT fn_generate_bill($1, $2, $3) AS bill_id',
    [int(req.params.id), Number(req.body.discount_pct || 0), req.user.staff_id]);
  res.status(201).json(rows[0]);
}));

router.post('/bills/:id/payments', allow('CASHIER'), wrap(async (req, res) => {
  const { amount, mode } = req.body;
  if (!['CASH', 'UPI', 'CARD'].includes(mode)) return bad(res, 'Choose CASH, UPI or CARD');
  const { rows } = await db.query('SELECT fn_record_payment($1, $2, $3, $4) AS balance',
    [int(req.params.id), Number(amount), mode, req.user.staff_id]);
  res.status(201).json(rows[0]);
}));

// ---------------------------------------------------------------- inventory
router.get('/inventory', allow('CHEF'), wrap(async (req, res) => {
  const { rows } = await db.query(
    `SELECT i.ingredient_id, i.name, i.unit, i.stock_qty, i.reorder_level, i.par_qty, i.cost_per_unit,
            i.stock_qty <= i.reorder_level AS low,
            (SELECT COUNT(*) FROM recipe r WHERE r.ingredient_id = i.ingredient_id) AS used_in
       FROM ingredient i
      ORDER BY (i.stock_qty <= i.reorder_level) DESC, i.name`);
  res.json(rows);
}));

router.post('/inventory/:id/restock', allow(), wrap(async (req, res) => {
  const qty = Number(req.body.qty);
  if (!(qty > 0 && qty <= 1000)) return bad(res, 'Quantity must be between 0 and 1000');
  const { rows } = await db.query(
    'UPDATE ingredient SET stock_qty = stock_qty + $1 WHERE ingredient_id = $2 RETURNING *',
    [qty, int(req.params.id)]);
  if (!rows.length) return res.status(404).json({ error: 'Ingredient not found' });
  res.json(rows[0]);
}));

// ---------------------------------------------------------------- reports
router.get('/reports/summary', allow(), wrap(async (req, res) => {
  const days = Math.min(Math.max(int(req.query.days) || 7, 1), 90);
  const since = (await db.query(
    `SELECT (((now() AT TIME ZONE 'Asia/Kolkata')::date - ($1::int - 1))::timestamp
             AT TIME ZONE 'Asia/Kolkata') AS since`, [days])).rows[0].since;
  const p = [since];
  const paid = "o.status = 'PAID' AND o.created_at >= $1";

  const [kpi, live, daily, top, cats, hourly, pay, waiters, kitchen, low] = await Promise.all([
    db.query(`SELECT COUNT(*)::int AS orders, COALESCE(SUM(b.total), 0) AS revenue,
                     COALESCE(ROUND(AVG(b.total), 0), 0) AS avg_order,
                     COALESCE(SUM(o.guests), 0)::int AS guests,
                     COUNT(*) FILTER (WHERE o.order_type = 'TAKEAWAY')::int AS takeaway
                FROM orders o JOIN bill b ON b.order_id = o.order_id WHERE ${paid}`, p),
    db.query(`SELECT (SELECT COUNT(*) FROM orders WHERE status NOT IN ('PAID','CANCELLED'))::int AS open_orders,
                     (SELECT COUNT(*) FROM v_table_status WHERE table_state <> 'FREE')::int AS occupied,
                     (SELECT COUNT(*) FROM dining_table)::int AS tables,
                     (SELECT COUNT(*) FROM v_kitchen_queue WHERE status IN ('PENDING','PREPARING'))::int AS kitchen,
                     (SELECT COUNT(*) FROM ingredient WHERE stock_qty <= reorder_level)::int AS low_stock`),
    db.query(`SELECT to_char(d, 'YYYY-MM-DD') AS day, COALESCE(x.orders, 0)::int AS orders,
                     COALESCE(x.revenue, 0) AS revenue
                FROM generate_series(($1::timestamptz AT TIME ZONE 'Asia/Kolkata')::date,
                                     (now() AT TIME ZONE 'Asia/Kolkata')::date, INTERVAL '1 day') d
                LEFT JOIN (SELECT (o.created_at AT TIME ZONE 'Asia/Kolkata')::date AS day,
                                  COUNT(*) AS orders, SUM(b.total) AS revenue
                             FROM orders o JOIN bill b ON b.order_id = o.order_id
                            WHERE ${paid} GROUP BY 1) x ON x.day = d::date
               ORDER BY d`, p),
    db.query(`SELECT RANK() OVER (ORDER BY SUM(oi.quantity) DESC)::int AS rnk, m.name, m.is_veg,
                     SUM(oi.quantity)::int AS qty, SUM(oi.quantity * oi.unit_price) AS revenue
                FROM order_item oi
                JOIN orders o    ON o.order_id = oi.order_id
                JOIN menu_item m ON m.item_id = oi.item_id
               WHERE ${paid} AND oi.status <> 'CANCELLED'
               GROUP BY m.item_id, m.name, m.is_veg ORDER BY rnk, m.name LIMIT 8`, p),
    db.query(`SELECT c.name, SUM(oi.quantity * oi.unit_price) AS revenue
                FROM order_item oi
                JOIN orders o    ON o.order_id = oi.order_id
                JOIN menu_item m ON m.item_id = oi.item_id
                JOIN category c  ON c.category_id = m.category_id
               WHERE ${paid} AND oi.status <> 'CANCELLED'
               GROUP BY c.category_id, c.name ORDER BY revenue DESC`, p),
    db.query(`SELECT h AS hour, COALESCE(x.orders, 0)::int AS orders
                FROM generate_series(11, 23) h
                LEFT JOIN (SELECT EXTRACT(HOUR FROM o.created_at AT TIME ZONE 'Asia/Kolkata')::int AS hr,
                                  COUNT(*) AS orders
                             FROM orders o WHERE ${paid} GROUP BY 1) x ON x.hr = h
               ORDER BY h`, p),
    db.query(`SELECT pm.mode, COUNT(*)::int AS payments, SUM(pm.amount) AS amount
                FROM payment pm
                JOIN bill b   ON b.bill_id = pm.bill_id
                JOIN orders o ON o.order_id = b.order_id
               WHERE o.created_at >= $1
               GROUP BY pm.mode ORDER BY amount DESC`, p),
    db.query(`SELECT s.full_name AS waiter, COUNT(*)::int AS orders, SUM(b.total) AS revenue,
                     ROUND(AVG(b.total), 0) AS avg_bill
                FROM orders o
                JOIN bill b  ON b.order_id = o.order_id
                JOIN staff s ON s.staff_id = o.waiter_id
               WHERE ${paid}
               GROUP BY s.staff_id, s.full_name ORDER BY revenue DESC`, p),
    db.query(`SELECT m.name, m.prep_minutes AS target,
                     ROUND(AVG(EXTRACT(EPOCH FROM (oi.ready_at - oi.started_at)) / 60)::numeric, 1) AS avg_prep,
                     ROUND(AVG(EXTRACT(EPOCH FROM (oi.served_at - oi.created_at)) / 60)::numeric, 1) AS avg_to_table,
                     COUNT(*)::int AS servings
                FROM order_item oi
                JOIN orders o    ON o.order_id = oi.order_id
                JOIN menu_item m ON m.item_id = oi.item_id
               WHERE o.created_at >= $1 AND oi.served_at IS NOT NULL AND oi.started_at IS NOT NULL
               GROUP BY m.item_id, m.name, m.prep_minutes
               ORDER BY avg_to_table DESC LIMIT 6`, p),
    db.query(`SELECT name, unit, stock_qty, reorder_level FROM ingredient
               WHERE stock_qty <= reorder_level ORDER BY stock_qty / NULLIF(reorder_level, 0)`),
  ]);

  res.json({
    days, since,
    kpi: kpi.rows[0], live: live.rows[0], daily: daily.rows, top_items: top.rows,
    categories: cats.rows, hourly: hourly.rows, payments: pay.rows, waiters: waiters.rows,
    kitchen: kitchen.rows, low_stock: low.rows,
  });
}));

// ---------------------------------------------------------------- admin
router.post('/admin/reset-demo', allow(), wrap(async (req, res) => {
  try {
    const { rows } = await db.query('SELECT fn_seed_demo(30) AS message');
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '42883') {   // function not installed (db/05_reset_demo.sql not applied)
      return res.status(501).json({ error: 'Reset is not enabled on this database. Apply db/05_reset_demo.sql to enable it.' });
    }
    throw err;
  }
}));

module.exports = router;
