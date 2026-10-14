# Cold Email Playbook

Companion to Episode 004, *The Reality of Cold Outreach*. This is what I'm learning and testing
while building in public. It isn't a results report. When I have real numbers, they'll go in a
future episode, good or bad.

---

## 1. The setup: do this before writing a single email

Most cold emails fail before anyone reads them, because the mailbox they come from isn't trusted.
Fix that first.

### 1.1 Get a separate sending domain
- Buy a domain that looks like your brand but isn't your main one.
  Main: `yourbrand.com` → sending: `getyourbrand.com`, `yourbrandhq.com`, `tryyourbrand.com`.
- Point (redirect) the sending domain to your real website so it looks legitimate if someone checks.
- **Never send cold email from your main domain.** If it gets flagged, your normal email
  (customers, college, everything) suffers too.

### 1.2 Create real inboxes
- Use Google Workspace or Microsoft 365 on the sending domain, not free Gmail.
- Use 2–3 inboxes per domain, each with a real name: `vishal@getyourbrand.com`.
- Add a profile photo and a short, plain signature: name, role, website. No images or banners.

### 1.3 Authenticate the domain (SPF, DKIM, DMARC)
Gmail, Yahoo and Outlook now expect authenticated mail and filter mail that isn't.
Add these as DNS records wherever you bought the domain.

