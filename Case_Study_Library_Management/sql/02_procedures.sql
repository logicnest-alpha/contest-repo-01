-- =====================================================================
-- Library Management System : Business rules as stored procedures
-- =====================================================================
SET search_path TO library;

-- ---------------------------------------------------------------------
-- Fine = min( max(0, return_date - due_date) * rate_per_day , cap )
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_calculate_fine(p_due DATE, p_returned DATE,
                                             p_rate NUMERIC, p_cap NUMERIC)
RETURNS NUMERIC LANGUAGE sql IMMUTABLE AS $$
    SELECT LEAST(GREATEST(p_returned - p_due, 0) * p_rate, p_cap)::NUMERIC(8,2);
$$;

-- ---------------------------------------------------------------------
-- Give a copy that has just come back to the next member in the FIFO
-- reservation queue (copy -> ON_HOLD), or put it on the shelf.
-- Returns the member_id the copy is held for, or NULL.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_allocate_copy(p_copy_id INT)
RETURNS INT LANGUAGE plpgsql AS $$
DECLARE
    v_book_id INT;
    v_resv    RECORD;
BEGIN
    SELECT book_id INTO v_book_id FROM book_copy WHERE copy_id = p_copy_id FOR UPDATE;
    -- Lock the title so a concurrent sp_reserve_book cannot slip in between
    PERFORM 1 FROM book WHERE book_id = v_book_id FOR UPDATE;

    SELECT reservation_id, member_id INTO v_resv
      FROM reservation
     WHERE book_id = v_book_id AND status = 'WAITING'
     ORDER BY reserved_at, reservation_id
     LIMIT 1
       FOR UPDATE;

    IF FOUND THEN
        UPDATE reservation
           SET status = 'READY', held_copy_id = p_copy_id,
               hold_expires_on = CURRENT_DATE + 3          -- 3-day pickup window
         WHERE reservation_id = v_resv.reservation_id;
        UPDATE book_copy SET status = 'ON_HOLD' WHERE copy_id = p_copy_id;
        RETURN v_resv.member_id;
    END IF;

    UPDATE book_copy SET status = 'AVAILABLE' WHERE copy_id = p_copy_id;
    RETURN NULL;
END $$;

