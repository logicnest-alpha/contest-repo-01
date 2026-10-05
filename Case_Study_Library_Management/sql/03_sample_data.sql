-- =====================================================================
-- Library Management System : Sample data
-- Dates are relative to CURRENT_DATE so the demo gives the same
-- overdue / fine figures whenever it is run.
-- =====================================================================
SET search_path TO library;

INSERT INTO member_category VALUES
-- id  name       max  days  Rs/day  cap/loan  block if unpaid >
  (1, 'STUDENT',   3,  14,   2.00,   200.00,   100.00),
  (2, 'FACULTY',   8,  30,   1.00,   100.00,   200.00),
  (3, 'STAFF',     4,  21,   1.00,   100.00,   100.00);

INSERT INTO member (full_name, email, phone, category_id, joined_on) VALUES
  ('Ananya Rao',      'ananya.rao@college.edu',    '9000000001', 1, '2025-08-01'),
  ('Rahul Verma',     'rahul.verma@college.edu',   '9000000002', 1, '2025-08-01'),
  ('Priya Sharma',    'priya.sharma@college.edu',  '9000000003', 1, '2025-08-02'),
  ('Kiran Kumar',     'kiran.kumar@college.edu',   '9000000004', 1, '2025-08-02'),
  ('Dr. S. Lakshmi',  's.lakshmi@college.edu',     '9000000005', 2, '2019-06-15'),
  ('Mohammed Irfan',  'm.irfan@college.edu',       '9000000006', 1, '2025-08-03'),
  ('Sneha Reddy',     'sneha.reddy@college.edu',   '9000000007', 1, '2025-08-03'),
  ('Venkat Rao',      'venkat.rao@college.edu',    '9000000008', 3, '2020-01-10');

INSERT INTO publisher (name) VALUES
  ('McGraw-Hill'), ('Pearson'), ('MIT Press'), ('Wiley'),
  ('Prentice Hall'), ('Addison-Wesley');

INSERT INTO author (full_name) VALUES
  ('Abraham Silberschatz'), ('Henry F. Korth'), ('S. Sudarshan'),        -- 1-3
  ('Ramez Elmasri'), ('Shamkant B. Navathe'),                            -- 4-5
  ('Thomas H. Cormen'), ('Charles E. Leiserson'),                         -- 6-7
  ('Peter B. Galvin'), ('Greg Gagne'),                                    -- 8-9
  ('Andrew S. Tanenbaum'), ('Robert C. Martin'),                          -- 10-11
  ('David Thomas'), ('Andrew Hunt'), ('Erich Gamma');                     -- 12-14

INSERT INTO book (isbn, title, edition, publisher_id, pub_year, subject) VALUES
  ('9780078022159', 'Database System Concepts',              7, 1, 2019, 'Databases'),
  ('9780133970777', 'Fundamentals of Database Systems',      7, 2, 2016, 'Databases'),
  ('9780262046305', 'Introduction to Algorithms',            4, 3, 2022, 'Algorithms'),
  ('9781119320913', 'Operating System Concepts',            10, 4, 2018, 'Operating Systems'),
  ('9780136764052', 'Computer Networks',                     6, 2, 2021, 'Networks'),
  ('9780132350884', 'Clean Code',                            1, 5, 2008, 'Software Engg.'),
  ('9780135957059', 'The Pragmatic Programmer',              2, 6, 2019, 'Software Engg.'),
  ('9780201633610', 'Design Patterns',                       1, 6, 1994, 'Software Engg.');

INSERT INTO book_author VALUES
  (1,1),(1,2),(1,3), (2,4),(2,5), (3,6),(3,7), (4,1),(4,8),(4,9),
  (5,10), (6,11), (7,12),(7,13), (8,14);

-- 13 physical copies of 8 titles
INSERT INTO book_copy (book_id, barcode, shelf_location, acquired_on) VALUES
  (1,'LIB-0001','DB-A1','2024-06-01'), (1,'LIB-0002','DB-A1','2024-06-01'),
  (1,'LIB-0003','DB-A1','2025-01-10'), (2,'LIB-0004','DB-A2','2024-06-01'),
  (2,'LIB-0005','DB-A2','2024-06-01'), (3,'LIB-0006','AL-B1','2024-07-15'),
  (3,'LIB-0007','AL-B1','2024-07-15'), (4,'LIB-0008','OS-C1','2024-07-15'),
  (4,'LIB-0009','OS-C1','2024-07-15'), (5,'LIB-0010','NW-D1','2024-08-20'),
  (6,'LIB-0011','SE-E1','2024-08-20'), (7,'LIB-0012','SE-E1','2024-08-20'),
  (8,'LIB-0013','SE-E2','2024-08-20');

-- Loan history: (copy, member, issued N days ago, due N days ago, returned N days ago)
INSERT INTO loan (copy_id, member_id, issue_date, due_date, return_date)
SELECT copy_id, member_id,
       CURRENT_DATE - iss, CURRENT_DATE - due,
       CASE WHEN ret IS NULL THEN NULL ELSE CURRENT_DATE - ret END
FROM (VALUES
  -- returned loans
  ( 1, 1, 120, 106, 110), ( 2, 2, 115, 101, 103), ( 3, 3, 100,  86,  90),
  ( 1, 7,  95,  81,  85), ( 4, 2,  90,  76,  71), ( 6, 3,  88,  74,  75),
  ( 5, 6, 150, 136,  61), ( 1, 5,  80,  50,  40), (11, 1,  70,  56,  58),
  ( 2, 4,  60,  46,  47), ( 8, 3,  55,  41,  44), ( 3, 7,  50,  36,  30),
  (12, 5,  45,  15,  20), ( 1, 3,  39,  25,  28), ( 6, 1,  35,  21,  25),
  (11, 4,  34,  20,  21), ( 2, 1,  30,  16,  17),
  -- open loans (negative "due" = due in the future)
  ( 1, 1,  20,   6, NULL), ( 7, 4,  40,  26, NULL), ( 8, 8,  30,   9, NULL),
  (11, 2,  10,  -4, NULL), ( 2, 7,   5,  -9, NULL), (10, 5,  12, -18, NULL),
  ( 4, 3,   3, -11, NULL)
) AS h(copy_id, member_id, iss, due, ret)
ORDER BY iss DESC;

UPDATE book_copy SET status = 'ISSUED'
 WHERE copy_id IN (SELECT copy_id FROM loan WHERE return_date IS NULL);

-- Fines for the loans that were returned late
INSERT INTO fine (loan_id, member_id, days_late, amount, assessed_on, paid_amount, status)
SELECT l.loan_id, l.member_id, l.return_date - l.due_date,
       fn_calculate_fine(l.due_date, l.return_date, mc.fine_per_day, mc.max_fine_per_loan),
       l.return_date, 0, 'UNPAID'
FROM loan l JOIN member m USING (member_id) JOIN member_category mc USING (category_id)
WHERE l.return_date > l.due_date;

-- Two of those fines have already been paid
UPDATE fine SET paid_amount = amount, status = 'PAID' WHERE member_id IN (5, 7);

-- Every copy of 'Clean Code' (book 6) and 'Computer Networks' (book 5) is out
INSERT INTO reservation (book_id, member_id, reserved_at) VALUES
  (6, 3, now() - INTERVAL '2 days'),
  (6, 7, now() - INTERVAL '1 day'),
  (5, 1, now() - INTERVAL '1 day');
