-- =====================================================================
-- Restaurant Order Management System : Reference data + demo generator
-- All people, phone numbers and orders are synthetic.
-- Demo logins: manager / manager123, waiter / waiter123, waiter2 / waiter123,
--              chef / chef123, cashier / cashier123
-- =====================================================================
SET search_path TO rms;

INSERT INTO staff (full_name, username, password_hash, role) VALUES
  ('Anil Kumar',   'manager', '$2a$10$.BkcDd5bdkqHEw7PeXYbBO.NaXpj.zV5KZCXrny5nE.k.KHHd2OB.', 'MANAGER'),
  ('Ravi Teja',    'waiter',  '$2a$10$wKAKBzAVkwCzA/sQmMYmF.oNZzhr1hZMdIo5hxoyb4ba/54EZ4wHu', 'WAITER'),
  ('Sana Fatima',  'waiter2', '$2a$10$wKAKBzAVkwCzA/sQmMYmF.oNZzhr1hZMdIo5hxoyb4ba/54EZ4wHu', 'WAITER'),
  ('Chef Raju',    'chef',    '$2a$10$5R8TS9kcL.PhJJNJAQykrOdzKaAiU41oTbz9wHXS1e/Rw60wPKgHS', 'CHEF'),
  ('Lakshmi Devi', 'cashier', '$2a$10$dB86uXJldbs8dZ5dZsVYmexQLXWf1FiIJAdIVNB3qOk6zkTncyMvm', 'CASHIER');

INSERT INTO dining_table (table_no, capacity, area) VALUES
  ('T1', 4, 'Main Hall'), ('T2', 4, 'Main Hall'), ('T3', 4, 'Main Hall'),
  ('T4', 4, 'Main Hall'), ('T5', 2, 'Main Hall'), ('T6', 2, 'Main Hall'),
  ('T7', 6, 'Family Section'), ('T8', 6, 'Family Section'),
  ('T9', 6, 'Family Section'), ('T10', 8, 'Family Section'),
  ('T11', 4, 'Rooftop'), ('T12', 4, 'Rooftop');

INSERT INTO category (name, sort_order) VALUES
  ('Starters', 1), ('Biryani', 2), ('Main Course', 3),
  ('Breads', 4), ('Beverages', 5), ('Desserts', 6);

INSERT INTO menu_item (category_id, name, description, price, is_veg, prep_minutes) VALUES
  (1, 'Paneer Tikka',                   'Cottage cheese marinated in spiced yoghurt, grilled in the tandoor', 260, true, 15),
  (1, 'Chicken 65',                     'Hyderabad-style spicy fried chicken with curry leaves',             280, false, 15),
  (1, 'Apollo Fish',                    'Boneless fish tossed in a tangy green-chilli sauce',                340, false, 18),
  (1, 'Veg Manchurian',                 'Vegetable dumplings in a soy-garlic sauce',                         220, true, 12),
  (1, 'Crispy Corn',                    'Golden fried sweet corn with pepper and spring onion',              200, true, 10),
  (2, 'Hyderabadi Chicken Dum Biryani', 'Basmati rice and chicken slow-cooked on dum',                       320, false, 25),
  (2, 'Mutton Dum Biryani',             'Tender mutton layered with saffron rice',                           420, false, 30),
  (2, 'Veg Dum Biryani',                'Seasonal vegetables and basmati rice on dum',                       240, true, 20),
  (2, 'Egg Biryani',                    'Boiled eggs in masala with fragrant rice',                          260, false, 20),
  (3, 'Butter Chicken',                 'Tandoori chicken in a creamy tomato-butter gravy',                  340, false, 20),
  (3, 'Paneer Butter Masala',           'Paneer cubes in a rich tomato-cashew gravy',                        290, true, 18),
  (3, 'Dal Tadka',                      'Yellow lentils tempered with ghee, cumin and garlic',               200, true, 12),
  (3, 'Kadai Vegetable',                'Mixed vegetables cooked with kadai masala',                         240, true, 15),
  (4, 'Butter Naan',                    'Leavened bread brushed with butter',                                 60, true, 6),
  (4, 'Garlic Naan',                    'Naan topped with garlic and coriander',                              70, true, 6),
  (4, 'Tandoori Roti',                  'Whole-wheat bread from the tandoor',                                 35, true, 5),
  (5, 'Irani Chai',                     'Hyderabad''s famous slow-brewed milky tea',                          40, true, 5),
  (5, 'Sweet Lassi',                    'Chilled sweetened yoghurt drink',                                    90, true, 5),
  (5, 'Fresh Lime Soda',                'Sweet or salted lime soda',                                          80, true, 4),
  (5, 'Cold Coffee',                    'Blended coffee with ice cream',                                     130, true, 6),
  (6, 'Double ka Meetha',               'Hyderabadi bread pudding with saffron and dry fruits',              120, true, 8),
  (6, 'Gulab Jamun',                    'Soft milk dumplings in sugar syrup (2 pcs)',                        100, true, 5),
  (6, 'Qubani ka Meetha',               'Stewed apricot dessert served with cream',                          150, true, 8),
  (6, 'Ice Cream Sundae',               'Vanilla ice cream with chocolate sauce and nuts',                   140, true, 5);

