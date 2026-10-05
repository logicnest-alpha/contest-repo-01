"""
Measures the performance cost of each security control in the Secure SIS.

Run as a PostgreSQL superuser AFTER loading sql/07_bench_data.sql, e.g.
    sudo -u postgres python3 benchmark.py
(or set PGHOST / PGUSER / PGPASSWORD for a superuser account).

The script switches identity with SET SESSION AUTHORIZATION / SET ROLE,
so each query runs exactly as that user would run it. Every change it
makes is rolled back.
"""
import os
import statistics
import time

import psycopg2

DB = os.environ.get("PGDATABASE", "sis_db")
N_QUERY = 200          # repetitions for read queries
N_BULK = 5             # repetitions for bulk statements
N_ROWS = 5000          # rows for the encryption tests

results = []


def run(cur, sql, params=None, fetch=True):
    cur.execute(sql, params)
    if fetch and cur.description:
        cur.fetchall()


def median_ms(cur, sql, params=None, n=N_QUERY, warmup=10):
    for _ in range(warmup):
        run(cur, sql, params)
    samples = []
    for _ in range(n):
        t0 = time.perf_counter()
        run(cur, sql, params)
        samples.append(time.perf_counter() - t0)
    return statistics.median(samples) * 1000


def as_user(cur, user):
    cur.execute("RESET ROLE; RESET SESSION AUTHORIZATION")
    if user == "owner":
        cur.execute("SET ROLE sis_owner")
    elif user:
        cur.execute(f"SET SESSION AUTHORIZATION {user}")


def record(control, baseline_label, base, secure_label, secure, unit="ms"):
    overhead = (secure - base) / base * 100
    results.append((control, baseline_label, base, secure_label, secure, overhead, unit))
    print(f"{control:<34} {base:9.3f} -> {secure:9.3f} {unit}  ({overhead:+.1f} %)")


def bench_rls(cur):
    q_base = "SELECT student_id, roll_no, full_name, email FROM sis.student WHERE dept_id = 1"
    q_rls = "SELECT student_id, roll_no, full_name, email FROM sis.student"
    as_user(cur, "owner")
    base = median_ms(cur, q_base)
    as_user(cur, "fac_kumar")
    secure = median_ms(cur, q_rls)
    record("RLS: faculty reads own dept", "owner + WHERE", base, "faculty + RLS", secure)

    # Without an index on the policy column the policy is checked on every
    # row; writing it as fn() instead of (SELECT fn()) then costs one
    # function call per row.
    as_user(cur, None)
    cur.execute("DROP INDEX sis.idx_student_dept")
    as_user(cur, "owner")
    base_seq = median_ms(cur, q_base, n=100)
    as_user(cur, "fac_kumar")
    hoisted = median_ms(cur, q_rls, n=100)
    as_user(cur, None)
    cur.execute("ALTER POLICY student_faculty ON sis.student USING (dept_id = sis.my_dept())")
    as_user(cur, "fac_kumar")
    naive = median_ms(cur, q_rls, n=50)
    as_user(cur, None)
    cur.connection.rollback()                      # restores index and policy
    record("RLS, no index, (SELECT fn())", "owner + WHERE", base_seq, "faculty + RLS", hoisted)
    record("RLS, no index, fn() per row", "owner + WHERE", base_seq, "faculty + RLS", naive)

    q_base = ("SELECT * FROM sis.v_marks_sheet WHERE course_code IN "
              "(SELECT course_code FROM sis.course WHERE faculty_id = 1)")
    as_user(cur, "owner")
    base = median_ms(cur, q_base)
    as_user(cur, "fac_kumar")
    secure = median_ms(cur, "SELECT * FROM sis.v_marks_sheet")
    record("RLS: faculty marks sheet", "owner + WHERE", base, "faculty + RLS", secure)
    as_user(cur, None)


