-- =====================================================================
-- Restaurant Order Management System : Schema (PostgreSQL 14+)
-- =====================================================================
DROP SCHEMA IF EXISTS rms CASCADE;
CREATE SCHEMA rms;
SET search_path TO rms;

-- ---------- People ----------
CREATE TABLE staff (
    staff_id      SERIAL      PRIMARY KEY,
    full_name     VARCHAR(60) NOT NULL,
    username      VARCHAR(30) NOT NULL UNIQUE,
    password_hash TEXT        NOT NULL,                 -- bcrypt, never plain text
    role          VARCHAR(10) NOT NULL
                  CHECK (role IN ('MANAGER','WAITER','CHEF','CASHIER')),
    is_active     BOOLEAN     NOT NULL DEFAULT true,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE customer (
    customer_id SERIAL      PRIMARY KEY,
    full_name   VARCHAR(60) NOT NULL,
    phone       CHAR(10)    NOT NULL UNIQUE CHECK (phone ~ '^[6-9][0-9]{9}$'),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Premises ----------
CREATE TABLE dining_table (
    table_id SERIAL      PRIMARY KEY,
    table_no VARCHAR(5)  NOT NULL UNIQUE,
    capacity SMALLINT    NOT NULL CHECK (capacity BETWEEN 1 AND 20),
    area     VARCHAR(20) NOT NULL DEFAULT 'Main Hall'
);

-- ---------- Menu ----------
CREATE TABLE category (
    category_id SERIAL      PRIMARY KEY,
    name        VARCHAR(40) NOT NULL UNIQUE,
    sort_order  SMALLINT    NOT NULL DEFAULT 0
);

CREATE TABLE menu_item (
    item_id      SERIAL       PRIMARY KEY,
    category_id  INT          NOT NULL REFERENCES category,
    name         VARCHAR(60)  NOT NULL UNIQUE,
    description  VARCHAR(200),
    price        NUMERIC(8,2) NOT NULL CHECK (price > 0),
    is_veg       BOOLEAN      NOT NULL,
    is_available BOOLEAN      NOT NULL DEFAULT true,
    prep_minutes SMALLINT     NOT NULL DEFAULT 15 CHECK (prep_minutes > 0)
);

-- ---------- Inventory ----------
CREATE TABLE ingredient (
    ingredient_id SERIAL        PRIMARY KEY,
    name          VARCHAR(40)   NOT NULL UNIQUE,
    unit          VARCHAR(4)    NOT NULL CHECK (unit IN ('kg','l','pcs')),
    stock_qty     NUMERIC(10,3) NOT NULL CHECK (stock_qty >= 0),
    reorder_level NUMERIC(10,3) NOT NULL DEFAULT 0 CHECK (reorder_level >= 0),
    par_qty       NUMERIC(10,3) NOT NULL DEFAULT 0,   -- normal opening stock
    cost_per_unit NUMERIC(8,2)  NOT NULL DEFAULT 0
);

CREATE TABLE recipe (                      -- M:N  menu_item <-> ingredient
    item_id         INT          REFERENCES menu_item ON DELETE CASCADE,
    ingredient_id   INT          REFERENCES ingredient,
    qty_per_serving NUMERIC(8,3) NOT NULL CHECK (qty_per_serving > 0),
    PRIMARY KEY (item_id, ingredient_id)
);

-- ---------- Orders ----------
CREATE TABLE orders (
    order_id    SERIAL      PRIMARY KEY,
    order_type  VARCHAR(8)  NOT NULL CHECK (order_type IN ('DINE_IN','TAKEAWAY')),
    table_id    INT         REFERENCES dining_table,
    customer_id INT         REFERENCES customer,
    waiter_id   INT         NOT NULL REFERENCES staff,
    guests      SMALLINT    CHECK (guests BETWEEN 1 AND 20),
    status      VARCHAR(10) NOT NULL DEFAULT 'PLACED'
                CHECK (status IN ('PLACED','PREPARING','READY','SERVED',
                                  'BILLED','PAID','CANCELLED')),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    closed_at   TIMESTAMPTZ,
    CHECK ((order_type = 'DINE_IN') = (table_id IS NOT NULL))
);
-- A table can have only ONE open order at a time
CREATE UNIQUE INDEX uq_open_order_per_table ON orders (table_id)
    WHERE status NOT IN ('PAID','CANCELLED');
CREATE INDEX idx_orders_created ON orders (created_at);
CREATE INDEX idx_orders_open    ON orders (status) WHERE status NOT IN ('PAID','CANCELLED');

CREATE TABLE order_item (
    order_item_id SERIAL       PRIMARY KEY,
    order_id      INT          NOT NULL REFERENCES orders ON DELETE CASCADE,
    item_id       INT          NOT NULL REFERENCES menu_item,
    quantity      SMALLINT     NOT NULL CHECK (quantity BETWEEN 1 AND 50),
    unit_price    NUMERIC(8,2) NOT NULL CHECK (unit_price > 0),   -- price when ordered
    notes         VARCHAR(100),
    status        VARCHAR(10)  NOT NULL DEFAULT 'PENDING'
                  CHECK (status IN ('PENDING','PREPARING','READY','SERVED','CANCELLED')),
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    started_at    TIMESTAMPTZ,
    ready_at      TIMESTAMPTZ,
    served_at     TIMESTAMPTZ
);
CREATE INDEX idx_oi_order   ON order_item (order_id);
CREATE INDEX idx_oi_item    ON order_item (item_id);
CREATE INDEX idx_oi_kitchen ON order_item (status) WHERE status IN ('PENDING','PREPARING','READY');

-- ---------- Billing ----------
CREATE TABLE bill (
    bill_id      SERIAL        PRIMARY KEY,
    order_id     INT           NOT NULL UNIQUE REFERENCES orders,
    subtotal     NUMERIC(10,2) NOT NULL CHECK (subtotal >= 0),
    discount_pct NUMERIC(5,2)  NOT NULL DEFAULT 0 CHECK (discount_pct BETWEEN 0 AND 50),
    discount     NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (discount >= 0),
    cgst         NUMERIC(10,2) NOT NULL CHECK (cgst >= 0),
    sgst         NUMERIC(10,2) NOT NULL CHECK (sgst >= 0),
    round_off    NUMERIC(4,2)  NOT NULL DEFAULT 0,
    total        NUMERIC(10,2) NOT NULL CHECK (total >= 0),
    created_by   INT           REFERENCES staff,
    created_at   TIMESTAMPTZ   NOT NULL DEFAULT now()
);

CREATE TABLE payment (
    payment_id  SERIAL        PRIMARY KEY,
    bill_id     INT           NOT NULL REFERENCES bill,
    amount      NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    mode        VARCHAR(5)    NOT NULL CHECK (mode IN ('CASH','UPI','CARD')),
    received_by INT           REFERENCES staff,
    paid_at     TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX idx_payment_bill ON payment (bill_id);
