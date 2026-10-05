-- =====================================================================
-- Restaurant Order Management System : Business logic
-- Triggers keep stock and order status correct no matter which program
-- changes the data; functions implement the order -> kitchen -> bill ->
-- payment workflow.
-- =====================================================================
SET search_path TO rms;

-- The demo-data generator sets rms.seeding = 'on' so that historical
-- rows can be inserted directly without deducting today's stock.
CREATE FUNCTION is_seeding() RETURNS BOOLEAN
LANGUAGE sql STABLE AS $$
    SELECT COALESCE(current_setting('rms.seeding', true), 'off') = 'on';
$$;

-- ---------------------------------------------------------------------
-- Derive the order status from the status of its items
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_refresh_order_status(p_order INT) RETURNS VOID
LANGUAGE plpgsql AS $$
DECLARE
    v_status  VARCHAR;
    v_live    INT;
    v_served  INT;
    v_ready   INT;
    v_started INT;
    v_new     VARCHAR;
BEGIN
    SELECT status INTO v_status FROM orders WHERE order_id = p_order FOR UPDATE;
    IF v_status IN ('BILLED','PAID','CANCELLED') THEN
        RETURN;
    END IF;

    SELECT COUNT(*) FILTER (WHERE status <> 'CANCELLED'),
           COUNT(*) FILTER (WHERE status = 'SERVED'),
           COUNT(*) FILTER (WHERE status IN ('READY','SERVED')),
           COUNT(*) FILTER (WHERE status IN ('PREPARING','READY','SERVED'))
      INTO v_live, v_served, v_ready, v_started
      FROM order_item WHERE order_id = p_order;

    v_new := CASE WHEN v_live = 0       THEN 'CANCELLED'
                  WHEN v_served = v_live THEN 'SERVED'
                  WHEN v_ready = v_live  THEN 'READY'
                  WHEN v_started > 0     THEN 'PREPARING'
                  ELSE 'PLACED' END;

    UPDATE orders
       SET status = v_new,
           closed_at = CASE WHEN v_new = 'CANCELLED' THEN now() END
     WHERE order_id = p_order AND status <> v_new;
END $$;

-- ---------------------------------------------------------------------
-- BEFORE INSERT/UPDATE on order_item: the order must be open and an
-- item may only move  PENDING -> PREPARING -> READY -> SERVED
-- (or PENDING -> CANCELLED before the kitchen starts).
-- ---------------------------------------------------------------------
CREATE FUNCTION trg_order_item_rules() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_order_status VARCHAR;
BEGIN
    IF is_seeding() THEN
        RETURN NEW;
    END IF;

    SELECT status INTO v_order_status FROM orders WHERE order_id = NEW.order_id;
    IF v_order_status IN ('BILLED','PAID','CANCELLED') THEN
        RAISE EXCEPTION 'Order % is % and can no longer be changed',
                        NEW.order_id, v_order_status;
    END IF;

    IF TG_OP = 'INSERT' THEN
        NEW.status := 'PENDING';
        RETURN NEW;
    END IF;

    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;
    IF NOT ((OLD.status = 'PENDING'   AND NEW.status IN ('PREPARING','READY','CANCELLED'))
         OR (OLD.status = 'PREPARING' AND NEW.status = 'READY')
         OR (OLD.status = 'READY'     AND NEW.status = 'SERVED')) THEN
        RAISE EXCEPTION 'Item cannot move from % to %', OLD.status, NEW.status;
    END IF;

    IF NEW.status IN ('PREPARING','READY') AND NEW.started_at IS NULL THEN
        NEW.started_at := now();
    END IF;
    IF NEW.status = 'READY'  THEN NEW.ready_at  := now(); END IF;
    IF NEW.status = 'SERVED' THEN NEW.served_at := now(); END IF;
    RETURN NEW;
END $$;

CREATE TRIGGER order_item_rules
    BEFORE INSERT OR UPDATE OF status ON order_item
    FOR EACH ROW EXECUTE FUNCTION trg_order_item_rules();

-- ---------------------------------------------------------------------
-- AFTER INSERT/UPDATE on order_item: deduct (or give back) ingredient
-- stock and refresh the order status.
-- The CHECK (stock_qty >= 0) constraint is the final guarantee: even two
-- simultaneous orders can never take stock below zero.
-- ---------------------------------------------------------------------
CREATE FUNCTION trg_order_item_effects() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
DECLARE
    v_short RECORD;