def bench_encryption(cur):
    # runs as the superuser: the cost of pgcrypto does not depend on the role
    as_user(cur, None)
    cur.execute("CREATE TEMP TABLE t_plain (phone TEXT, aadhaar TEXT)")
    cur.execute("CREATE TEMP TABLE t_enc   (phone BYTEA, aadhaar BYTEA)")
    gen = f"FROM generate_series(1, {N_ROWS}) i"
    key = "(SELECT encode(key_bytes, 'hex') FROM vault.data_key WHERE purpose = 'ENC')"
    variants = {
        "plain":   f"INSERT INTO t_plain SELECT '9'||lpad(i::text,9,'0'), '8'||lpad(i::text,11,'0') {gen}",
        "s2k1":    f"INSERT INTO t_enc SELECT vault.enc('9'||lpad(i::text,9,'0')), "
                   f"vault.enc('8'||lpad(i::text,11,'0')) {gen}",
        "s2k3":    f"INSERT INTO t_enc SELECT pgp_sym_encrypt('9'||lpad(i::text,9,'0'), {key}, 'cipher-algo=aes256'), "
                   f"pgp_sym_encrypt('8'||lpad(i::text,11,'0'), {key}, 'cipher-algo=aes256') {gen}",
    }
    t = {}
    for name, sql in variants.items():
        samples = []
        for _ in range(N_BULK):
            cur.execute("TRUNCATE t_plain, t_enc")
            t0 = time.perf_counter()
            cur.execute(sql)
            samples.append(time.perf_counter() - t0)
        t[name] = statistics.median(samples) * 1e6 / N_ROWS     # microseconds per row
    record("Encrypt on write (AES-256)", "plaintext", t["plain"], "s2k-mode=1", t["s2k1"], "us/row")
    record("Encrypt on write, default S2K", "plaintext", t["plain"], "s2k-mode=3", t["s2k3"], "us/row")

    cur.execute("TRUNCATE t_plain, t_enc")
    cur.execute(variants["plain"])
    cur.execute(variants["s2k1"])
    base = median_ms(cur, "SELECT right(phone,4), right(aadhaar,4) FROM t_plain", n=20, warmup=2)
    secure = median_ms(cur, "SELECT right(vault.dec(phone),4), right(vault.dec(aadhaar),4) FROM t_enc",
                       n=20, warmup=2)
    record(f"Decrypt + mask {N_ROWS} rows", "plaintext", base, "decrypt", secure)
    cur.execute("DROP TABLE t_plain, t_enc")
    as_user(cur, None)


def bench_audit(cur):
    conn = cur.connection
    bulk = ("UPDATE sis.marks SET internal = (internal + 1) % 41 "
            "WHERE course_id = (SELECT course_id FROM sis.course WHERE course_code = 'CS301')")
    single = "UPDATE sis.marks SET internal = (internal + 1) %% 41 WHERE student_id = %s AND course_id = 1"
    cur.execute("SELECT student_id FROM sis.marks WHERE course_id = 1 ORDER BY student_id LIMIT 500")
    ids = [r[0] for r in cur.fetchall()]

    def timed(trigger_on):
        bulk_s, single_s = [], []
        for _ in range(N_BULK):
            as_user(cur, "owner")
            if not trigger_on:
                cur.execute("ALTER TABLE sis.marks DISABLE TRIGGER trg_audit_marks")
            t0 = time.perf_counter()
            cur.execute(bulk)
            bulk_s.append(time.perf_counter() - t0)
            n_rows = cur.rowcount
            t0 = time.perf_counter()
            for sid in ids:
                cur.execute(single, (sid,))
            single_s.append((time.perf_counter() - t0) / len(ids))
            conn.rollback()
        return statistics.median(bulk_s) * 1000, statistics.median(single_s) * 1000, n_rows

    b_off, s_off, n_rows = timed(False)
    b_on, s_on, _ = timed(True)
    record("Audit trigger: 1-row UPDATE", "no trigger", s_off, "audited", s_on)
    record(f"Audit trigger: {n_rows}-row UPDATE", "no trigger", b_off, "audited", b_on)


def bench_parameterised(cur):
    as_user(cur, "owner")
    cur.execute("SELECT roll_no FROM sis.student ORDER BY student_id LIMIT 500")
    rolls = [r[0] for r in cur.fetchall()]
    base_sql = "SELECT roll_no, full_name FROM sis.student WHERE roll_no = '{}'"
    safe_sql = "SELECT roll_no, full_name FROM sis.student WHERE roll_no = %s"

    def loop(fn):
        samples = []
        for _ in range(N_BULK):
            t0 = time.perf_counter()
            for r in rolls:
                fn(r)
            samples.append((time.perf_counter() - t0) / len(rolls))
        return statistics.median(samples) * 1000

    concat = loop(lambda r: run(cur, base_sql.format(r)))
    param = loop(lambda r: run(cur, safe_sql, (r,)))
    record("Parameterised query", "concatenated", concat, "parameterised", param)
    as_user(cur, None)


def main():
    conn = psycopg2.connect(dbname=DB)
    cur = conn.cursor()
    cur.execute("SELECT count(*) FROM sis.student")
    n_students = cur.fetchone()[0]
    cur.execute("SELECT count(*) FROM sis.marks")
    n_marks = cur.fetchone()[0]
    cur.execute("SHOW server_version")
    print(f"PostgreSQL {cur.fetchone()[0]}, {n_students} students, {n_marks} marks rows\n")
    conn.rollback()

    bench_rls(cur)
    conn.rollback()
    bench_encryption(cur)
    conn.rollback()
    bench_audit(cur)
    bench_parameterised(cur)
    conn.rollback()
    conn.close()


if __name__ == "__main__":
    main()
