-- =====================================================================
-- Library Management System : Schema (PostgreSQL 14+)
-- Separates a bibliographic TITLE (book) from its PHYSICAL COPIES
-- (book_copy) and records every issue/return as a LOAN.
-- =====================================================================
DROP SCHEMA IF EXISTS library CASCADE;
CREATE SCHEMA library;
SET search_path TO library;

-- ---------- Member categories hold the borrowing rules ----------
CREATE TABLE member_category (
    category_id      SMALLINT     PRIMARY KEY,
    category_name    VARCHAR(30)  NOT NULL UNIQUE,
    max_books        SMALLINT     NOT NULL CHECK (max_books > 0),
    loan_days        SMALLINT     NOT NULL CHECK (loan_days > 0),
    fine_per_day     NUMERIC(6,2) NOT NULL CHECK (fine_per_day >= 0),
    max_fine_per_loan NUMERIC(8,2) NOT NULL CHECK (max_fine_per_loan >= 0),
    fine_block_limit NUMERIC(8,2) NOT NULL CHECK (fine_block_limit >= 0)
);

CREATE TABLE member (
    member_id    SERIAL       PRIMARY KEY,
    full_name    VARCHAR(80)  NOT NULL,
    email        VARCHAR(120) NOT NULL UNIQUE,
    phone        VARCHAR(15),
    category_id  SMALLINT     NOT NULL REFERENCES member_category,
    joined_on    DATE         NOT NULL DEFAULT CURRENT_DATE,
    status       VARCHAR(10)  NOT NULL DEFAULT 'ACTIVE'
                 CHECK (status IN ('ACTIVE','SUSPENDED','CLOSED'))
);

-- ---------- Bibliographic data (the "title") ----------
CREATE TABLE publisher (
    publisher_id SERIAL      PRIMARY KEY,
    name         VARCHAR(80) NOT NULL UNIQUE
);

CREATE TABLE author (
    author_id SERIAL      PRIMARY KEY,
    full_name VARCHAR(80) NOT NULL
);

CREATE TABLE book (                       -- one row per TITLE / edition
    book_id      SERIAL       PRIMARY KEY,
    isbn         CHAR(13)     NOT NULL UNIQUE,
    title        VARCHAR(200) NOT NULL,
    edition      SMALLINT     NOT NULL DEFAULT 1,
    publisher_id INT          REFERENCES publisher,
    pub_year     SMALLINT     CHECK (pub_year BETWEEN 1800 AND 2100),
    subject      VARCHAR(60)
);

CREATE TABLE book_author (                -- M:N between book and author
    book_id   INT REFERENCES book   ON DELETE CASCADE,
    author_id INT REFERENCES author,
    PRIMARY KEY (book_id, author_id)
);

-- ---------- Physical copies ----------
CREATE TABLE book_copy (                  -- one row per PHYSICAL item
    copy_id        SERIAL      PRIMARY KEY,
    book_id        INT         NOT NULL REFERENCES book,
    barcode        VARCHAR(20) NOT NULL UNIQUE,
    shelf_location VARCHAR(20),
    acquired_on    DATE        NOT NULL DEFAULT CURRENT_DATE,
    status         VARCHAR(10) NOT NULL DEFAULT 'AVAILABLE'
                   CHECK (status IN ('AVAILABLE','ISSUED','ON_HOLD','LOST','DAMAGED'))
);
CREATE INDEX idx_copy_book_status ON book_copy (book_id, status);

-- ---------- Issue / return transactions ----------
CREATE TABLE loan (
    loan_id     SERIAL  PRIMARY KEY,
    copy_id     INT     NOT NULL REFERENCES book_copy,
    member_id   INT     NOT NULL REFERENCES member,
    issue_date  DATE    NOT NULL DEFAULT CURRENT_DATE,
    due_date    DATE    NOT NULL,
    return_date DATE,
    CHECK (due_date > issue_date),
    CHECK (return_date IS NULL OR return_date >= issue_date)
);
-- A copy can be on at most ONE open loan at any time
CREATE UNIQUE INDEX uq_loan_open_copy ON loan (copy_id) WHERE return_date IS NULL;
CREATE INDEX idx_loan_member_open ON loan (member_id) WHERE return_date IS NULL;
CREATE INDEX idx_loan_due_open    ON loan (due_date)  WHERE return_date IS NULL;

-- ---------- Reservations are placed on a TITLE, not a copy ----------
CREATE TABLE reservation (
    reservation_id  SERIAL      PRIMARY KEY,
    book_id         INT         NOT NULL REFERENCES book,
    member_id       INT         NOT NULL REFERENCES member,
    reserved_at     TIMESTAMP   NOT NULL DEFAULT now(),
    status          VARCHAR(10) NOT NULL DEFAULT 'WAITING'
                    CHECK (status IN ('WAITING','READY','FULFILLED','CANCELLED','EXPIRED')),
    held_copy_id    INT         REFERENCES book_copy,
    hold_expires_on DATE,
    CHECK (status <> 'READY'   OR (held_copy_id IS NOT NULL AND hold_expires_on IS NOT NULL)),
    CHECK (status <> 'WAITING' OR held_copy_id IS NULL)
);
-- A member may hold only one live reservation per title
CREATE UNIQUE INDEX uq_resv_live ON reservation (book_id, member_id)
    WHERE status IN ('WAITING','READY');
CREATE INDEX idx_resv_queue ON reservation (book_id, reserved_at) WHERE status = 'WAITING';

-- ---------- Fines (at most one per loan) ----------
CREATE TABLE fine (
    fine_id     SERIAL       PRIMARY KEY,
    loan_id     INT          NOT NULL UNIQUE REFERENCES loan,
    member_id   INT          NOT NULL REFERENCES member,
    days_late   INT          NOT NULL CHECK (days_late > 0),
    amount      NUMERIC(8,2) NOT NULL CHECK (amount >= 0),
    assessed_on DATE         NOT NULL DEFAULT CURRENT_DATE,
    paid_amount NUMERIC(8,2) NOT NULL DEFAULT 0 CHECK (paid_amount >= 0),
    status      VARCHAR(8)   NOT NULL DEFAULT 'UNPAID'
                CHECK (status IN ('UNPAID','PAID','WAIVED')),
    CHECK (paid_amount <= amount)
);
CREATE INDEX idx_fine_member ON fine (member_id);

-- ---------- Convenience view: availability of every title ----------
CREATE VIEW v_title_availability AS
SELECT b.book_id, b.title,
       COUNT(c.copy_id)                                  AS total_copies,
       COUNT(c.copy_id) FILTER (WHERE c.status='AVAILABLE') AS available,
       COUNT(c.copy_id) FILTER (WHERE c.status='ISSUED')    AS issued,
       COUNT(c.copy_id) FILTER (WHERE c.status='ON_HOLD')   AS on_hold,
       (SELECT COUNT(*) FROM reservation r
         WHERE r.book_id = b.book_id AND r.status = 'WAITING') AS queue_length
FROM book b
LEFT JOIN book_copy c ON c.book_id = b.book_id
GROUP BY b.book_id, b.title;
