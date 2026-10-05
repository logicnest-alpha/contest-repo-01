-- =====================================================================
-- Secure SIS : Sample data (synthetic - no real personal data)
-- =====================================================================
SET ROLE sis_owner;

INSERT INTO sis.department VALUES
  (1, 'CSE',  'Computer Science and Engineering'),
  (2, 'ECE',  'Electronics and Communication Engineering'),
  (3, 'MECH', 'Mechanical Engineering');

INSERT INTO sis.faculty (full_name, dept_id, db_user) VALUES
  ('Dr. A. Kumar', 1, 'fac_kumar'),
  ('Dr. B. Rao',   2, 'fac_rao'),
  ('Dr. C. Iyer',  3, 'fac_iyer');

INSERT INTO sis.course (course_code, title, dept_id, faculty_id) VALUES
  ('CS301', 'Database Management Systems',  1, 1),
  ('CS302', 'Operating Systems',            1, 1),
  ('EC301', 'Digital Signal Processing',    2, 2),
  ('ME301', 'Thermodynamics',               3, 3);

-- register_student() encrypts phone + Aadhaar and builds the blind index
SELECT sis.register_student('25881A0501', 'Arjun Mehta',  'arjun.m@college.edu',  1::SMALLINT, '2007-03-14', '9876500001', '999911110001', 'stu_25881a0501');
SELECT sis.register_student('25881A0502', 'Divya Nair',   'divya.n@college.edu',  1::SMALLINT, '2007-07-22', '9876500002', '999911110002', 'stu_25881a0502');
SELECT sis.register_student('25881A0503', 'Farhan Ali',   'farhan.a@college.edu', 1::SMALLINT, '2006-12-02', '9876500003', '999911110003');
SELECT sis.register_student('25881A0401', 'Kavya Iyer',   'kavya.i@college.edu',  2::SMALLINT, '2007-01-30', '9876500004', '999911110004', 'stu_25881a0401');
SELECT sis.register_student('25881A0402', 'Rohit Das',    'rohit.d@college.edu',  2::SMALLINT, '2007-05-09', '9876500005', '999911110005');
SELECT sis.register_student('25881A0301', 'Meera Joshi',  'meera.j@college.edu',  3::SMALLINT, '2006-10-18', '9876500006', '999911110006');

-- Every student takes the courses of their own department
INSERT INTO sis.marks (student_id, course_id, internal, external)
SELECT s.student_id, c.course_id,
       25 + (s.student_id * 7 + c.course_id * 3) % 15,
       30 + (s.student_id * 11 + c.course_id * 5) % 30
FROM sis.student s JOIN sis.course c ON c.dept_id = s.dept_id;

INSERT INTO sis.fee_payment (student_id, amount, paid_on, mode, txn_ref)
SELECT student_id, 85000, DATE '2026-07-15' + student_id, 'UPI',
       'UPI' || to_char(DATE '2026-07-15' + student_id, 'YYMMDD') || lpad(student_id::text, 4, '0')
FROM sis.student;

RESET ROLE;
