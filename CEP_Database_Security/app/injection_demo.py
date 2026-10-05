"""
SQL injection demonstration for the Secure Student Information System.

  Part A  vulnerable code  + over-privileged account (legacy_app)  -> full compromise
  Part B  vulnerable code  + least-privilege account (a student)   -> damage contained
  Part C  parameterised code + input validation                    -> attack neutralised

Every change made by an attack is rolled back at the end of each part.

Usage:  python3 injection_demo.py           (sis_db on 127.0.0.1:5432)
Needs:  pip install psycopg2-binary
"""
import os
import re

import psycopg2

HOST = os.environ.get("PGHOST", "127.0.0.1")
DB = os.environ.get("PGDATABASE", "sis_db")

ROLL_NO = re.compile(r"[0-9]{2}881A[0-9]{2}[0-9A-Z]{2}")

PAYLOADS = {
    "tautology":    "' OR '1'='1",
    "union (keys)": "' UNION SELECT purpose, encode(key_bytes, 'hex'), NULL, NULL "
                    "FROM vault.data_key --",
    "stacked":      "'; UPDATE sis.marks SET external = 60; --",
}


def connect(user, password):
    return psycopg2.connect(host=HOST, dbname=DB, user=user, password=password)


# ----------------------------------------------------------------------
# VULNERABLE: the roll number typed by the user becomes part of the SQL
# ----------------------------------------------------------------------
def result_lookup_vulnerable(conn, roll_no):
    sql = ("SELECT roll_no, full_name, course_code, total "
           "FROM sis.v_marks_sheet WHERE roll_no = '" + roll_no + "'")
    with conn.cursor() as cur:
        cur.execute(sql)
        return cur.fetchall() if cur.description else []


# ----------------------------------------------------------------------
# FIXED: validate the format, then pass the value as a bound parameter
# ----------------------------------------------------------------------
def result_lookup_safe(conn, roll_no):
    if not ROLL_NO.fullmatch(roll_no):
        raise ValueError("invalid roll number format")
    with conn.cursor() as cur:
        cur.execute("SELECT roll_no, full_name, course_code, total "
                    "FROM sis.v_marks_sheet WHERE roll_no = %s", (roll_no,))
        return cur.fetchall()


def max_external(conn):
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FILTER (WHERE external = 60), count(*) FROM sis.marks")
        return cur.fetchone()


def show(label, fn, conn, payload):
    print(f"  [{label}] input = {payload!r}")
    try:
        rows = fn(conn, payload)
        print(f"    -> {len(rows)} row(s) returned")
        for r in rows[:6]:
            print("      ", r)
        if len(rows) > 6:
            print("       ...")
    except Exception as exc:                       # psycopg2.Error or ValueError
        msg = str(exc).strip().splitlines()[0]
        print(f"    -> REFUSED: {msg}")
        conn.rollback()


def part_a():
    print("\n=== PART A: vulnerable query, application connects as legacy_app (owner) ===")
    conn = connect("legacy_app", "Demo@Legacy")
    show("normal", result_lookup_vulnerable, conn, "25881A0501")
    for name, p in PAYLOADS.items():
        if name == "stacked":
            print(f"    marks with external=60 BEFORE: {max_external(conn)[0]}")
        show(name, result_lookup_vulnerable, conn, p)
        if name == "stacked":
            done, total = max_external(conn)
            print(f"    marks with external=60 AFTER : {done} of {total}  <-- every mark tampered")
    conn.rollback()
    conn.close()


def part_b():
    print("\n=== PART B: SAME vulnerable query, connected as student stu_25881a0501 ===")
    conn = connect("stu_25881a0501", "Demo@Stu1")
    for name, p in PAYLOADS.items():
        show(name, result_lookup_vulnerable, conn, p)
    conn.rollback()
    conn.close()


def part_c():
    print("\n=== PART C: parameterised query (+ format validation) ===")
    conn = connect("legacy_app", "Demo@Legacy")       # even with the WORST account
    with conn.cursor() as cur:
        sent = cur.mogrify("... WHERE roll_no = %s", (PAYLOADS["tautology"],))
        print(f"  SQL actually sent to the server: {sent.decode()}")
    show("normal", result_lookup_safe, conn, "25881A0501")
    for name, p in PAYLOADS.items():
        show(name, result_lookup_safe, conn, p)

    print("  Without the regex check the payload is still harmless - just a string:")
    with conn.cursor() as cur:
        cur.execute("SELECT count(*) FROM sis.v_marks_sheet WHERE roll_no = %s",
                    (PAYLOADS["tautology"],))
        print(f"    -> rows matching roll_no = {PAYLOADS['tautology']!r}: {cur.fetchone()[0]}")
    print(f"    marks with external=60: {max_external(conn)[0]} (unchanged)")
    conn.rollback()
    conn.close()


if __name__ == "__main__":
    part_a()
    part_b()
    part_c()
