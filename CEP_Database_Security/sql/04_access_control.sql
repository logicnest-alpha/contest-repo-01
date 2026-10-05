-- =====================================================================
-- Secure SIS : Least-privilege grants, column privileges,
--              row-level security and views
-- =====================================================================
SET ROLE sis_owner;

-- ---------------------------------------------------------------------
-- 1. Schema and reference data
-- ---------------------------------------------------------------------
REVOKE ALL ON SCHEMA sis FROM PUBLIC;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA sis FROM PUBLIC;
GRANT USAGE ON SCHEMA sis TO r_admin_office, r_faculty, r_student, r_accounts;
GRANT SELECT ON sis.department, sis.course
      TO r_admin_office, r_faculty, r_student, r_accounts;
GRANT EXECUTE ON FUNCTION sis.my_dept(), sis.my_faculty_id(), sis.my_student_id()
      TO r_faculty, r_student, r_accounts, r_admin_office;

-- ---------------------------------------------------------------------
-- 2. Column-level privileges (encrypted PII columns are never granted
--    except to the registrar, and even then only as ciphertext)
-- ---------------------------------------------------------------------
GRANT SELECT ON sis.student TO r_admin_office;
GRANT UPDATE (full_name, email, dept_id) ON sis.student TO r_admin_office;
GRANT EXECUTE ON FUNCTION sis.register_student(TEXT, TEXT, TEXT, SMALLINT, DATE,
                                               TEXT, TEXT, NAME) TO r_admin_office;

GRANT SELECT (student_id, roll_no, full_name, email, dept_id)      ON sis.student TO r_faculty;
GRANT SELECT (student_id, roll_no, full_name, email, dept_id, dob) ON sis.student TO r_student;
GRANT SELECT (student_id, roll_no, full_name, dept_id)             ON sis.student TO r_accounts;

GRANT SELECT, INSERT, UPDATE ON sis.marks TO r_admin_office;
GRANT SELECT, UPDATE (internal, external) ON sis.marks TO r_faculty;
GRANT SELECT ON sis.marks TO r_student;

GRANT SELECT, INSERT ON sis.fee_payment TO r_accounts;
GRANT USAGE ON SEQUENCE sis.fee_payment_payment_id_seq TO r_accounts;
GRANT SELECT ON sis.fee_payment TO r_admin_office, r_student;

-- ---------------------------------------------------------------------
-- 3. Row-level security
--    (SELECT fn()) is evaluated once per query (InitPlan) instead of
--    once per row - see the performance section of the report.
-- ---------------------------------------------------------------------
ALTER TABLE sis.student ENABLE ROW LEVEL SECURITY;
CREATE POLICY student_admin    ON sis.student FOR ALL    TO r_admin_office
       USING (true) WITH CHECK (true);
CREATE POLICY student_faculty  ON sis.student FOR SELECT TO r_faculty
       USING (dept_id = (SELECT sis.my_dept()));
CREATE POLICY student_self     ON sis.student FOR SELECT TO r_student
       USING (student_id = (SELECT sis.my_student_id()));
CREATE POLICY student_accounts ON sis.student FOR SELECT TO r_accounts
       USING (true);

ALTER TABLE sis.marks ENABLE ROW LEVEL SECURITY;
CREATE POLICY marks_admin ON sis.marks FOR ALL TO r_admin_office
       USING (true) WITH CHECK (true);
CREATE POLICY marks_faculty_read ON sis.marks FOR SELECT TO r_faculty
       USING (course_id IN (SELECT course_id FROM sis.course
                             WHERE faculty_id = (SELECT sis.my_faculty_id())));
CREATE POLICY marks_faculty_edit ON sis.marks FOR UPDATE TO r_faculty
       USING      (course_id IN (SELECT course_id FROM sis.course
                                  WHERE faculty_id = (SELECT sis.my_faculty_id())))
       WITH CHECK (course_id IN (SELECT course_id FROM sis.course
                                  WHERE faculty_id = (SELECT sis.my_faculty_id())));
CREATE POLICY marks_self ON sis.marks FOR SELECT TO r_student
       USING (student_id = (SELECT sis.my_student_id()));

ALTER TABLE sis.fee_payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY fee_staff_read ON sis.fee_payment FOR SELECT
       TO r_accounts, r_admin_office USING (true);
CREATE POLICY fee_accounts_add ON sis.fee_payment FOR INSERT TO r_accounts
       WITH CHECK (paid_on <= CURRENT_DATE);
CREATE POLICY fee_self ON sis.fee_payment FOR SELECT TO r_student
       USING (student_id = (SELECT sis.my_student_id()));

-- ---------------------------------------------------------------------
-- 4. Views
-- ---------------------------------------------------------------------
-- (a) Masked directory: runs with the OWNER's rights (so it may read the
--     ciphertext columns) and decrypts through sis.mask(), which can only
--     ever return the last 4 characters. security_barrier stops a caller's
--     WHERE-clause function from seeing rows before masking.
CREATE FUNCTION sis.mask(p_cipher BYTEA, p_prefix TEXT) RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog AS $$
    SELECT p_prefix || right(vault.dec(p_cipher), 4);
$$;
REVOKE ALL ON FUNCTION sis.mask(BYTEA, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION sis.mask(BYTEA, TEXT) TO r_accounts, r_admin_office;

CREATE VIEW sis.v_student_masked WITH (security_barrier = true) AS
SELECT s.roll_no,
       s.full_name,
       d.dept_code,
       sis.mask(s.phone_enc,   'XXXXXX')      AS phone_masked,
       sis.mask(s.aadhaar_enc, 'XXXX-XXXX-')  AS aadhaar_masked
FROM sis.student s
JOIN sis.department d ON d.dept_id = s.dept_id;

GRANT SELECT ON sis.v_student_masked TO r_accounts, r_admin_office;

-- (b) Marks sheet: runs with the CALLER's rights, so the RLS policies on
--     student and marks decide which rows each user sees.
CREATE VIEW sis.v_marks_sheet WITH (security_invoker = true) AS
SELECT s.roll_no, s.full_name, c.course_code,
       m.internal, m.external, m.internal + m.external AS total
FROM sis.marks m
JOIN sis.student s ON s.student_id = m.student_id
JOIN sis.course  c ON c.course_id  = m.course_id;

GRANT SELECT ON sis.v_marks_sheet TO r_admin_office, r_faculty, r_student;

RESET ROLE;