INSERT INTO ingredient (name, unit, par_qty, stock_qty, reorder_level, cost_per_unit) VALUES
  ('Basmati Rice',     'kg',  40,  40,  10, 110),   -- 1
  ('Chicken',          'kg',  30,  30,   8, 240),   -- 2
  ('Mutton',           'kg', 4.5, 4.5,   4, 650),   -- 3
  ('Fish',             'kg', 3.2, 3.2,   3, 400),   -- 4
  ('Paneer',           'kg',  10,  10,   3, 380),   -- 5
  ('Mixed Vegetables', 'kg',  20,  20,   5,  60),   -- 6
  ('Sweet Corn',       'kg',   6,   6,   2, 120),   -- 7
  ('Toor Dal',         'kg',  10,  10,   3, 140),   -- 8
  ('Onion',            'kg',  25,  25,   6,  35),   -- 9
  ('Tomato',           'kg',  20,  20,   5,  30),   -- 10
  ('Maida',            'kg',  25,  25,   6,  45),   -- 11
  ('Wheat Flour',      'kg',  20,  20,   5,  40),   -- 12
  ('Cooking Oil',      'l',   30,  30,   8, 150),   -- 13
  ('Butter',           'kg',   6,   6,   2, 520),   -- 14
  ('Fresh Cream',      'l',    6,   6,   2, 260),   -- 15
  ('Curd',             'kg',  15,  15,   4,  70),   -- 16
  ('Milk',             'l',   25,  25,   6,  60),   -- 17
  ('Sugar',            'kg',  15,  15,   4,  45),   -- 18
  ('Spice Mix',        'kg',   5,   5,   1, 600),   -- 19
  ('Tea Leaves',       'kg',   2,   2, 0.5, 500),   -- 20
  ('Coffee Powder',    'kg', 1.5, 1.5, 0.4, 900),   -- 21
  ('Ice Cream',        'l',    8,   8,   2, 300),   -- 22
  ('Lemon',            'pcs', 120, 120, 30,   4),   -- 23
  ('Eggs',             'pcs',  90,  90, 30,   7),   -- 24
  ('Dried Apricot',    'kg',   2,   2, 0.5, 700),   -- 25
  ('Bread',            'kg',   3,   3,   1,  80);   -- 26

-- quantity of each ingredient used for ONE serving
INSERT INTO recipe (item_id, ingredient_id, qty_per_serving) VALUES
  (1,5,0.2),(1,16,0.05),(1,19,0.01),(1,13,0.02),
  (2,2,0.25),(2,13,0.05),(2,19,0.015),(2,16,0.03),
  (3,4,0.25),(3,13,0.05),(3,19,0.015),(3,11,0.03),
  (4,6,0.2),(4,11,0.05),(4,13,0.05),
  (5,7,0.15),(5,11,0.04),(5,13,0.04),
  (6,1,0.18),(6,2,0.25),(6,9,0.08),(6,16,0.05),(6,19,0.015),(6,13,0.03),
  (7,1,0.18),(7,3,0.25),(7,9,0.08),(7,16,0.05),(7,19,0.015),(7,13,0.03),
  (8,1,0.18),(8,6,0.15),(8,9,0.06),(8,19,0.012),(8,13,0.03),
  (9,1,0.18),(9,24,2),(9,9,0.06),(9,19,0.012),(9,13,0.03),
  (10,2,0.25),(10,14,0.04),(10,15,0.05),(10,10,0.15),(10,19,0.01),
  (11,5,0.2),(11,14,0.04),(11,15,0.05),(11,10,0.15),(11,19,0.01),
  (12,8,0.1),(12,9,0.05),(12,10,0.05),(12,13,0.02),(12,19,0.005),
  (13,6,0.25),(13,9,0.06),(13,10,0.08),(13,13,0.03),(13,19,0.01),
  (14,11,0.1),(14,14,0.01),
  (15,11,0.1),(15,14,0.012),(15,19,0.002),
  (16,12,0.08),
  (17,17,0.12),(17,20,0.005),(17,18,0.015),
  (18,16,0.2),(18,18,0.03),
  (19,23,1),(19,18,0.02),
  (20,17,0.2),(20,21,0.01),(20,18,0.02),(20,22,0.05),
  (21,26,0.08),(21,17,0.1),(21,18,0.04),(21,14,0.01),
  (22,17,0.05),(22,18,0.05),(22,13,0.02),(22,11,0.02),
  (23,25,0.06),(23,18,0.04),(23,15,0.03),
  (24,22,0.15),(24,18,0.01);

