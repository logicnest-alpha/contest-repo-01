-- =====================================================================
-- Library Management System : End-to-end demonstration
-- Run:  psql -d library_db -f 05_demo.sql
-- Steps that break a rule raise an ERROR; psql prints it and carries on.
-- =====================================================================
SET search_path TO library;
\pset footer off
\set VERBOSITY terse

\echo '--- Availability before any action ---'
SELECT * FROM v_title_availability ORDER BY book_id;

\echo '--- (1) Normal issue: Priya (student) borrows LIB-0003 ---'
CALL sp_issue_book(3, 'LIB-0003');

\echo '--- (2) Borrowing-limit rule: Priya already has 2, gets a 3rd, 4th is refused ---'
CALL sp_issue_book(3, 'LIB-0009');
CALL sp_issue_book(3, 'LIB-0012');

\echo '--- (3) Overdue rule: Ananya has an overdue book ---'
CALL sp_issue_book(1, 'LIB-0013');

\echo '--- (4) Fine rule: Irfan owes Rs.150 (> Rs.100 limit) ---'
CALL sp_issue_book(6, 'LIB-0013');

\echo '--- (5) Reservation refused while a copy is on the shelf ---'
CALL sp_reserve_book(8, 8);

\echo '--- (6) All copies of Clean Code are out: queue before return ---'
SELECT r.reservation_id, m.full_name, r.status, r.reserved_at::date
FROM reservation r JOIN member m USING (member_id)
WHERE r.book_id = 6 ORDER BY r.reserved_at;

\echo '--- (7) Rahul returns Clean Code on time -> copy goes ON_HOLD for first in queue ---'
CALL sp_return_book('LIB-0011');

\echo '--- (8) Rahul tries to borrow it again: held for someone else ---'
CALL sp_issue_book(2, 'LIB-0011');

\echo '--- (9) Priya returns LIB-0009 and collects her held copy ---'
CALL sp_return_book('LIB-0009');
CALL sp_issue_book(3, 'LIB-0011');
SELECT r.reservation_id, m.full_name, r.status, c.barcode AS held_copy
FROM reservation r JOIN member m USING (member_id)
LEFT JOIN book_copy c ON c.copy_id = r.held_copy_id
WHERE r.book_id = 6 ORDER BY r.reserved_at;

\echo '--- (10) Late return: Kiran returns CLRS 26 days late ---'
CALL sp_return_book('LIB-0007');

\echo '--- (11) Irfan pays his Rs.150 fine and can borrow again ---'
SELECT fine_id AS irfan_fine FROM fine WHERE member_id = 6 \gset
CALL sp_pay_fine(:irfan_fine, 150);
CALL sp_issue_book(6, 'LIB-0013');

\echo '--- (12) Hold expiry: Dr. Lakshmi returns Computer Networks, Ananya does not collect ---'
CALL sp_return_book('LIB-0010');
UPDATE reservation SET hold_expires_on = CURRENT_DATE - 1      -- simulate 4 days passing
 WHERE book_id = 5 AND status = 'READY';
CALL sp_expire_holds();
SELECT barcode, status FROM book_copy WHERE barcode = 'LIB-0010';

\echo '--- Availability after the demo ---'
SELECT * FROM v_title_availability ORDER BY book_id;

\ir 04_queries.sql
