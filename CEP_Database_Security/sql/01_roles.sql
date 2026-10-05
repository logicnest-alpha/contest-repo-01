-- =====================================================================
-- Secure Student Information System (SIS) : Roles
-- Run as a PostgreSQL superuser, connected to sis_db.
--   Group roles  (NOLOGIN) carry privileges.
--   Login roles  (LOGIN)   carry identity and inherit ONE group role.
-- Passwords below are for the lab demo only.
-- =====================================================================

-- Drop everything from a previous run (roles are cluster-wide)
DO $$
DECLARE r TEXT;
BEGIN
    FOREACH r IN ARRAY ARRAY['legacy_app','admin_ravi','fac_kumar','fac_rao',
                             'stu_25881a0501','stu_25881a0502','stu_25881a0401',
                             'acc_meena','aud_sharma',
                             'r_admin_office','r_faculty','r_student',
                             'r_accounts','r_auditor','sis_owner']
    LOOP
        IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = r) THEN
            EXECUTE format('DROP OWNED BY %I CASCADE', r);
            EXECUTE format('DROP ROLE %I', r);
        END IF;
    END LOOP;
END $$;

-- Owner of every object. Nobody logs in as the owner.
CREATE ROLE sis_owner NOLOGIN;

-- Group (functional) roles
CREATE ROLE r_admin_office NOLOGIN;   -- registrar / exam cell
CREATE ROLE r_faculty      NOLOGIN;   -- teaching staff
CREATE ROLE r_student      NOLOGIN;   -- students (self-service)
CREATE ROLE r_accounts     NOLOGIN;   -- fee section
CREATE ROLE r_auditor      NOLOGIN;   -- internal audit / DPO

-- Individual logins (one per human user)
CREATE ROLE admin_ravi      LOGIN PASSWORD 'Demo@Admin1' IN ROLE r_admin_office;
CREATE ROLE fac_kumar       LOGIN PASSWORD 'Demo@Fac1'   IN ROLE r_faculty;  -- CSE
CREATE ROLE fac_rao         LOGIN PASSWORD 'Demo@Fac2'   IN ROLE r_faculty;  -- ECE
CREATE ROLE stu_25881a0501  LOGIN PASSWORD 'Demo@Stu1'   IN ROLE r_student;
CREATE ROLE stu_25881a0502  LOGIN PASSWORD 'Demo@Stu2'   IN ROLE r_student;
CREATE ROLE stu_25881a0401  LOGIN PASSWORD 'Demo@Stu3'   IN ROLE r_student;
CREATE ROLE acc_meena       LOGIN PASSWORD 'Demo@Acc1'   IN ROLE r_accounts;
CREATE ROLE aud_sharma      LOGIN PASSWORD 'Demo@Aud1'   IN ROLE r_auditor;

-- The INSECURE baseline used only to show what an injection can do when an
-- application connects with owner rights (the common bad practice).
CREATE ROLE legacy_app      LOGIN PASSWORD 'Demo@Legacy' IN ROLE sis_owner;

-- Lock the database down: nobody gets anything by default
REVOKE ALL ON DATABASE sis_db FROM PUBLIC;
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
GRANT CONNECT ON DATABASE sis_db
      TO r_admin_office, r_faculty, r_student, r_accounts, r_auditor, legacy_app;
GRANT CREATE ON DATABASE sis_db TO sis_owner;