BEGIN
    IF is_seeding() THEN
        RETURN NULL;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- lock the ingredient rows in a fixed order (prevents deadlocks)
        PERFORM 1 FROM ingredient
         WHERE ingredient_id IN (SELECT ingredient_id FROM recipe WHERE item_id = NEW.item_id)
         ORDER BY ingredient_id
           FOR UPDATE;

        SELECT m.name AS dish, i.name AS ingredient, i.unit, i.stock_qty,
               r.qty_per_serving * NEW.quantity AS needed
          INTO v_short
          FROM recipe r
          JOIN ingredient i ON i.ingredient_id = r.ingredient_id
          JOIN menu_item  m ON m.item_id = r.item_id
         WHERE r.item_id = NEW.item_id
           AND i.stock_qty < r.qty_per_serving * NEW.quantity
         LIMIT 1;
        IF FOUND THEN
            RAISE EXCEPTION 'Not enough % for % x % (need % %, only % % left)',
                v_short.ingredient, NEW.quantity, v_short.dish,
                v_short.needed, v_short.unit, v_short.stock_qty, v_short.unit;
        END IF;

        UPDATE ingredient i
           SET stock_qty = i.stock_qty - r.qty_per_serving * NEW.quantity
          FROM recipe r
         WHERE r.item_id = NEW.item_id AND r.ingredient_id = i.ingredient_id;

    ELSIF NEW.status = 'CANCELLED' AND OLD.status = 'PENDING' THEN
        UPDATE ingredient i
           SET stock_qty = i.stock_qty + r.qty_per_serving * NEW.quantity
          FROM recipe r
         WHERE r.item_id = NEW.item_id AND r.ingredient_id = i.ingredient_id;
    END IF;

    PERFORM fn_refresh_order_status(NEW.order_id);
    RETURN NULL;
END $$;

CREATE TRIGGER order_item_effects
    AFTER INSERT OR UPDATE OF status ON order_item
    FOR EACH ROW EXECUTE FUNCTION trg_order_item_effects();

-- ---------------------------------------------------------------------
-- Add items (JSON array [{item_id, qty, notes}]) to an open order
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_add_items(p_order INT, p_items JSONB) RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR;
    v_el     JSONB;
    v_item   menu_item%ROWTYPE;
    v_qty    INT;
    v_count  INT := 0;
BEGIN
    IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array'
       OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Add at least one item';
    END IF;

    SELECT status INTO v_status FROM orders WHERE order_id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order;
    END IF;
    IF v_status IN ('BILLED','PAID','CANCELLED') THEN
        RAISE EXCEPTION 'Order % is % and can no longer be changed', p_order, v_status;
    END IF;

    FOR v_el IN SELECT value FROM jsonb_array_elements(p_items) LOOP
        v_qty := COALESCE((v_el ->> 'qty')::INT, 1);
        IF v_qty NOT BETWEEN 1 AND 50 THEN
            RAISE EXCEPTION 'Quantity must be between 1 and 50';
        END IF;

        SELECT * INTO v_item FROM menu_item WHERE item_id = (v_el ->> 'item_id')::INT;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Menu item % does not exist', v_el ->> 'item_id';
        END IF;
        IF NOT v_item.is_available THEN
            RAISE EXCEPTION '% is not available right now', v_item.name;
        END IF;

        INSERT INTO order_item (order_id, item_id, quantity, unit_price, notes)
        VALUES (p_order, v_item.item_id, v_qty, v_item.price,
                NULLIF(trim(v_el ->> 'notes'), ''));
        v_count := v_count + 1;
    END LOOP;
    RETURN v_count;
END $$;

-- ---------------------------------------------------------------------
-- Place a new dine-in or takeaway order
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_place_order(p_waiter INT, p_type VARCHAR, p_table INT,
                               p_guests INT, p_customer_name VARCHAR,
                               p_phone VARCHAR, p_items JSONB)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_capacity INT;
    v_customer INT;
    v_order    INT;
