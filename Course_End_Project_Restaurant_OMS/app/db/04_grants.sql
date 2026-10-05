-- =====================================================================
-- Restaurant Order Management System : least-privilege application role
-- The web application connects as rms_app, never as the schema owner.
-- (The role itself is created by scripts/init-db.js with a password
--  taken from the environment, so no password is stored in Git.)
-- =====================================================================
SET search_path TO rms;

REVOKE ALL ON SCHEMA rms FROM PUBLIC;
GRANT USAGE ON SCHEMA rms TO rms_app;

GRANT SELECT ON ALL TABLES IN SCHEMA rms TO rms_app;              -- tables and views
GRANT INSERT, UPDATE ON orders, order_item, customer TO rms_app;
GRANT INSERT ON bill, payment TO rms_app;                           -- bills are never edited
GRANT UPDATE (name, description, price, is_available, prep_minutes, category_id)
      ON menu_item TO rms_app;
GRANT INSERT ON menu_item TO rms_app;
GRANT UPDATE (stock_qty, reorder_level) ON ingredient TO rms_app;
GRANT USAGE ON ALL SEQUENCES IN SCHEMA rms TO rms_app;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA rms TO rms_app;
-- deliberately NOT granted: DELETE, TRUNCATE, UPDATE of bills/payments, any change to staff

ALTER ROLE rms_app SET search_path = rms, public;
ALTER ROLE rms_app SET timezone = 'Asia/Kolkata';
ALTER ROLE rms_app SET statement_timeout = '15s';