-- ---------------------------------------------------------------------
-- ISSUE a copy to a member
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_issue_book(p_member_id INT, p_barcode VARCHAR,
                                          INOUT p_loan_id INT  DEFAULT NULL,
                                          INOUT p_due_date DATE DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_mem     RECORD;
    v_copy    book_copy%ROWTYPE;
    v_active  INT;
    v_overdue INT;
    v_unpaid  NUMERIC;
BEGIN
    -- 1. Lock the member: two parallel issues cannot both pass the limit check
    SELECT m.status, c.max_books, c.loan_days, c.fine_block_limit INTO v_mem
      FROM member m JOIN member_category c USING (category_id)
     WHERE m.member_id = p_member_id
       FOR UPDATE OF m;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Member % does not exist', p_member_id;
    END IF;
    IF v_mem.status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Member % is %', p_member_id, v_mem.status;
    END IF;

    -- 2. Borrowing rules
    SELECT COUNT(*), COUNT(*) FILTER (WHERE due_date < CURRENT_DATE)
      INTO v_active, v_overdue
      FROM loan
     WHERE member_id = p_member_id AND return_date IS NULL;

    IF v_overdue > 0 THEN
        RAISE EXCEPTION 'Member % has % overdue book(s); return them first',
                        p_member_id, v_overdue;
    END IF;
    IF v_active >= v_mem.max_books THEN
        RAISE EXCEPTION 'Borrowing limit reached: % of % books already issued',
                        v_active, v_mem.max_books;
    END IF;

    SELECT COALESCE(SUM(amount - paid_amount), 0) INTO v_unpaid
      FROM fine WHERE member_id = p_member_id AND status = 'UNPAID';
    IF v_unpaid > v_mem.fine_block_limit THEN
        RAISE EXCEPTION 'Unpaid fines Rs.% exceed the limit of Rs.%',
                        v_unpaid, v_mem.fine_block_limit;
    END IF;

    -- 3. Lock the copy and make sure it may be lent to THIS member
    SELECT * INTO v_copy FROM book_copy WHERE barcode = p_barcode FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No copy with barcode %', p_barcode;
    END IF;

    IF v_copy.status = 'ON_HOLD' THEN
        UPDATE reservation SET status = 'FULFILLED'
         WHERE held_copy_id = v_copy.copy_id AND status = 'READY'
           AND member_id = p_member_id;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Copy % is on hold for another member', p_barcode;
        END IF;
    ELSIF v_copy.status <> 'AVAILABLE' THEN
        RAISE EXCEPTION 'Copy % is not available (status %)', p_barcode, v_copy.status;
    END IF;

    IF EXISTS (SELECT 1 FROM loan l JOIN book_copy c USING (copy_id)
                WHERE l.member_id = p_member_id AND l.return_date IS NULL
                  AND c.book_id = v_copy.book_id) THEN
        RAISE EXCEPTION 'Member % already has a copy of this title', p_member_id;
    END IF;

    -- 4. Record the loan
    p_due_date := CURRENT_DATE + v_mem.loan_days;
    INSERT INTO loan (copy_id, member_id, issue_date, due_date)
    VALUES (v_copy.copy_id, p_member_id, CURRENT_DATE, p_due_date)
    RETURNING loan_id INTO p_loan_id;

    UPDATE book_copy SET status = 'ISSUED' WHERE copy_id = v_copy.copy_id;
END $$;

-- ---------------------------------------------------------------------
-- RETURN a copy: close the loan, assess the fine, serve the queue
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_return_book(p_barcode VARCHAR,
                                           p_return_date DATE DEFAULT CURRENT_DATE,
                                           INOUT p_fine NUMERIC DEFAULT 0,
                                           INOUT p_held_for INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_loan loan%ROWTYPE;
    v_rate NUMERIC;
    v_cap  NUMERIC;
BEGIN
    SELECT l.* INTO v_loan
      FROM loan l JOIN book_copy c USING (copy_id)
     WHERE c.barcode = p_barcode AND l.return_date IS NULL
       FOR UPDATE OF l, c;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Copy % is not currently on loan', p_barcode;
    END IF;
    IF p_return_date < v_loan.issue_date OR p_return_date > CURRENT_DATE THEN
        RAISE EXCEPTION 'Invalid return date %', p_return_date;
    END IF;

    UPDATE loan SET return_date = p_return_date WHERE loan_id = v_loan.loan_id;

    -- Fine assessment
    SELECT mc.fine_per_day, mc.max_fine_per_loan INTO v_rate, v_cap
      FROM member m JOIN member_category mc USING (category_id)
     WHERE m.member_id = v_loan.member_id;

    p_fine := fn_calculate_fine(v_loan.due_date, p_return_date, v_rate, v_cap);
    IF p_fine > 0 THEN
        INSERT INTO fine (loan_id, member_id, days_late, amount, assessed_on)
        VALUES (v_loan.loan_id, v_loan.member_id,
                p_return_date - v_loan.due_date, p_fine, p_return_date);
    END IF;

    -- Hand the copy to the reservation queue (or back to the shelf)
    p_held_for := fn_allocate_copy(v_loan.copy_id);
END $$;

-- ---------------------------------------------------------------------
-- RESERVE a title (only allowed when every copy is out)
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_reserve_book(p_member_id INT, p_book_id INT,
                                            INOUT p_reservation_id INT DEFAULT NULL,
                                            INOUT p_queue_position INT DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_status VARCHAR;
BEGIN
    SELECT status INTO v_status FROM member WHERE member_id = p_member_id;
    IF NOT FOUND OR v_status <> 'ACTIVE' THEN
        RAISE EXCEPTION 'Member % cannot place reservations', p_member_id;
    END IF;

    -- Serialise against fn_allocate_copy for the same title
    PERFORM 1 FROM book WHERE book_id = p_book_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Book % does not exist', p_book_id;
    END IF;

    IF EXISTS (SELECT 1 FROM book_copy
                WHERE book_id = p_book_id AND status = 'AVAILABLE') THEN
        RAISE EXCEPTION 'A copy is on the shelf - issue it instead of reserving';
    END IF;
    IF EXISTS (SELECT 1 FROM loan l JOIN book_copy c USING (copy_id)
                WHERE c.book_id = p_book_id AND l.member_id = p_member_id
                  AND l.return_date IS NULL) THEN
        RAISE EXCEPTION 'Member % already has this title on loan', p_member_id;
    END IF;

    BEGIN
        INSERT INTO reservation (book_id, member_id)
        VALUES (p_book_id, p_member_id)
        RETURNING reservation_id INTO p_reservation_id;
    EXCEPTION WHEN unique_violation THEN
        RAISE EXCEPTION 'Member % already has a live reservation for book %',
                        p_member_id, p_book_id;
    END;

    SELECT COUNT(*) INTO p_queue_position
      FROM reservation
     WHERE book_id = p_book_id AND status = 'WAITING'
       AND reservation_id <= p_reservation_id;
END $$;

-- ---------------------------------------------------------------------
-- Nightly job: expire holds not collected in time, pass copy onward
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_expire_holds(INOUT p_expired INT DEFAULT 0)
LANGUAGE plpgsql AS $$
DECLARE
    r RECORD;
BEGIN
    p_expired := 0;
    FOR r IN SELECT reservation_id, held_copy_id FROM reservation
              WHERE status = 'READY' AND hold_expires_on < CURRENT_DATE
    LOOP
        -- lock order copy -> reservation, same as sp_issue_book (no deadlock)
        PERFORM 1 FROM book_copy WHERE copy_id = r.held_copy_id FOR UPDATE;
        UPDATE reservation SET status = 'EXPIRED'
         WHERE reservation_id = r.reservation_id AND status = 'READY';
        IF FOUND THEN
            PERFORM fn_allocate_copy(r.held_copy_id);
            p_expired := p_expired + 1;
        END IF;
    END LOOP;
END $$;

-- ---------------------------------------------------------------------
-- Record a (part-)payment against a fine
-- ---------------------------------------------------------------------
CREATE OR REPLACE PROCEDURE sp_pay_fine(p_fine_id INT, p_amount NUMERIC,
                                        INOUT p_balance NUMERIC DEFAULT NULL)
LANGUAGE plpgsql AS $$
DECLARE
    v_fine fine%ROWTYPE;
BEGIN
    SELECT * INTO v_fine FROM fine WHERE fine_id = p_fine_id FOR UPDATE;
    IF NOT FOUND OR v_fine.status <> 'UNPAID' THEN
        RAISE EXCEPTION 'Fine % is not payable', p_fine_id;
    END IF;
    IF p_amount <= 0 OR p_amount > v_fine.amount - v_fine.paid_amount THEN
        RAISE EXCEPTION 'Payment must be between 0 and Rs.%',
                        v_fine.amount - v_fine.paid_amount;
    END IF;

    UPDATE fine
       SET paid_amount = paid_amount + p_amount,
           status = CASE WHEN paid_amount + p_amount = amount THEN 'PAID' ELSE 'UNPAID' END
     WHERE fine_id = p_fine_id
    RETURNING amount - paid_amount INTO p_balance;
END $$;
