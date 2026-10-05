-- =====================================================================
-- Secure SIS : Schema, key vault and encryption functions
-- Run as superuser on sis_db (after 01_roles.sql).
-- =====================================================================
CREATE EXTENSION IF NOT EXISTS pgcrypto;          -- needs superuser once

SET ROLE sis_owner;                                -- everything below is owned by sis_owner

CREATE SCHEMA sis;     -- application data
CREATE SCHEMA vault;   -- encryption keys + crypto helpers (no access for anyone else)
CREATE SCHEMA audit;   -- append-only audit trail

-- ---------------------------------------------------------------------
-- Application tables
-- ---------------------------------------------------------------------
CREATE TABLE sis.department (
    dept_id   SMALLINT    PRIMARY KEY,
    dept_code VARCHAR(10) NOT NULL UNIQUE,
    dept_name VARCHAR(80) NOT NULL
);

CREATE TABLE sis.student (
    student_id   SERIAL       PRIMARY KEY,
    roll_no      VARCHAR(10)  NOT NULL UNIQUE
                 CHECK (roll_no ~ '^[0-9]{2}881A[0-9]{2}[0-9A-Z]{2}$'),
    full_name    VARCHAR(80)  NOT NULL,
    email        VARCHAR(120) NOT NULL UNIQUE,
    dept_id      SMALLINT     NOT NULL REFERENCES sis.department,
    dob          DATE         NOT NULL,
    phone_enc    BYTEA        NOT NULL,          -- AES-256 ciphertext
    aadhaar_enc  BYTEA        NOT NULL,          -- AES-256 ciphertext
    aadhaar_bidx BYTEA        NOT NULL UNIQUE,   -- HMAC-SHA256 "blind index"
    db_user      NAME         UNIQUE             -- login role of this student
);
CREATE INDEX idx_student_dept ON sis.student (dept_id);

CREATE TABLE sis.faculty (
    faculty_id SERIAL      PRIMARY KEY,
    full_name  VARCHAR(80) NOT NULL,
    dept_id    SMALLINT    NOT NULL REFERENCES sis.department,
    db_user    NAME        NOT NULL UNIQUE
);

CREATE TABLE sis.course (
    course_id   SERIAL      PRIMARY KEY,
    course_code VARCHAR(10) NOT NULL UNIQUE,
    title       VARCHAR(80) NOT NULL,
    dept_id     SMALLINT    NOT NULL REFERENCES sis.department,
    faculty_id  INT         NOT NULL REFERENCES sis.faculty
);
CREATE INDEX idx_course_faculty ON sis.course (faculty_id);

CREATE TABLE sis.marks (
    student_id INT      NOT NULL REFERENCES sis.student,
    course_id  INT      NOT NULL REFERENCES sis.course,
    internal   SMALLINT CHECK (internal BETWEEN 0 AND 40),
    external   SMALLINT CHECK (external BETWEEN 0 AND 60),
    PRIMARY KEY (student_id, course_id)
);
CREATE INDEX idx_marks_course ON sis.marks (course_id);

CREATE TABLE sis.fee_payment (
    payment_id SERIAL        PRIMARY KEY,
    student_id INT           NOT NULL REFERENCES sis.student,
    amount     NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    paid_on    DATE          NOT NULL DEFAULT CURRENT_DATE,
    mode       VARCHAR(10)   NOT NULL CHECK (mode IN ('UPI','CARD','NEFT','CASH')),
    txn_ref    VARCHAR(30)   NOT NULL UNIQUE
);
CREATE INDEX idx_fee_student ON sis.fee_payment (student_id);

-- ---------------------------------------------------------------------
-- Key vault. In production the key comes from a KMS/HSM; here it is a
-- table that only sis_owner can read, reached only through
-- SECURITY DEFINER functions.
-- ---------------------------------------------------------------------
CREATE TABLE vault.data_key (
    purpose    VARCHAR(10) PRIMARY KEY CHECK (purpose IN ('ENC','HMAC')),
    key_bytes  BYTEA       NOT NULL CHECK (length(key_bytes) = 32),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO vault.data_key (purpose, key_bytes) VALUES
    ('ENC',  gen_random_bytes(32)),
    ('HMAC', gen_random_bytes(32));

-- The key is 256 random bits, so password stretching (s2k-mode=3) adds cost
-- but no security: use salted single-pass S2K with AES-256.
CREATE FUNCTION vault.enc(p_plain TEXT) RETURNS BYTEA
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT pgp_sym_encrypt(p_plain, encode(key_bytes, 'hex'),
                           'cipher-algo=aes256, s2k-mode=1')
    FROM vault.data_key WHERE purpose = 'ENC';
$$;

CREATE FUNCTION vault.dec(p_cipher BYTEA) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT pgp_sym_decrypt(p_cipher, encode(key_bytes, 'hex'))
    FROM vault.data_key WHERE purpose = 'ENC';
$$;

CREATE FUNCTION vault.blind_index(p_plain TEXT) RETURNS BYTEA
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public AS $$
    SELECT hmac(convert_to(p_plain, 'UTF8'), key_bytes, 'sha256')
    FROM vault.data_key WHERE purpose = 'HMAC';
$$;

-- Functions are executable by PUBLIC by default - take that away
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA vault FROM PUBLIC;
REVOKE ALL ON SCHEMA vault FROM PUBLIC;

-- ---------------------------------------------------------------------
-- Identity helpers used by row-level-security policies
-- ---------------------------------------------------------------------
CREATE FUNCTION sis.my_dept() RETURNS SMALLINT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, sis AS $$
    SELECT dept_id FROM sis.faculty WHERE db_user = session_user;
$$;

CREATE FUNCTION sis.my_faculty_id() RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, sis AS $$
    SELECT faculty_id FROM sis.faculty WHERE db_user = session_user;
$$;

CREATE FUNCTION sis.my_student_id() RETURNS INT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, sis AS $$
    SELECT student_id FROM sis.student WHERE db_user = session_user;
$$;

-- ---------------------------------------------------------------------
-- Registration: the only way to create a student; encrypts PII
-- ---------------------------------------------------------------------
CREATE FUNCTION sis.register_student(p_roll TEXT, p_name TEXT, p_email TEXT,
                                     p_dept SMALLINT, p_dob DATE,
                                     p_phone TEXT, p_aadhaar TEXT,
                                     p_db_user NAME DEFAULT NULL)
RETURNS INT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog, sis AS $$
DECLARE
    v_id INT;
BEGIN
    IF p_phone   !~ '^[6-9][0-9]{9}$' THEN RAISE EXCEPTION 'Invalid phone number';   END IF;
    IF p_aadhaar !~ '^[2-9][0-9]{11}$' THEN RAISE EXCEPTION 'Invalid Aadhaar number'; END IF;

    INSERT INTO sis.student (roll_no, full_name, email, dept_id, dob,
                             phone_enc, aadhaar_enc, aadhaar_bidx, db_user)
    VALUES (upper(p_roll), p_name, lower(p_email), p_dept, p_dob,
            vault.enc(p_phone), vault.enc(p_aadhaar),
            vault.blind_index(p_aadhaar), p_db_user)
    RETURNING student_id INTO v_id;
    RETURN v_id;
END $$;
