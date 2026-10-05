# A9511 Database Management Systems - Batch No. 6

| Roll No.   | Name                 |
|------------|----------------------|
| 25881A05V7 | Madhavarapu Saritha  |
| 25881A05X9 | Chepyala Vishal      |
| 25881A05X0 | Gundu Srijay Krishna |

Both reports follow the department LaTeX template (`Main.tex` + `College Logo RGB.jpg`).
Each folder can be uploaded to Overleaf as it is; the compiled `Main.pdf` is included.

| Folder | Report type | Topic |
|--------|-------------|-------|
| [`Case_Study_Library_Management/`](Case_Study_Library_Management) | Case Study | Database Design for a Library Management System: Resource Tracking, Lending Operations, and Fine Administration |
| [`CEP_Database_Security/`](CEP_Database_Security) | Complex Engineering Problem | Database Security and Privacy Engineering for Sensitive Information Systems |
| [`Course_End_Project_Restaurant_OMS/`](Course_End_Project_Restaurant_OMS) | Course End Project | Restaurant Order Management System (live full-stack web app) |

All SQL was written for and tested on **PostgreSQL 16** (works on 15+).
Every output quoted in the reports was produced by running these scripts.

---

## 1. Library Management System (Case Study)

```
Case_Study_Library_Management/
  Main.tex, Main.pdf, College Logo RGB.jpg
  sql/01_schema.sql        tables, constraints, partial unique indexes, availability view
  sql/02_procedures.sql    fn_calculate_fine, sp_issue_book, sp_return_book,
                           sp_reserve_book, fn_allocate_copy, sp_expire_holds, sp_pay_fine
  sql/03_sample_data.sql   8 members, 8 titles, 13 copies, 24 loans (dates relative to today)
  sql/04_queries.sql       overdue, popular titles, member-wise fines, demand per copy
  sql/05_demo.sql          13 test scenarios + runs the queries
```

Run:

```bash
createdb library_db
cd Case_Study_Library_Management/sql
psql -d library_db -f 01_schema.sql -f 02_procedures.sql -f 03_sample_data.sql
psql -d library_db -f 05_demo.sql        # rule violations print as ERROR lines - that is expected
```

## 2. Database Security and Privacy Engineering (CEP)

```
CEP_Database_Security/
  Main.tex, Main.pdf, College Logo RGB.jpg
  sql/01_roles.sql           group roles, personal logins, lock-down of PUBLIC
  sql/02_schema.sql          tables, key vault, AES-256 encryption + HMAC blind index
  sql/03_sample_data.sql     6 synthetic students, courses, marks, fees
  sql/04_access_control.sql  column grants, row-level security, masked / invoker views
  sql/05_audit.sql           append-only audit log, change triggers, break-glass PII reveal
  sql/06_verify.sql          logs in as every role and tests allowed / forbidden actions
  sql/07_bench_data.sql      20,000 extra students for the performance tests
  app/injection_demo.py      SQL injection: vulnerable vs least-privilege vs parameterized
  app/benchmark.py           measures the overhead of RLS, encryption, auditing
```

Run (needs a superuser, because the scripts create roles; `pip install psycopg2-binary`):

```bash
sudo -u postgres createdb sis_db
cd CEP_Database_Security
for f in sql/0[1-5]_*.sql; do sudo -u postgres psql -d sis_db -v ON_ERROR_STOP=1 -f "$f"; done
sudo -u postgres psql -d sis_db -f sql/06_verify.sql     # expected refusals print as ERROR
python3 app/injection_demo.py                            # connects to 127.0.0.1 with demo passwords
sudo -u postgres psql -d sis_db -f sql/07_bench_data.sql
sudo -u postgres python3 app/benchmark.py                # or set PGHOST/PGUSER/PGPASSWORD
```

On Windows use `psql -U postgres ...` and set `PGUSER=postgres` / `PGPASSWORD=...` before
running `benchmark.py`. The passwords in `01_roles.sql` are demo values only.
Timings depend on the machine; the relative results (which controls are cheap and which
are expensive) stay the same.

## 3. Restaurant Order Management System (Course End Project)

**Live:** https://spice-route-rms.onrender.com  (free hosting: the first visit after
15 idle minutes takes up to a minute to wake the server)

Logins: `manager / manager123`, `waiter / waiter123`, `chef / chef123`, `cashier / cashier123`

```
Course_End_Project_Restaurant_OMS/
  Main.tex, Main.pdf, College Logo RGB.jpg, screenshots/   report
  app/                                                      the application (see app/README.md)
    db/        PostgreSQL schema, triggers, functions, demo data, grants
    src/       Express API (auth, routes, DB pool)
    public/    frontend (HTML/CSS/JS, Chart.js)
    scripts/   init-db.js, smoke-test.js
```

Stack: PostgreSQL 17 (Supabase) + Node.js 22 / Express (Render) + vanilla JavaScript.