| Record | Host / name | Value (example) | What it does |
|---|---|---|---|
| **SPF** (TXT) | `@` | Google: `v=spf1 include:_spf.google.com ~all` · Microsoft: `v=spf1 include:spf.protection.outlook.com -all` | Lists who is allowed to send for your domain |
| **DKIM** (TXT) | `google._domainkey` (Google) or the CNAMEs Microsoft gives you | Generated in your Google Admin / Microsoft 365 admin panel | Signs every email so receivers can prove it wasn't changed |
| **DMARC** (TXT) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@getyourbrand.com` | Tells receivers what to do when SPF/DKIM fail, and sends you reports |

- Have only **one** SPF record per domain. If you add a second sending tool, merge it into the same record.
- Start DMARC at `p=none`. After a few clean weeks, move to `p=quarantine`.
- Check everything with a free tool such as MXToolbox, or send a test to mail-tester.com.

### 1.4 Warm up for about 2 weeks
New inboxes have no reputation. Warm-up builds it with slow, real-looking activity:
- Turn on a warm-up tool. Most sending tools (Instantly, Smartlead, lemlist) include one.
- During warm-up, also send a few real emails by hand to people you know, and reply to them.
- Leave warm-up running in the background after you start campaigns.

### 1.5 Sending limits
| Week | Cold emails per inbox per day |
|---|---|
| 1–2 | 0 (warm-up only) |
| 3 | 10 |
| 4 | 20 |
| 5+ | 30, and rarely more than 40–50 |

Need more volume? Add inboxes and domains. Don't push one inbox harder.

### 1.6 Turn tracking off
- **Open tracking off.** It adds an invisible image that spam filters notice, and Apple Mail
  privacy makes open rates unreliable anyway. Measure **replies**.
- **No links in the first email.** If you must link later, use a custom tracking domain.

---

## 2. Build the list

- **Define who exactly.** Write one sentence: *"[Role] at [type of company] with [size] who [visible situation]."*
  Example: "Founders of 5–20 person agencies who are hiring their first salesperson."
- **Where to find them:** LinkedIn (Sales Navigator if you have it), Apollo, company websites,
  job boards (hiring = a visible need), directories, communities.
- **Verify every email** before sending (ZeroBounce, NeverBounce, MillionVerifier or similar).
  Keep bounces **under 2%**. Bounces damage your reputation faster than bad copy.
- **Add one personal detail per lead** in a spreadsheet column (`first_line`): something true and
  specific about them. No detail, no email.
- Work email addresses only, and only people whose job makes your email relevant.

---

## 3. The email

### Rules
1. **Under 80 words.** Readable on a phone without scrolling.
2. **Plain text.** No images, no attachments, no links in email #1.
3. **Line 1 is about them**, something true and specific, not "I hope this finds you well."
4. **Name one problem** you think they have. One, not three.
5. **Ask a small question**, not for a meeting. "Worth a look?" beats "Can we hop on a 30-min call?"
6. **No fake familiarity.** No "Re:" or "Fwd:" tricks, no fake urgency, no claims you can't back up.
7. **Subject lines:** 2–5 words, lowercase, sounds like a colleague wrote it.

### Script A: Observation → Problem → Small ask (main template)
> **Subject:** quick question about {{topic}}
>
> Hi {{first_name}}, {{first_line, something true and specific about them}}.
>
> Usually that means {{the problem it creates}}.
>
> I'm building {{what you do, in one plain sentence}} for exactly that. Worth a look?
>
> {{your_name}}

**Filled example:**
> **Subject:** quick question about hiring
>
> Hi Ananya, saw you're hiring three support reps this month.
>
> Usually that means tickets are piling up faster than the team can answer.
>
> I'm building a small tool that drafts first replies to common tickets. Worth a look?
>
> Vishal

### Script B: The honest student (for when you have no results yet)
Use this for problem interviews. It's the best way to find out what to build.
> **Subject:** 10 minutes of your experience?
>
> Hi {{first_name}}, I'm a 19-year-old CS student trying to build something useful for
> {{their type of business}}, and I noticed {{specific observation}}.
>
> I'm not selling anything yet. I'd like to understand how you handle {{problem area}} today.
>
> Would you be open to answering 3 quick questions by email?
>
> {{your_name}}

### Script C: The right person
> **Subject:** who handles {{area}}?
>
> Hi {{first_name}}, I'm trying to reach whoever owns {{area}} at {{company}}.
> Is that you, or is there someone better to ask?
>
> {{your_name}}

### Script D: Resource first
> **Subject:** {{topic}} checklist
>
> Hi {{first_name}}, {{first_line}}.
>
> I put together a one-page checklist on {{problem}}, the same one I use myself.
> Want me to send it over?
>
> {{your_name}}

### Subject line bank
`quick question about {{topic}}` · `{{company}} + {{topic}}` · `idea for {{company}}` ·
`{{mutual thing}}` · `10 minutes of your experience?` · `who handles {{area}}?`

---

## 4. Follow-ups

Most replies come from follow-ups, so send 3, a few days apart. **Each one adds something new.**
Never just "bumping this to the top." Reply in the same thread.

**Day 4: new angle**
> Hi {{first_name}}, one more thought: {{a different angle on the same problem, or a short example}}.
> Would that be useful for {{company}}?

**Day 8: something useful**
> Hi {{first_name}}, no pitch this time. Here's {{a short tip / resource summary in plain text}}.
> Hope it helps either way.

**Day 14: close the loop**
> Hi {{first_name}}, I don't want to clutter your inbox. Should I stop reaching out about this?
> Either answer is completely fine.

---

## 5. Handling replies

| Reply | What to do |
|---|---|
| Interested | Answer the question they asked, then offer two specific times or a short Loom. |
| "Not now" | Thank them, ask if you can check back in a set number of months, note it, and do it. |
| "Who are you / how did you get my email?" | Be honest: say where you found them, and offer to remove them. |
| "Unsubscribe" / "stop" | Remove them immediately and never email them again. No arguments. |
| Wrong person | Thank them, ask who the right person is (Script C). |

---

## 6. Metrics: what to watch and what to change

| Metric | Healthy | If it's bad |
|---|---|---|
| Bounce rate | under 2% | Verify the list again; change your data source |
| Spam complaints | as close to 0 as possible (Gmail flags anything near 0.3%) | Stop, re-check targeting and copy, slow down |
| Reply rate | track it per campaign; compare against your own past campaigns | Problem with the list or the offer, not the subject line |
| Positive replies | the number that matters | Clarify the problem you solve; tighten who you target |

Change **one thing at a time** (list, first line, problem, or ask), and send about 100 emails per
version before judging it.

---

## 7. Stay legal and decent
*Not legal advice. Check the rules for the countries you email.*
- **US (CAN-SPAM):** honest subject and sender, identify yourself, include a physical postal
  address, honor opt-outs promptly.
- **EU/UK (GDPR, PECR):** B2B outreach must be relevant to the person's job and give an easy way
  to object. Don't email personal addresses.
- **India (DPDP Act 2023):** work emails of individuals are personal data. Keep outreach relevant,
  collect only what you need, and remove people who ask.
- **Always:** add a simple opt-out line (e.g. *"Not relevant? Just reply 'no' and I won't follow up."*),
  and honor it.

---

## 8. Tools (pick a budget level)

| Job | Free / scrappy | Paid |
|---|---|---|
| Inboxes | n/a (you need a domain) | Google Workspace, Microsoft 365 |
| Sending + warm-up | Gmail + a Google Sheets mail-merge add-on, low volume only | Instantly, Smartlead, lemlist |
| Finding leads | LinkedIn, company sites, job boards | Apollo, LinkedIn Sales Navigator |
| Verification | small free tiers | ZeroBounce, NeverBounce, MillionVerifier |
| Tracking | Google Sheets (columns below) | Your sending tool's dashboard |

**Tracking sheet columns:** `name · company · role · email · verified (y/n) · first_line · problem ·
script · sent_date · fu1 · fu2 · fu3 · reply (y/n) · positive (y/n) · notes · do_not_contact`

---

## 9. 14-day launch plan

| Day | Do |
|---|---|
| 1 | Buy the sending domain, set up inboxes, redirect the domain to your site |
| 2 | Add SPF, DKIM, DMARC. Test with MXToolbox / mail-tester |
| 3 | Start warm-up. Write your one-sentence target customer |
| 4–7 | Build a list of 100 leads, with one true detail each |
| 8 | Verify the list. Write Script A plus 3 follow-ups |
| 9–13 | Keep warming up. Have 2 friends read your email out loud: does it sound human? |
| 14 | Start at 10 emails per inbox per day. Log every reply |

Then document what actually happens: the failures, the lessons, the work.
