-- =====================================================================
-- Secure SIS : Bulk synthetic data for the performance measurements
-- 20,000 extra students (5 departments) and 40,000 marks rows.
-- Run AFTER 06_verify.sql and app/injection_demo.py.
-- =====================================================================
SET ROLE sis_owner;

INSERT INTO sis.department VALUES
  (4, 'IT',   'Information Technology'),
  (5, 'AIML', 'CSE (Artificial Intelligence and Machine Learning)');

INSERT INTO sis.faculty (full_name, dept_id, db_user) VALUES
  ('Dr. D. Varma', 4, 'fac_varma'),
  ('Dr. E. Khan',  5, 'fac_khan');

INSERT INTO sis.course (course_code, title, dept_id, faculty_id) VALUES
  ('EC302', 'VLSI Design',             2, 2),
  ('ME302', 'Fluid Mechanics',         3, 3),
  ('IT301', 'Web Technologies',        4, 4),
  ('IT302', 'Cloud Computing',         4, 4),
  ('AI301', 'Machine Learning',        5, 5),
  ('AI302', 'Deep Learning',           5, 5);

-- Roll numbers 1x881A{05,04,03,12,66}{00..ZZ}; synthetic phone/Aadhaar
SELECT count(sis.register_student(
         lpad((10 + (i / 5) % 10)::TEXT, 2, '0') || '881A'
           || (ARRAY['05','04','03','12','66'])[i % 5 + 1]
           || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', (i / 50) / 36 + 1, 1)
           || substr('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ', (i / 50) % 36 + 1, 1),
         'Bench Student ' || i,
         'bench' || i || '@college.edu',
         (i % 5 + 1)::SMALLINT,
         DATE '2005-01-01' + (i % 1000),
         '9' || lpad(i::TEXT, 9, '0'),
         '8' || lpad(i::TEXT, 11, '0')))
FROM generate_series(0, 19999) AS i;

INSERT INTO sis.marks (student_id, course_id, internal, external)
SELECT s.student_id, c.course_id,
       20 + (s.student_id + c.course_id) % 21,
       25 + (s.student_id * 3 + c.course_id) % 36
FROM sis.student s
JOIN sis.course c ON c.dept_id = s.dept_id
WHERE s.full_name LIKE 'Bench Student %';

RESET ROLE;
ANALYZE;
