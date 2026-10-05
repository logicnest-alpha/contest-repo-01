-- =====================================================================
-- Secure SIS : Append-only audit trail and audited PII access
-- =====================================================================
SET ROLE sis_owner;

CREATE TABLE audit.log (
    log_id     BIGSERIAL   PRIMARY KEY,
    logged_at  TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    login_user NAME        NOT NULL DEFAULT session_user,   -- the human
    client_ip  INET                 DEFAULT inet_client_addr(),
    action     VARCHAR(20) NOT NULL,                        -- INSERT/UPDATE/DELETE/REVEAL_PII/...
    table_name NAME        NOT NULL,
    row_key    TEXT,
    old_data   JSONB,
    new_data   JSONB,
    reason     TEXT
);
CREATE INDEX idx_audit_user_time ON audit.log (login_user, logged_at);

-- ---------- The log can only grow ----------
CREATE FUNCTION audit.f_append_only() RETURNS TRIGGER
LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION 'audit.log is append-only (% blocked)', TG_OP;
END $$;

CREATE TRIGGER trg_log_no_update BEFORE UPDATE OR DELETE ON audit.log
    FOR EACH ROW EXECUTE FUNCTION audit.f_append_only();
CREATE TRIGGER trg_log_no_truncate BEFORE TRUNCATE ON audit.log
    FOR EACH STATEMENT EXECUTE FUNCTION audit.f_append_only();

-- ---------- Generic row-change trigger ----------
-- TG_ARGV holds the primary-key column names of the audited table.
-- Ciphertext columns are never copied into the log; for UPDATE only the
-- columns that actually changed are stored.
CREATE FUNCTION audit.f_row_change() RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
DECLARE
    v_hidden TEXT[] := ARRAY['phone_enc','aadhaar_enc','aadhaar_bidx'];
    v_old    JSONB;
    v_new    JSONB;
    v_row    JSONB;
    v_key    TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN v_old := to_jsonb(OLD) - v_hidden; END IF;
    IF TG_OP <> 'DELETE' THEN v_new := to_jsonb(NEW) - v_hidden; END IF;
    v_row := COALESCE(v_new, v_old);

    SELECT string_agg(v_row ->> col, ',') INTO v_key FROM unnest(TG_ARGV) AS col;

    IF TG_OP = 'UPDATE' THEN
        SELECT jsonb_object_agg(n.key, n.value), jsonb_object_agg(n.key, v_old -> n.key)
          INTO v_new, v_old
          FROM jsonb_each(v_new) n
         WHERE n.value IS DISTINCT FROM v_old -> n.key;
        IF v_new IS NULL THEN RETURN NULL; END IF;      -- nothing really changed
    END IF;

    INSERT INTO audit.log (action, table_name, row_key, old_data, new_data)
    VALUES (TG_OP, TG_TABLE_NAME, v_key, v_old, v_new);
    RETURN NULL;
END $$;

CREATE TRIGGER trg_audit_student AFTER INSERT OR UPDATE OR DELETE ON sis.student
    FOR EACH ROW EXECUTE FUNCTION audit.f_row_change('roll_no');
CREATE TRIGGER trg_audit_marks AFTER INSERT OR UPDATE OR DELETE ON sis.marks
    FOR EACH ROW EXECUTE FUNCTION audit.f_row_change('student_id', 'course_id');
CREATE TRIGGER trg_audit_fee AFTER INSERT OR UPDATE OR DELETE ON sis.fee_payment
    FOR EACH ROW EXECUTE FUNCTION audit.f_row_change('payment_id');

-- ---------------------------------------------------------------------
-- "Break-glass" access to plaintext PII: registrar only, a written
-- reason is mandatory, every call is logged, max 20 reveals per day.
-- ---------------------------------------------------------------------
CREATE FUNCTION sis.reveal_pii(p_roll TEXT, p_reason TEXT)
RETURNS TABLE (roll_no TEXT, phone TEXT, aadhaar TEXT)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, sis AS $$
BEGIN
    IF length(trim(COALESCE(p_reason, ''))) < 10 THEN
        RAISE EXCEPTION 'A justification of at least 10 characters is required';
    END IF;
    IF (SELECT COUNT(*) FROM audit.log l
         WHERE l.login_user = session_user AND l.action = 'REVEAL_PII'
           AND l.logged_at >= date_trunc('day', now())) >= 20 THEN
        RAISE EXCEPTION 'Daily PII reveal limit reached for %', session_user;
    END IF;

    INSERT INTO audit.log (action, table_name, row_key, reason)
    VALUES ('REVEAL_PII', 'student', upper(p_roll), p_reason);

    RETURN QUERY
    SELECT s.roll_no::TEXT, vault.dec(s.phone_enc), vault.dec(s.aadhaar_enc)
      FROM sis.student s
     WHERE s.roll_no = upper(p_roll);
    IF NOT FOUND THEN
        RAISE EXCEPTION 'No student with roll number %', p_roll;
    END IF;
END $$;

-- Equality search on an encrypted column through the blind index
CREATE FUNCTION sis.find_by_aadhaar(p_aadhaar TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, sis AS $$
DECLARE
    v_roll TEXT;
BEGIN
    SELECT s.roll_no INTO v_roll FROM sis.student s
     WHERE s.aadhaar_bidx = vault.blind_index(p_aadhaar);
    INSERT INTO audit.log (action, table_name, row_key, reason)
    VALUES ('LOOKUP_AADHAAR', 'student', v_roll, 'blind-index search');
    RETURN v_roll;
END $$;

REVOKE ALL ON FUNCTION sis.reveal_pii(TEXT, TEXT), sis.find_by_aadhaar(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sis.reveal_pii(TEXT, TEXT), sis.find_by_aadhaar(TEXT)
      TO r_admin_office;

-- Only the auditor can read the trail; nobody can change it
REVOKE ALL ON SCHEMA audit FROM PUBLIC;
GRANT USAGE  ON SCHEMA audit TO r_auditor;
GRANT SELECT ON audit.log    TO r_auditor;

RESET ROLE;