BEGIN
    IF p_type = 'DINE_IN' THEN
        -- serialise concurrent orders for the same table (the partial unique
        -- index uq_open_order_per_table is the final guarantee)
        PERFORM pg_advisory_xact_lock(hashtext('rms.table'), COALESCE(p_table, 0));
        SELECT capacity INTO v_capacity FROM dining_table WHERE table_id = p_table;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Choose a valid table';
        END IF;
        IF EXISTS (SELECT 1 FROM orders WHERE table_id = p_table
                      AND status NOT IN ('PAID','CANCELLED')) THEN
            RAISE EXCEPTION 'This table already has an open order';
        END IF;
        IF p_guests IS NULL OR p_guests < 1 OR p_guests > v_capacity THEN
            RAISE EXCEPTION 'This table seats 1 to % guests', v_capacity;
        END IF;
    ELSIF p_type = 'TAKEAWAY' THEN
        p_table := NULL;
        p_guests := NULL;
        IF NULLIF(trim(p_phone), '') IS NOT NULL THEN
            INSERT INTO customer (full_name, phone)
            VALUES (COALESCE(NULLIF(trim(p_customer_name), ''), 'Guest'), trim(p_phone))
            ON CONFLICT (phone) DO UPDATE
               SET full_name = CASE WHEN EXCLUDED.full_name = 'Guest'
                                    THEN customer.full_name ELSE EXCLUDED.full_name END
            RETURNING customer_id INTO v_customer;
        END IF;
    ELSE
        RAISE EXCEPTION 'Order type must be DINE_IN or TAKEAWAY';
    END IF;

    INSERT INTO orders (order_type, table_id, customer_id, waiter_id, guests)
    VALUES (p_type, p_table, v_customer, p_waiter, p_guests)
    RETURNING order_id INTO v_order;

    PERFORM fn_add_items(v_order, p_items);
    RETURN v_order;
END $$;

