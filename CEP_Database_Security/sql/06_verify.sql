-- =====================================================================
-- Secure SIS : Verification of every control
-- Run as superuser:  psql -d sis_db -f 06_verify.sql
-- SET SESSION AUTHORIZATION makes the session behave exactly as if
-- that user had logged in.  Expected refusals print as ERROR lines.
-- =====================================================================
\pset footer off
\set VERBOSITY terse

\echo '=== T1. Data at rest is ciphertext (superuser view of the raw table) ==='
SELECT roll_no,
       encode(substr(aadhaar_enc, 1, 12), 'hex') || '...' AS aadhaar_enc_prefix,
       length(aadhaar_enc)                                AS bytes
FROM sis.student ORDER BY roll_no LIMIT 3;

\echo '=== T2. Faculty (CSE) sees only CSE students - row-level security ==='
SET SESSION AUTHORIZATION fac_kumar;
SELECT roll_no, full_name, dept_id FROM sis.student ORDER BY roll_no;

\echo '=== T3. Faculty cannot read encrypted PII columns - column privileges ==='
SELECT roll_no, phone_enc FROM sis.student;

\echo '=== T4. Faculty sees marks of own courses only (security_invoker view) ==='
SELECT * FROM sis.v_marks_sheet ORDER BY course_code, roll_no;

\echo '=== T5. Faculty edits own course (1 row) but not an ECE course (0 rows) ==='
UPDATE sis.marks SET internal = 38
 WHERE student_id = 1 AND course_id = (SELECT course_id FROM sis.course WHERE course_code = 'CS301');
UPDATE sis.marks SET internal = 40
 WHERE course_id = (SELECT course_id FROM sis.course WHERE course_code = 'EC301');
RESET SESSION AUTHORIZATION;

\echo '=== T6. ECE faculty sees only ECE students ==='
SET SESSION AUTHORIZATION fac_rao;
SELECT roll_no, full_name, dept_id FROM sis.student ORDER BY roll_no;
RESET SESSION AUTHORIZATION;

\echo '=== T7. Student sees only own record, marks and fees ==='
SET SESSION AUTHORIZATION stu_25881a0501;
SELECT roll_no, full_name, dob FROM sis.student;
SELECT * FROM sis.v_marks_sheet;
SELECT payment_id, amount, paid_on FROM sis.fee_payment;

\echo '=== T8. Student cannot change marks ==='
UPDATE sis.marks SET external = 60;
RESET SESSION AUTHORIZATION;

\echo '=== T9. Accounts sees masked PII only, and no marks ==='
SET SESSION AUTHORIZATION acc_meena;
SELECT * FROM sis.v_student_masked ORDER BY roll_no;
SELECT * FROM sis.marks LIMIT 1;
SELECT * FROM vault.data_key;
RESET SESSION AUTHORIZATION;

\echo '=== T10. Registrar: reveal needs a reason; blind-index search works ==='
SET SESSION AUTHORIZATION admin_ravi;
SELECT * FROM sis.reveal_pii('25881A0502', 'x');
SELECT * FROM sis.reveal_pii('25881A0502', 'Scholarship verification - ticket SCH-2026-114');
SELECT sis.find_by_aadhaar('999911110004') AS roll_no_found;
SELECT vault.dec(phone_enc) FROM sis.student LIMIT 1;
DELETE FROM audit.log;
RESET SESSION AUTHORIZATION;

\echo '=== T11. Auditor reads the trail ==='
SET SESSION AUTHORIZATION aud_sharma;
SELECT log_id, login_user, action, table_name, row_key, old_data, new_data, reason
FROM audit.log ORDER BY log_id;
SELECT * FROM sis.student LIMIT 1;
RESET SESSION AUTHORIZATION;

\echo '=== T12. Even the owner cannot rewrite history ==='
SET ROLE sis_owner;
UPDATE audit.log SET login_user = 'someone_else';
TRUNCATE audit.log;
RESET ROLE;
