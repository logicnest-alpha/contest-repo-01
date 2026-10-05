-- =====================================================================
-- Library Management System : Reporting queries
-- =====================================================================
SET search_path TO library;

-- Q1. Overdue books with the fine accrued so far
SELECT m.full_name                       AS member,
       mc.category_name                  AS category,
       b.title,
       c.barcode,
       l.due_date,
       CURRENT_DATE - l.due_date         AS days_overdue,
       fn_calculate_fine(l.due_date, CURRENT_DATE,
                         mc.fine_per_day, mc.max_fine_per_loan) AS fine_so_far
FROM loan l
JOIN book_copy c        ON c.copy_id      = l.copy_id
JOIN book b             ON b.book_id      = c.book_id
JOIN member m           ON m.member_id    = l.member_id
JOIN member_category mc ON mc.category_id = m.category_id
WHERE l.return_date IS NULL
  AND l.due_date < CURRENT_DATE
ORDER BY days_overdue DESC;

-- Q2. Most popular titles in the last 180 days (loans + people waiting)
SELECT RANK() OVER (ORDER BY COUNT(l.loan_id) DESC) AS rnk,
       b.title,
       COUNT(l.loan_id)                 AS times_issued,
       COUNT(DISTINCT l.member_id)      AS borrowers,
       (SELECT COUNT(*) FROM reservation r
         WHERE r.book_id = b.book_id AND r.status = 'WAITING') AS waiting
FROM book b
JOIN book_copy c ON c.book_id = b.book_id
JOIN loan l      ON l.copy_id = c.copy_id
WHERE l.issue_date >= CURRENT_DATE - 180
GROUP BY b.book_id, b.title
ORDER BY rnk, b.title
LIMIT 5;

-- Q3. Member-wise fines: assessed, paid, outstanding and still accruing
WITH assessed AS (
    SELECT member_id,
           SUM(amount)                                          AS total_assessed,
           SUM(paid_amount)                                     AS total_paid,
           SUM(amount - paid_amount) FILTER (WHERE status = 'UNPAID') AS outstanding
    FROM fine
    GROUP BY member_id
), accruing AS (
    SELECT l.member_id,
           SUM(fn_calculate_fine(l.due_date, CURRENT_DATE,
                                 mc.fine_per_day, mc.max_fine_per_loan)) AS accruing
    FROM loan l
    JOIN member m           ON m.member_id    = l.member_id
    JOIN member_category mc ON mc.category_id = m.category_id
    WHERE l.return_date IS NULL AND l.due_date < CURRENT_DATE
    GROUP BY l.member_id
)
SELECT m.member_id,
       m.full_name,
       COALESCE(a.total_assessed, 0)::NUMERIC(8,2)       AS assessed,
       COALESCE(a.total_paid, 0)::NUMERIC(8,2)           AS paid,
       COALESCE(a.outstanding, 0)::NUMERIC(8,2)          AS outstanding,
       COALESCE(x.accruing, 0)::NUMERIC(8,2)             AS accruing,
       (COALESCE(a.outstanding, 0) + COALESCE(x.accruing, 0))::NUMERIC(8,2) AS total_due
FROM member m
LEFT JOIN assessed a ON a.member_id = m.member_id
LEFT JOIN accruing x ON x.member_id = m.member_id
WHERE a.member_id IS NOT NULL OR x.member_id IS NOT NULL
ORDER BY total_due DESC, m.member_id;

-- Q4. Demand per copy - which titles need more copies?
SELECT b.title,
       v.total_copies,
       COUNT(l.loan_id)                                   AS loans_180d,
       v.queue_length,
       ROUND((COUNT(l.loan_id) + v.queue_length)::NUMERIC
             / NULLIF(v.total_copies, 0), 2)              AS demand_per_copy
FROM v_title_availability v
JOIN book b           ON b.book_id = v.book_id
LEFT JOIN book_copy c ON c.book_id = b.book_id
LEFT JOIN loan l      ON l.copy_id = c.copy_id
                     AND l.issue_date >= CURRENT_DATE - 180
GROUP BY b.title, v.total_copies, v.queue_length
ORDER BY demand_per_copy DESC
LIMIT 5;