-- ---------------------------------------------------------------------
-- Helper for the generator: [["Dish name", qty], ...] -> [{item_id, qty}]
-- ---------------------------------------------------------------------
CREATE FUNCTION seed_items(p JSONB) RETURNS JSONB
LANGUAGE sql STABLE AS $$
    SELECT jsonb_agg(jsonb_build_object('item_id', m.item_id, 'qty', (e ->> 1)::INT))
    FROM jsonb_array_elements(p) AS e
    JOIN rms.menu_item m ON m.name = e ->> 0;
$$;
ALTER FUNCTION seed_items(JSONB) SET search_path = rms, pg_catalog;

-- ---------------------------------------------------------------------
-- Generate realistic demo data relative to NOW (into empty order tables):
--   * p_days days of paid order history (lunch and dinner peaks,
--     busier weekends, popular dishes ordered more often)
--   * a live service: occupied tables, kitchen queue, a bill pending
-- To wipe and regenerate later, use fn_seed_demo() from 05_reset_demo.sql.
-- ---------------------------------------------------------------------
CREATE FUNCTION fn_generate_demo(p_days INT DEFAULT 30) RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = rms, pg_catalog AS $$
DECLARE
    v_weighted INT[];
    v_waiters  INT[];
    v_cashier  INT;
    v_bread    INT;
    v_today    DATE := (now() AT TIME ZONE 'Asia/Kolkata')::DATE;
    v_day      DATE;
    v_n        INT;
    v_lines    INT;
    v_hist     INT := 0;
    u          FLOAT;
    h          FLOAT;
    v_ts       TIMESTAMPTZ;
    v_close    TIMESTAMPTZ;
    v_start    TIMESTAMPTZ;
    v_ready    TIMESTAMPTZ;
    v_type     VARCHAR;
    v_table    INT;
    v_cap      INT;
    v_guests   INT;
    v_cust     INT;
    v_order    INT;
    v_item     INT;
    v_qty      INT;
    v_cat      INT;
    v_price    NUMERIC;
    v_prep     INT;
    v_sub      NUMERIC;
    v_dpct     NUMERIC;
    v_disc     NUMERIC;
    v_gst      NUMERIC;
    v_exact    NUMERIC;
    v_total    NUMERIC;
    v_bill     INT;
    o1 INT; o2 INT; o3 INT; o4 INT; o5 INT;
