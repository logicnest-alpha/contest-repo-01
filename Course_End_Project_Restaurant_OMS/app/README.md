# Restaurant Order Management System (RMS)

Full-stack web application: **PostgreSQL** (business rules in PL/pgSQL triggers and
functions) + **Node.js / Express** REST API + plain **HTML/CSS/JavaScript** frontend.

| Role | Login | Screens |
|------|-------|---------|
| Manager | `manager` / `manager123` | everything + dashboard, menu, inventory |
| Waiter | `waiter` / `waiter123` (also `waiter2`) | tables, take orders, serve dishes |
| Kitchen | `chef` / `chef123` | kitchen display, inventory |
| Cashier | `cashier` / `cashier123` | billing (GST), payments, receipts |

## Structure

```
db/01_schema.sql        10 tables, constraints, partial unique index (one open order per table)
db/02_logic.sql         triggers (stock deduction, item status rules, derived order status),
                        fn_place_order, fn_add_items, fn_cancel_order, fn_generate_bill,
                        fn_record_payment, views v_table_status / v_kitchen_queue / v_menu_stock
db/03_seed.sql          staff, tables, menu (24 dishes), 26 ingredients, recipes,
                        fn_generate_demo (30 days of history + a live service)
db/04_grants.sql        least-privilege role rms_app used by the web server
db/05_reset_demo.sql    optional "Reset demo data" (TRUNCATE + regenerate)
scripts/init-db.js      runs the SQL files and creates rms_app
server.js, src/         Express API (JWT login, role checks, parameterised SQL)
public/                 single-page frontend (no build step), Chart.js bundled
```

## Run locally

```bash
npm install
createdb rms
ADMIN_DATABASE_URL=postgres://postgres:<pw>@localhost/rms APP_DB_PASSWORD=<choose> npm run db:init
DATABASE_URL=postgres://rms_app:<choose>@localhost/rms JWT_SECRET=<random> npm start
# open http://localhost:3000
```

## Environment variables

| Variable | Meaning |
|----------|---------|
| `DATABASE_URL` | connection string for `rms_app` (several comma-separated candidates allowed) |
| `JWT_SECRET` | secret used to sign login tokens |
| `PORT` | HTTP port (default 3000) |
| `DATABASE_SSL` | `true` to force TLS (automatic for Supabase hosts) |