-- ---------------------------------------------------------------------
-- Cancel every item of an order that the kitchen has not started
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_cancel_order(p_order INT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM orders WHERE order_id = p_order FOR UPDATE;
    IF EXISTS (SELECT 1 FROM order_item WHERE order_id = p_order
                 AND status NOT IN ('PENDING','CANCELLED')) THEN
        RAISE EXCEPTION 'The kitchen has already started this order; cancel pending items individually';
    END IF;
    UPDATE order_item SET status = 'CANCELLED'
     WHERE order_id = p_order AND status = 'PENDING';
END $$;

-- ---------------------------------------------------------------------
-- Generate the bill:  GST 5% on restaurant service = CGST 2.5% + SGST 2.5%
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_generate_bill(p_order INT, p_discount_pct NUMERIC, p_staff INT)
RETURNS INT
LANGUAGE plpgsql AS $$
DECLARE
    v_status  VARCHAR;
    v_sub     NUMERIC;
    v_disc    NUMERIC;
    v_taxable NUMERIC;
    v_gst     NUMERIC;
    v_exact   NUMERIC;
    v_total   NUMERIC;
    v_bill    INT;
BEGIN
    SELECT status INTO v_status FROM orders WHERE order_id = p_order FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Order % does not exist', p_order;
    END IF;
    IF v_status <> 'SERVED' THEN
        RAISE EXCEPTION 'A bill can be generated only after every item is served (order is %)', v_status;
    END IF;
    IF COALESCE(p_discount_pct, 0) NOT BETWEEN 0 AND 50 THEN
        RAISE EXCEPTION 'Discount must be between 0 and 50 percent';
    END IF;

    SELECT COALESCE(SUM(quantity * unit_price), 0) INTO v_sub
      FROM order_item WHERE order_id = p_order AND status <> 'CANCELLED';

    v_disc    := round(v_sub * COALESCE(p_discount_pct, 0) / 100, 2);
    v_taxable := v_sub - v_disc;
    v_gst     := round(v_taxable * 0.025, 2);
    v_exact   := v_taxable + 2 * v_gst;
    v_total   := round(v_exact);                       -- round to the rupee

    INSERT INTO bill (order_id, subtotal, discount_pct, discount, cgst, sgst,
                      round_off, total, created_by)
    VALUES (p_order, v_sub, COALESCE(p_discount_pct, 0), v_disc, v_gst, v_gst,
            v_total - v_exact, v_total, p_staff)
    RETURNING bill_id INTO v_bill;

    UPDATE orders SET status = 'BILLED' WHERE order_id = p_order;
    RETURN v_bill;
END $$;

-- ---------------------------------------------------------------------
-- Record a (part-)payment; when the bill is fully paid the order closes
-- and its table becomes free.  Returns the remaining balance.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_record_payment(p_bill INT, p_amount NUMERIC, p_mode VARCHAR, p_staff INT)
RETURNS NUMERIC
LANGUAGE plpgsql AS $$
DECLARE
    v_order   INT;
    v_total   NUMERIC;
    v_status  VARCHAR;
    v_balance NUMERIC;
BEGIN
    SELECT b.order_id, b.total, o.status INTO v_order, v_total, v_status
      FROM bill b JOIN orders o ON o.order_id = b.order_id
     WHERE b.bill_id = p_bill
       FOR UPDATE OF o;                     -- one payment at a time per order
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Bill % does not exist', p_bill;
    END IF;
    IF v_status = 'PAID' THEN
        RAISE EXCEPTION 'This bill is already settled';
    END IF;

    SELECT v_total - COALESCE(SUM(amount), 0) INTO v_balance
      FROM payment WHERE bill_id = p_bill;
    IF p_amount IS NULL OR p_amount <= 0 OR p_amount > v_balance THEN
        RAISE EXCEPTION 'Amount must be between 0.01 and %', v_balance;
    END IF;

    INSERT INTO payment (bill_id, amount, mode, received_by)
    VALUES (p_bill, p_amount, p_mode, p_staff);

    v_balance := v_balance - p_amount;
    IF v_balance = 0 THEN
        UPDATE orders SET status = 'PAID', closed_at = now() WHERE order_id = v_order;
    END IF;
    RETURN v_balance;
END $$;

-- ---------------------------------------------------------------------
-- Views
-- ---------------------------------------------------------------------
-- Table status is DERIVED from open orders, never stored, so it can
-- never disagree with the orders table.
CREATE VIEW v_table_status AS
SELECT t.table_id, t.table_no, t.capacity, t.area,
       o.order_id, o.status AS order_status, o.guests, o.created_at AS seated_at,
       s.full_name AS waiter,
       CASE WHEN o.order_id IS NULL   THEN 'FREE'
            WHEN o.status = 'BILLED'  THEN 'BILLING'
            WHEN o.status = 'READY'   THEN 'FOOD_READY'
            ELSE 'OCCUPIED' END AS table_state,
       COALESCE(x.amount, 0) AS running_total
FROM dining_table t
LEFT JOIN orders o ON o.table_id = t.table_id AND o.status NOT IN ('PAID','CANCELLED')
LEFT JOIN staff  s ON s.staff_id = o.waiter_id
LEFT JOIN LATERAL (SELECT SUM(quantity * unit_price) AS amount
                     FROM order_item
                    WHERE order_id = o.order_id AND status <> 'CANCELLED') x ON true;

CREATE VIEW v_kitchen_queue AS
SELECT oi.order_item_id, oi.order_id, o.order_type, t.table_no,
       m.name AS item_name, m.is_veg, m.prep_minutes,
       oi.quantity, oi.notes, oi.status, oi.created_at, oi.started_at,
       round(EXTRACT(EPOCH FROM (now() - oi.created_at)) / 60)::INT AS waiting_min
FROM order_item oi
JOIN orders    o ON o.order_id = oi.order_id
JOIN menu_item m ON m.item_id  = oi.item_id
LEFT JOIN dining_table t ON t.table_id = o.table_id
WHERE oi.status IN ('PENDING','PREPARING','READY')
  AND o.status NOT IN ('BILLED','PAID','CANCELLED');

-- How many more plates of each dish the current stock allows
CREATE VIEW v_menu_stock AS
SELECT r.item_id,
       FLOOR(MIN(i.stock_qty / r.qty_per_serving))::INT AS servings_left
FROM recipe r
JOIN ingredient i ON i.ingredient_id = r.ingredient_id
GROUP BY r.item_id;

-- Pin the search_path of every function (protects against search_path
-- hijacking and keeps the functions working for any caller)
ALTER FUNCTION is_seeding()                                   SET search_path = rms, pg_catalog;
ALTER FUNCTION fn_refresh_order_status(INT)                   SET search_path = rms, pg_catalog;
ALTER FUNCTION trg_order_item_rules()                         SET search_path = rms, pg_catalog;
ALTER FUNCTION trg_order_item_effects()                       SET search_path = rms, pg_catalog;
ALTER FUNCTION fn_add_items(INT, JSONB)                       SET search_path = rms, pg_catalog;
ALTER FUNCTION fn_place_order(INT, VARCHAR, INT, INT, VARCHAR, VARCHAR, JSONB) SET search_path = rms, pg_catalog;
ALTER FUNCTION fn_cancel_order(INT)                           SET search_path = rms, pg_catalog;
ALTER FUNCTION fn_generate_bill(INT, NUMERIC, INT)            SET search_path = rms, pg_catalog;
ALTER FUNCTION fn_record_payment(INT, NUMERIC, VARCHAR, INT)  SET search_path = rms, pg_catalog;
