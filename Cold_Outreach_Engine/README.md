# Cold Outreach Engine

A self-hosted cold-email system for client acquisition, built around **deliverability**.
It runs your Zoho mailboxes from one place:

| Area | What it does |
|------|--------------|
| **Mailboxes & domains** | Connects any number of Zoho (or Gmail / other IMAP) mailboxes over SMTP + IMAP. Tests the login before saving. Checks every domain's **MX, SPF, DKIM, DMARC and blocklists** and shows the exact DNS record to add when something is missing. |
| **Self-warmup** | Your mailboxes email each other with natural, varied conversations. Volume ramps up slowly (3/day, +2/day, up to 35/day by default). The receiving mailbox logs in, finds each email, **moves it out of Spam**, marks it read or important, files it into a `Warmup` folder and replies to about 40%. Every warmup email is tracked as Inbox, Spam or Missing, so you get a live **inbox-placement score** per mailbox. |
| **Seed inboxes** | Add 1-3 Gmail accounts you own as warmup partners, so Gmail (where most prospects are) learns to trust your domains as well, not just Zoho. |
| **Campaigns** | Multi-step sequences (plain text), `{{variables|fallbacks}}`, `{spin|tax}`, rotation across mailboxes, random gaps between sends, per-mailbox daily caps that ramp up, sending window and days in the prospect's time zone. Follow-ups stay in the same thread. |
| **Guard rails** | Emails only verified addresses by default. Never sends with an empty variable ("Hi ,"). Built-in content checker (spam words, links, caps, length…). Auto-pauses a mailbox when its bounce rate or spam placement crosses a limit. Global do-not-contact list. Opt-out line + `List-Unsubscribe` header. |
| **Unified inbox** | Every reply from every mailbox in one list. Replies stop the sequence (and optionally colleagues at the same company). Out-of-office replies don't stop it. Bounces and "unsubscribe" replies are handled automatically. **Lead replies that landed in your Spam are rescued.** You reply from the same mailbox, in the thread. Categories: interested, question, not interested, … |
| **Lead sourcing** | ICP profiles with a 0-100 fit score · CSV import (Apollo, Clay, Sales Nav tools, Sheets…) · **Apollo** people search + email reveal · **Google Maps** businesses (Places API) · **Hunter** people-at-domain + email finder + verification · **website enrichment** (emails, phone, socials, tech stack and summary from the company's own site). |
| **AI (optional)** | With an Anthropic API key, Claude categorises replies, writes a personal first line from each prospect's website (`{{icebreaker}}`) and suggests replies in the inbox. Everything else works without it. |

Stack: Node.js 20+ / Express, PostgreSQL 14+, plain JavaScript frontend. Same structure as the Restaurant OMS app in this repo.

---

## 1. Before you start: what actually decides deliverability

Read this once. The software can only enforce it.

1. **Never cold-email from your main domain.** Use separate domains that look like your brand (`getbrand.com`, `brandhq.in`, `trybrand.co`) and forward their website to your real site. If yours are *subdomains* (`mail.brand.com`), they work, but some filters judge them partly by the parent domain, so complaints can touch your main domain too.
2. **2-3 mailboxes per domain, about 30 cold emails per mailbox per day.** With 3 domains and 5 mailboxes, a safe ceiling is about **150 cold emails/day** once everything is warmed up. To send more, add domains and mailboxes, don't raise the per-mailbox limits.
3. **Warm up 14-21 days before the first campaign, and keep warmup on afterwards.** The app blocks campaigns until a mailbox has warmed for `min warmup days` (Settings, default 14).
4. **Keep bounces under 2%.** Verify every list (built-in check plus Hunter). Bounces hurt reputation faster than anything else.
5. **Write like a person.** Plain text, 50-125 words, no links or images in the first email, one question. The editor scores each email as you type.
6. **Know the limits of self-warmup.** If all your mailboxes are Zoho, warmup between them mostly trains Zoho's filters. Adding Gmail **seed inboxes** helps a lot. The placement score is a strong signal, not a guarantee for every prospect's server. Also send a real test (Campaign › *Send test to me*) to a Gmail and an Outlook address before launching.
7. **Zoho is a business mailbox, not a bulk sender.** Zoho enforces its own sending limits and may suspend accounts for spam complaints. Low, steady, relevant volume is the only safe way to use it.

---

## 2. Set up Zoho (once per domain)

1. **Plan:** you need **Zoho Mail Lite or higher**. The *Forever Free* plan has **no IMAP**, and this system needs IMAP to read replies and run warmup.
2. **Add each domain** in Zoho Admin Console › Domains and verify it.
3. **DNS records** at your domain registrar (Zoho shows the exact values for your data centre):

   | Type | Host | Value (example for zoho.in) |
   |------|------|-------------------|
   | MX | `@` | `mx.zoho.in` (10), `mx2.zoho.in` (20), `mx3.zoho.in` (50) |
   | TXT (SPF) | `@` | `v=spf1 include:zohomail.in ~all` |
   | TXT (DKIM) | `zmail._domainkey` | the key from Admin Console › Domains › Email Configuration › DKIM, then click **Verify** so Zoho signs your mail |
   | TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain; fo=1` (move to `p=quarantine` after a few clean weeks) |

   The **Domains & mailboxes** page checks all of this and tells you exactly what's missing.
4. **Create the mailboxes** (real names: `vishal@`, `priya@`, not `sales@`) and give each a profile photo and a short signature.
5. In **each** mailbox: Settings › Mail Accounts › **IMAP Access: on**.
6. If you use two-factor login, create an **application-specific password** (Zoho Accounts › Security › App Passwords) and use that in this app.

Server presets for Zoho organisation accounts are built in: `smtppro.zoho.<region>:465` and `imappro.zoho.<region>:993`. Pick the region you log in at (zoho.in, zoho.com, zoho.eu …).

**Seed inboxes (recommended):** create 1-3 regular Gmail accounts, turn on 2-step verification, create an app password (Google Account › Security › App passwords), and connect them as **Seed inbox** with the *Gmail* preset.

---

## 3. Run it

```bash
cd Cold_Outreach_Engine
npm install
cp .env.example .env      # then fill in DATABASE_URL, APP_SECRET, ADMIN_EMAIL, ADMIN_PASSWORD
npm start                 # http://localhost:3000, creates the tables on first start
npm test                  # unit tests (no database or mail server needed)
```

- **Database:** any PostgreSQL 14+. A free Supabase project works: click **Connect** in your project, choose the **Session pooler** connection string (port 5432) and put your database password in it. Don't use the *Transaction pooler* (port 6543): the background engines keep a long-lived lock that needs a session connection.
- **`APP_SECRET`:** at least 32 random characters. It encrypts the stored mailbox passwords and API keys. Don't change it later.

### Hosting: it must run 24/7

Warmup, sending and inbox sync run in the background inside the server process, so the app has to stay on:

- **Your own always-on PC / mini-PC / Raspberry Pi**, or
- **a small VPS**, or a paid instance on Render / Railway / Fly. Outbound ports 465/587 must be open. **Render's free tier blocks outbound SMTP ports and sleeps when idle**, so it won't work. Some VPS providers block SMTP on new accounts until you ask.

Only one copy runs the engines (it holds a Postgres lock). Extra copies serve the UI only. You can force that with `ENGINES=off`.

Optional `PUBLIC_URL=https://your-app-url` adds a one-click unsubscribe link (RFC 8058). Without it, the `List-Unsubscribe` header uses `mailto:`, which the inbox sync also handles.

---

## 4. Day-to-day workflow

1. **Domains & mailboxes:** connect your 5 Zoho mailboxes (+ seeds). Fix anything red in the DNS check.
2. **Warmup:** watch inbox placement climb for 2-3 weeks. Investigate any mailbox below about 85%.
3. **Lead finder › ICP profiles:** describe who you sell to (titles, industries, locations, size, keywords, exclusions).
4. **Find leads:** Apollo (people by title/location/size), Google Maps (local businesses, then *find emails on their websites*), Hunter (people at your target-account domains), or **Leads › Import CSV**.
5. **Leads:** *Verify emails* → *Enrich from website* (+ AI first line) → *ICP score* → tag the batch.
6. **Campaigns › New:** pick mailboxes, set the schedule in your prospects' time zone, write 2-4 short steps, check the preview and the deliverability score, *Send test to me*, add leads (by tag, valid emails, minimum ICP score), **Launch**.
7. **Unified inbox:** reply to interested leads, mark meetings, let the system handle bounces, unsubscribes and out-of-office.
8. **Dashboard:** reply rate, bounce rate, inbox placement, mailbox health. A mailbox that crosses your limits is **auto-paused** for campaigns while warmup continues.

### Personalisation cheat-sheet

```
{Hi|Hello|Hey} {{first_name|there}},

{{icebreaker|Saw that {{company}} is growing in {{city|your area}}.}}

We help [who] [get result] without [pain]. [one line of proof]

Worth a quick chat?

{{sender_first_name}}
```

Variables: `first_name last_name full_name email company company_full title city country industry website domain icebreaker sender_name sender_first_name day signature`, plus any extra CSV column as `{{column_name}}` or `{{custom.column_name}}` (snake_case, so "Pain Point" becomes `{{pain_point}}`).
A variable with no value and no fallback skips that lead instead of sending a broken email.

---

## 5. Lead sources: keys and costs

| Source | Key from | Notes |
|--------|----------|-------|
| Apollo.io | Settings › Integrations › API (needs a plan with API access) | Search is free and doesn't return emails. *Reveal emails & import* uses 1 credit per person. |
| Google Places | Google Cloud Console › enable **Places API (New)** › API key | Max 60 results per search, so run several narrow searches. Billed by Google per request. |
| Hunter.io | hunter.io › API | Domain search, email finder, and **mailbox-level verification** (otherwise only syntax/MX/disposable/role checks run). |
| Anthropic | console.anthropic.com | Optional AI features. Model is selectable in Settings. |

Keys can be pasted in **Settings › Integrations** (stored encrypted) or set as environment variables.
LinkedIn scraping is intentionally not included: it breaks LinkedIn's terms and gets accounts banned. Use CSV exports from tools that license that data (Apollo etc.) instead.

---

## 6. Compliance

Cold B2B email is legal in many places if you identify yourself, are relevant, and honour opt-outs immediately. The system helps with:
an opt-out line in every email; `List-Unsubscribe` header; replies like "unsubscribe / remove me / stop" add the person to the do-not-contact list automatically; a global email + domain suppression list; an optional postal address footer (required by US CAN-SPAM).
For EU/UK prospects (GDPR) you need a legitimate-interest basis and must tell people where you got their data if they ask. India's DPDP Act also applies to personal data. You're responsible for how you use the tool.

---

## 7. How it works

```
             ┌──────────── web UI (public/) ────────────┐
             │ dashboard · inbox · campaigns · leads ·  │
             │ lead finder · mailboxes · warmup · settings
             └───────────────┬──────────────────────────┘
                             │ /api (src/api)
 ┌───────────────────────────┴──────────────────────────────────┐
 │ PostgreSQL: mailboxes, domains, warmup_messages, leads,       │
 │ campaigns, campaign_steps, campaign_leads, messages, events…  │
 └───────────────────────────┬──────────────────────────────────┘
                             │ scheduler (one leader via advisory lock)
   every 1 min   campaigns     → sender.js     SMTP send, caps, gaps, windows, threads
   every 1 min   warmup-send   → warmup.js     new warmup emails + due replies
   every 3 min   warmup-check  → warmup.js     IMAP: find, rescue from spam, flag, file, schedule reply
   every 4 min   inbox-sync    → sync.js       IMAP: replies, bounces, unsubscribes, spam rescue
   every 15 min  health        → health.js     health score, auto-pause
   every hour    dns           → health.js     MX / SPF / DKIM / DMARC / blocklists
```

```
src/
  config.js settings.js util.js db.js auth.js tasks.js ai.js unsubscribe.js
  mail/     providers (Zoho presets) · smtp · imap · compose (variables, spintax, threading) · spamcheck · dns
  engine/   scheduler · warmup (+ warmup-content) · sender · sync · classify · health
  leads/    store (upsert/merge) · verify · enrich (website crawler) · icp · suppress
  leads/sources/  csv · apollo · hunter · places
  api/      mailboxes · leads · campaigns · inbox · misc
db/001_init.sql   schema (applied automatically)
public/           index.html, css/style.css, js/app.js, js/core.js, js/views/*
test/             unit tests (node --test)
```

**Tested** end to end against a real IMAP server (Dovecot) and an SMTP server that simulates spam placement and bounces: warmup sending, spam rescue and threaded replies; CSV import; campaign sending with caps, rotation and a rejected address; prospect replies (interested / unsubscribe / out-of-office); a DSN bounce; a lead reply rescued from Spam; follow-ups threaded under the first email; replying from the unified inbox. The Apollo, Hunter, Google Places and Anthropic integrations follow their documented APIs but were not called with live keys.
