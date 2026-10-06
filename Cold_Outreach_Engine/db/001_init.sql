-- Cold Outreach Engine - database schema (PostgreSQL 14+)
-- Applied automatically on start-up by src/db.js (each file in db/ runs once).

CREATE TABLE settings (
  key         text PRIMARY KEY,
  value       jsonb NOT NULL,
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- sending infrastructure

CREATE TABLE domains (
  id              serial PRIMARY KEY,
  name            text NOT NULL UNIQUE CHECK (name = lower(name)),
  dkim_selector   text NOT NULL DEFAULT 'zmail',
  dns_report      jsonb,
  dns_checked_at  timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE mailboxes (
  id                     serial PRIMARY KEY,
  domain_id              int REFERENCES domains(id) ON DELETE SET NULL,
  email                  text NOT NULL UNIQUE CHECK (email = lower(email)),
  from_name              text NOT NULL DEFAULT '',
  -- sender: your Zoho mailboxes (warmup + campaigns)
  -- seed:   extra inboxes you own at other providers (Gmail etc.) that only
  --         receive warmup mail, rescue it from spam and reply. Never used for campaigns.
  role                   text NOT NULL DEFAULT 'sender' CHECK (role IN ('sender', 'seed')),
  provider               text NOT NULL DEFAULT 'zoho-com',
  smtp_host              text NOT NULL,
  smtp_port              int  NOT NULL DEFAULT 465,
  smtp_secure            boolean NOT NULL DEFAULT true,
  imap_host              text NOT NULL,
  imap_port              int  NOT NULL DEFAULT 993,
  username               text NOT NULL,
  password_enc           text NOT NULL,
  signature              text NOT NULL DEFAULT '',
  -- active: sends campaigns + warmup | paused: warmup only | error: nothing until fixed
  status                 text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'error')),
  status_reason          text,
  warmup_enabled         boolean NOT NULL DEFAULT true,
  warmup_started_on      date NOT NULL DEFAULT current_date,
  warmup_start_volume    int NOT NULL DEFAULT 3  CHECK (warmup_start_volume BETWEEN 1 AND 50),
  warmup_increment       int NOT NULL DEFAULT 2  CHECK (warmup_increment BETWEEN 0 AND 20),
  warmup_max_daily       int NOT NULL DEFAULT 35 CHECK (warmup_max_daily BETWEEN 1 AND 150),
  warmup_reply_rate      int NOT NULL DEFAULT 40 CHECK (warmup_reply_rate BETWEEN 0 AND 100),
  daily_campaign_limit   int NOT NULL DEFAULT 30 CHECK (daily_campaign_limit BETWEEN 0 AND 500),
  campaign_ramp          boolean NOT NULL DEFAULT true,
  first_campaign_send_on date,
  min_gap_minutes        int NOT NULL DEFAULT 8 CHECK (min_gap_minutes BETWEEN 1 AND 240),
  next_campaign_send_at  timestamptz,
  last_synced_at         timestamptz,
  last_error             text,
  last_error_at          timestamptz,
  error_count            int NOT NULL DEFAULT 0,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- IMAP sync position per folder
CREATE TABLE mailbox_folders (
  mailbox_id    int NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  path          text NOT NULL,
  uid_validity  text,
  last_uid      bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (mailbox_id, path)
);

-- Every warmup email (new conversations and replies)
CREATE TABLE warmup_messages (
  id               bigserial PRIMARY KEY,
  from_mailbox_id  int NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  to_mailbox_id    int NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  parent_id        bigint REFERENCES warmup_messages(id) ON DELETE SET NULL,
  depth            int NOT NULL DEFAULT 0,
  message_id       text NOT NULL UNIQUE,
  references_hdr   text,
  subject          text NOT NULL,
  body             text NOT NULL,
  -- queued -> sent -> inbox | spam | missing   (or failed)
  status           text NOT NULL DEFAULT 'queued'
                   CHECK (status IN ('queued', 'sent', 'failed', 'inbox', 'spam', 'missing')),
  error            text,
  sent_at          timestamptz,
  checked_at       timestamptz,
  reply_due_at     timestamptz,   -- when the receiving mailbox should answer this message
  replied          boolean NOT NULL DEFAULT false,
  created_at       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX warmup_status_idx   ON warmup_messages (status, sent_at);
CREATE INDEX warmup_from_idx     ON warmup_messages (from_mailbox_id, sent_at);
CREATE INDEX warmup_to_idx       ON warmup_messages (to_mailbox_id, sent_at);
CREATE INDEX warmup_reply_idx    ON warmup_messages (reply_due_at) WHERE reply_due_at IS NOT NULL AND NOT replied;

-- ---------------------------------------------------------------- leads

CREATE TABLE icp_profiles (
  id               serial PRIMARY KEY,
  name             text NOT NULL,
  titles           text[] NOT NULL DEFAULT '{}',   -- "founder", "head of marketing", ...
  industries       text[] NOT NULL DEFAULT '{}',
  locations        text[] NOT NULL DEFAULT '{}',   -- countries / cities
  keywords         text[] NOT NULL DEFAULT '{}',   -- matched against company, title, website text
  exclude_keywords text[] NOT NULL DEFAULT '{}',
  min_employees    int,
  max_employees    int,
  notes            text NOT NULL DEFAULT '',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE leads (
  id                bigserial PRIMARY KEY,
  email             text UNIQUE CHECK (email = lower(email)),   -- NULL until found (e.g. Google Maps businesses)
  first_name        text,
  last_name         text,
  title             text,
  company           text,
  company_domain    text,
  website           text,
  linkedin_url      text,
  phone             text,
  city              text,
  country           text,
  industry          text,
  employees         int,
  source            text NOT NULL DEFAULT 'manual',
  custom            jsonb NOT NULL DEFAULT '{}',
  icebreaker        text,
  enrichment        jsonb,
  enriched_at       timestamptz,
  email_status      text NOT NULL DEFAULT 'unknown' CHECK (email_status IN ('unknown', 'valid', 'risky', 'invalid')),
  email_check       jsonb,
  email_checked_at  timestamptz,
  icp_score         int,
  status            text NOT NULL DEFAULT 'new'
                    CHECK (status IN ('new', 'contacted', 'replied', 'interested', 'meeting',
                                      'not_interested', 'unsubscribed', 'bounced')),
  tags              text[] NOT NULL DEFAULT '{}',
  notes             text NOT NULL DEFAULT '',
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX leads_tags_idx    ON leads USING gin (tags);
CREATE INDEX leads_domain_idx  ON leads (company_domain);
CREATE INDEX leads_status_idx  ON leads (status);

-- Never email these (emails or whole domains)
CREATE TABLE suppressions (
  value       text PRIMARY KEY CHECK (value = lower(value)),
  kind        text NOT NULL CHECK (kind IN ('email', 'domain')),
  reason      text NOT NULL DEFAULT '',
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------- campaigns

CREATE TABLE campaigns (
  id                     serial PRIMARY KEY,
  name                   text NOT NULL,
  status                 text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  timezone               text NOT NULL DEFAULT 'Asia/Kolkata',
  send_days              int[] NOT NULL DEFAULT '{1,2,3,4,5}',   -- ISO weekday, 1 = Monday
  window_start           time NOT NULL DEFAULT '09:00',
  window_end             time NOT NULL DEFAULT '17:00',
  daily_limit            int NOT NULL DEFAULT 100 CHECK (daily_limit >= 0),
  stop_on_reply          boolean NOT NULL DEFAULT true,
  stop_on_company_reply  boolean NOT NULL DEFAULT true,
  allow_risky            boolean NOT NULL DEFAULT false,
  allow_unverified       boolean NOT NULL DEFAULT false,
  unsubscribe_header     boolean NOT NULL DEFAULT true,
  created_at             timestamptz NOT NULL DEFAULT now(),
  started_at             timestamptz
);

CREATE TABLE campaign_mailboxes (
  campaign_id  int NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  mailbox_id   int NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  PRIMARY KEY (campaign_id, mailbox_id)
);

CREATE TABLE campaign_steps (
  id           serial PRIMARY KEY,
  campaign_id  int NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  step_no      int NOT NULL CHECK (step_no >= 1),
  delay_days   int NOT NULL DEFAULT 3 CHECK (delay_days BETWEEN 0 AND 60),
  subject      text NOT NULL DEFAULT '',     -- empty on a follow-up = reply in the same thread
  body         text NOT NULL,
  UNIQUE (campaign_id, step_no)
);

CREATE TABLE campaign_leads (
  id                 bigserial PRIMARY KEY,
  campaign_id        int NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
  lead_id            bigint NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
  mailbox_id         int REFERENCES mailboxes(id) ON DELETE SET NULL,   -- sticky sender for the thread
  steps_sent         int NOT NULL DEFAULT 0,
  next_send_at       timestamptz,
  status             text NOT NULL DEFAULT 'active'
                     CHECK (status IN ('active', 'completed', 'replied', 'bounced', 'unsubscribed', 'stopped', 'failed')),
  stop_reason        text,
  thread_message_id  text,
  last_message_id    text,
  references_hdr     text,
  thread_subject     text,
  last_sent_at       timestamptz,
  replied_at         timestamptz,
  created_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, lead_id)
);
CREATE INDEX campaign_leads_due_idx ON campaign_leads (campaign_id, status, next_send_at);
CREATE INDEX campaign_leads_lead_idx ON campaign_leads (lead_id);

-- ---------------------------------------------------------------- unified inbox

-- Campaign mail we sent, replies we sent from the inbox, and real mail we received.
-- Warmup traffic lives only in warmup_messages.
CREATE TABLE messages (
  id                bigserial PRIMARY KEY,
  mailbox_id        int NOT NULL REFERENCES mailboxes(id) ON DELETE CASCADE,
  direction         text NOT NULL CHECK (direction IN ('in', 'out')),
  message_id        text NOT NULL,
  in_reply_to       text,
  references_hdr    text,
  thread_key        text NOT NULL,
  from_email        text,
  from_name         text,
  to_email          text,
  cc                text,
  subject           text NOT NULL DEFAULT '',
  body_text         text NOT NULL DEFAULT '',
  snippet           text NOT NULL DEFAULT '',
  lead_id           bigint REFERENCES leads(id) ON DELETE SET NULL,
  campaign_id       int REFERENCES campaigns(id) ON DELETE SET NULL,
  campaign_lead_id  bigint REFERENCES campaign_leads(id) ON DELETE SET NULL,
  step_no           int,
  folder            text,
  imap_uid          bigint,
  was_spam          boolean NOT NULL DEFAULT false,
  is_read           boolean NOT NULL DEFAULT true,
  is_auto_reply     boolean NOT NULL DEFAULT false,
  is_bounce         boolean NOT NULL DEFAULT false,
  category          text,
  sent_at           timestamptz NOT NULL DEFAULT now(),
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (mailbox_id, message_id)
);
CREATE INDEX messages_thread_idx  ON messages (thread_key, sent_at);
CREATE INDEX messages_msgid_idx   ON messages (message_id);
CREATE INDEX messages_dir_idx     ON messages (direction, sent_at);
CREATE INDEX messages_lead_idx    ON messages (lead_id);

-- ---------------------------------------------------------------- activity + background tasks

CREATE TABLE events (
  id           bigserial PRIMARY KEY,
  ts           timestamptz NOT NULL DEFAULT now(),
  level        text NOT NULL DEFAULT 'info' CHECK (level IN ('info', 'warn', 'error')),
  kind         text NOT NULL,
  mailbox_id   int,
  campaign_id  int,
  lead_id      bigint,
  message      text NOT NULL
);
CREATE INDEX events_ts_idx ON events (ts DESC);

CREATE TABLE tasks (
  id           bigserial PRIMARY KEY,
  kind         text NOT NULL,
  label        text NOT NULL,
  status       text NOT NULL DEFAULT 'running' CHECK (status IN ('running', 'done', 'failed')),
  progress     int NOT NULL DEFAULT 0,
  total        int NOT NULL DEFAULT 0,
  result       jsonb,
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  finished_at  timestamptz
);