BEGIN
    IF EXISTS (SELECT 1 FROM orders) OR EXISTS (SELECT 1 FROM customer) THEN
        RAISE EXCEPTION 'Order tables are not empty; use fn_seed_demo() to reset';
    END IF;
    PERFORM set_config('rms.seeding', 'on', true);
    PERFORM setseed(0.2026);

    INSERT INTO customer (full_name, phone)
    SELECT n, '98480' || lpad(i::TEXT, 5, '0')
    FROM unnest(ARRAY['Rahul Sharma','Priya Reddy','Arjun Rao','Fatima Begum','Kiran Goud',
                      'Sneha Varma','Mohammed Ali','Divya Nair','Suresh Babu','Anjali Gupta',
                      'Vamshi Krishna','Harika Reddy','Imran Khan','Pooja Jain','Naveen Kumar',
                      'Swathi Rao','Abdul Rahman','Keerthi Shetty','Sai Charan','Meghana Das'])
         WITH ORDINALITY AS c(n, i);

    SELECT array_agg(m.item_id) INTO v_weighted
    FROM (VALUES ('Hyderabadi Chicken Dum Biryani',14),('Butter Naan',10),('Irani Chai',9),
                 ('Butter Chicken',7),('Chicken 65',7),('Paneer Butter Masala',6),('Paneer Tikka',6),
                 ('Mutton Dum Biryani',5),('Veg Dum Biryani',5),('Tandoori Roti',5),('Sweet Lassi',5),
                 ('Double ka Meetha',4),('Dal Tadka',4),('Garlic Naan',4),('Cold Coffee',4),
                 ('Fresh Lime Soda',4),('Apollo Fish',3),('Veg Manchurian',3),('Gulab Jamun',3),
                 ('Egg Biryani',3),('Kadai Vegetable',3),('Crispy Corn',2),('Ice Cream Sundae',2),
                 ('Qubani ka Meetha',2)) AS w(name, weight)
    JOIN menu_item m ON m.name = w.name
    CROSS JOIN LATERAL generate_series(1, w.weight);

    SELECT array_agg(staff_id ORDER BY staff_id) INTO v_waiters FROM staff WHERE role = 'WAITER';
    SELECT staff_id INTO v_cashier FROM staff WHERE role = 'CASHIER' ORDER BY staff_id LIMIT 1;
    SELECT category_id INTO v_bread FROM category WHERE name = 'Breads';

    -- ---------------- order history ----------------
    FOR d IN REVERSE p_days..0 LOOP
        v_day := v_today - d;
        v_n := 24 + floor(random() * 10)::INT
             + CASE WHEN extract(isodow FROM v_day) >= 5 THEN 12 ELSE 0 END;

        FOR k IN 1..v_n LOOP
            u := random();
            IF u < 0.42 THEN      h := 13.25 + (random() + random() + random() - 1.5) * 1.3;
            ELSIF u < 0.88 THEN   h := 20.50 + (random() + random() + random() - 1.5) * 1.5;
            ELSE                  h := 11 + random() * 11.5;
            END IF;
            h := LEAST(GREATEST(h, 11.0), 22.75);
            v_ts := (v_day + make_interval(secs => h * 3600)) AT TIME ZONE 'Asia/Kolkata';
            CONTINUE WHEN v_ts > now() - INTERVAL '90 minutes';

            IF random() < 0.8 THEN
                v_type := 'DINE_IN';
                SELECT table_id, capacity INTO v_table, v_cap
                  FROM dining_table ORDER BY random() LIMIT 1;
                v_guests := 1 + floor(random() * v_cap)::INT;
                v_cust := NULL;
            ELSE
                v_type := 'TAKEAWAY';
                v_table := NULL;
                v_guests := NULL;
                v_cust := CASE WHEN random() < 0.7 THEN 1 + floor(random() * 20)::INT END;
            END IF;
            v_close := v_ts + make_interval(mins => 40 + floor(random() * 50)::INT);

            INSERT INTO orders (order_type, table_id, customer_id, waiter_id, guests,
                                status, created_at, closed_at)
            VALUES (v_type, v_table, v_cust,
                    v_waiters[1 + floor(random() * array_length(v_waiters, 1))::INT],
                    v_guests, 'PAID', v_ts, v_close)
            RETURNING order_id INTO v_order;

            v_lines := 1 + floor(random() * 3)::INT + COALESCE(v_guests / 3, 0);
            FOR j IN 1..v_lines LOOP
                v_item := v_weighted[1 + floor(random() * array_length(v_weighted, 1))::INT];
                SELECT price, prep_minutes, category_id INTO v_price, v_prep, v_cat
                  FROM menu_item WHERE item_id = v_item;
                v_qty := CASE WHEN v_cat = v_bread THEN 2 + floor(random() * 3)::INT
                              ELSE 1 + floor(random() * 2)::INT END;
                v_start := v_ts + make_interval(mins => 1 + floor(random() * 5)::INT);
                v_ready := v_start + make_interval(mins => GREATEST(v_prep - 3 + floor(random() * 8)::INT, 2));
                INSERT INTO order_item (order_id, item_id, quantity, unit_price, status,
                                        created_at, started_at, ready_at, served_at)
                VALUES (v_order, v_item, v_qty, v_price, 'SERVED', v_ts, v_start, v_ready,
                        v_ready + make_interval(mins => 1 + floor(random() * 4)::INT));
            END LOOP;

            SELECT SUM(quantity * unit_price) INTO v_sub FROM order_item WHERE order_id = v_order;
            v_dpct  := CASE WHEN random() < 0.08 THEN 10 ELSE 0 END;
            v_disc  := round(v_sub * v_dpct / 100, 2);
            v_gst   := round((v_sub - v_disc) * 0.025, 2);
            v_exact := v_sub - v_disc + 2 * v_gst;
            v_total := round(v_exact);
            INSERT INTO bill (order_id, subtotal, discount_pct, discount, cgst, sgst,
                              round_off, total, created_by, created_at)
            VALUES (v_order, v_sub, v_dpct, v_disc, v_gst, v_gst, v_total - v_exact,
                    v_total, v_cashier, v_close - INTERVAL '3 minutes')
            RETURNING bill_id INTO v_bill;

            u := random();
            INSERT INTO payment (bill_id, amount, mode, received_by, paid_at)
            VALUES (v_bill, v_total,
                    CASE WHEN u < 0.55 THEN 'UPI' WHEN u < 0.80 THEN 'CASH' ELSE 'CARD' END,
                    v_cashier, v_close);
            v_hist := v_hist + 1;
        END LOOP;
    END LOOP;

    -- ---------------- live service (triggers active) ----------------
    PERFORM set_config('rms.seeding', 'off', true);

    o1 := fn_place_order(v_waiters[1], 'DINE_IN', (SELECT table_id FROM dining_table WHERE table_no = 'T2'), 4, NULL, NULL,
          seed_items('[["Hyderabadi Chicken Dum Biryani",2],["Paneer Butter Masala",1],["Butter Naan",4],["Sweet Lassi",2]]'));
    o2 := fn_place_order(v_waiters[2], 'DINE_IN', (SELECT table_id FROM dining_table WHERE table_no = 'T5'), 2, NULL, NULL,
          seed_items('[["Irani Chai",2],["Double ka Meetha",1]]'));
    o3 := fn_place_order(v_waiters[1], 'DINE_IN', (SELECT table_id FROM dining_table WHERE table_no = 'T7'), 6, NULL, NULL,
          seed_items('[["Chicken 65",2],["Mutton Dum Biryani",2],["Garlic Naan",4],["Fresh Lime Soda",3]]'));
    o4 := fn_place_order(v_waiters[2], 'DINE_IN', (SELECT table_id FROM dining_table WHERE table_no = 'T9'), 5, NULL, NULL,
          seed_items('[["Apollo Fish",1],["Veg Dum Biryani",2],["Tandoori Roti",5]]'));
    o5 := fn_place_order(v_waiters[1], 'TAKEAWAY', NULL, NULL, 'Rahul Sharma', '9848000001',
          seed_items('[["Egg Biryani",2],["Cold Coffee",1]]'));

    -- move the kitchen forward the way staff would
    UPDATE order_item SET status = 'PREPARING'
     WHERE order_id = o1 AND item_id = (SELECT item_id FROM menu_item WHERE name = 'Hyderabadi Chicken Dum Biryani');
    UPDATE order_item SET status = 'READY'
     WHERE order_id = o1 AND item_id = (SELECT item_id FROM menu_item WHERE name = 'Sweet Lassi');
    UPDATE order_item SET status = 'READY'   WHERE order_id = o2;
    UPDATE order_item SET status = 'READY'   WHERE order_id = o3;
    UPDATE order_item SET status = 'SERVED'  WHERE order_id = o3;
    PERFORM fn_generate_bill(o3, 0, v_cashier);
    UPDATE order_item SET status = 'PREPARING' WHERE order_id = o5;

    -- make the live orders look like they were placed a while ago
    UPDATE orders     SET created_at = now() - INTERVAL '26 minutes' WHERE order_id = o1;
    UPDATE order_item SET created_at = now() - INTERVAL '26 minutes',
                          started_at = CASE WHEN started_at IS NOT NULL THEN now() - INTERVAL '20 minutes' END
     WHERE order_id = o1;
    UPDATE orders     SET created_at = now() - INTERVAL '14 minutes' WHERE order_id = o2;
    UPDATE order_item SET created_at = now() - INTERVAL '14 minutes',
                          started_at = now() - INTERVAL '10 minutes' WHERE order_id = o2;
    UPDATE orders     SET created_at = now() - INTERVAL '68 minutes' WHERE order_id = o3;
    UPDATE order_item SET created_at = now() - INTERVAL '68 minutes',
                          started_at = now() - INTERVAL '64 minutes',
                          ready_at   = now() - INTERVAL '45 minutes',
                          served_at  = now() - INTERVAL '43 minutes' WHERE order_id = o3;
    UPDATE orders     SET created_at = now() - INTERVAL '4 minutes' WHERE order_id = o4;
    UPDATE order_item SET created_at = now() - INTERVAL '4 minutes' WHERE order_id = o4;
    UPDATE orders     SET created_at = now() - INTERVAL '11 minutes' WHERE order_id = o5;
    UPDATE order_item SET created_at = now() - INTERVAL '11 minutes',
                          started_at = now() - INTERVAL '7 minutes' WHERE order_id = o5;

    RETURN format('%s historical orders over %s days + 5 live orders', v_hist, p_days + 1);
END $$;

SELECT fn_generate_demo(30);
