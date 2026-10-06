// Campaigns: settings, sequence steps, leads, launch / pause, previews, test sends, stats.
const express = require('express');
const db = require('../db');
const settings = require('../settings');
const smtp = require('../mail/smtp');
const account = require('../mail/account');
const spamcheck = require('../mail/spamcheck');
const sender = require('../engine/sender');
const { buildCampaignEmail } = require('../mail/compose');
const { leadFilter } = require('./leads');
const { isValidTimeZone, normalizeEmail, newMessageId, errMessage, logEvent } = require('../util');
const { ah, bad, notFound, int, str, bool, hhmm } = require('./helpers');
const config = require('../config');

const router = express.Router();

function readCampaign(body, existing = {}) {
  const v = (k, d) => (body[k] !== undefined ? body[k] : existing[k] !== undefined ? existing[k] : d);
  const tz = str(v('timezone', 'Asia/Kolkata'), { max: 64 });
  if (!isValidTimeZone(tz)) throw bad(`Unknown time zone "${tz}"`);
  const days = (Array.isArray(v('send_days', [1, 2, 3, 4, 5])) ? v('send_days', [1, 2, 3, 4, 5]) : [])
    .map(Number).filter((d) => d >= 1 && d <= 7);
  if (!days.length) throw bad('Pick at least one sending day');
  const out = {
    name: str(v('name', ''), { max: 120, required: true, name: 'Campaign name' }),
    timezone: tz,
    send_days: [...new Set(days)].sort(),
    window_start: hhmm(String(v('window_start', '09:00')).slice(0, 5)),
    window_end: hhmm(String(v('window_end', '17:00')).slice(0, 5)),
    daily_limit: int(v('daily_limit', 100), { min: 0, max: 5000 }),
    stop_on_reply: bool(v('stop_on_reply', true), true),
    stop_on_company_reply: bool(v('stop_on_company_reply', true), true),
    allow_risky: bool(v('allow_risky', false)),
    allow_unverified: bool(v('allow_unverified', false)),
    unsubscribe_header: bool(v('unsubscribe_header', true), true),
  };
  if (out.window_start >= out.window_end) throw bad('The sending window must end after it starts');
  return out;
}

async function setMailboxes(campaignId, ids) {
  if (!Array.isArray(ids)) return;
  const clean = ids.map(Number).filter(Number.isInteger);
  await db.tx(async (c) => {
    await c.query('DELETE FROM campaign_mailboxes WHERE campaign_id = $1', [campaignId]);
    for (const id of clean) {
      await c.query(
        `INSERT INTO campaign_mailboxes (campaign_id, mailbox_id) SELECT $1, id FROM mailboxes WHERE id = $2 AND role = 'sender'
         ON CONFLICT DO NOTHING`,
        [campaignId, id],
      );
    }
    // Leads not yet emailed by a removed mailbox go back to the shared pool.
    await c.query(
      `UPDATE campaign_leads SET mailbox_id = NULL
       WHERE campaign_id = $1 AND steps_sent = 0 AND mailbox_id IS NOT NULL AND NOT (mailbox_id = ANY($2::int[]))`,
      [campaignId, clean],
    );
  });
}

async function campaignStats(id) {
  return db.one(
    `SELECT
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id = $1) AS leads,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id = $1 AND status = 'active') AS active,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id = $1 AND steps_sent > 0) AS contacted,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id = $1 AND status = 'completed') AS completed,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id = $1 AND status = 'replied') AS replied,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id = $1 AND status = 'bounced') AS bounced,
       (SELECT count(*)::int FROM campaign_leads WHERE campaign_id = $1 AND status IN ('stopped','failed','unsubscribed')) AS stopped,
       (SELECT count(*)::int FROM messages WHERE campaign_id = $1 AND direction = 'out' AND step_no IS NOT NULL) AS sent,
       (SELECT count(DISTINCT lead_id)::int FROM messages WHERE campaign_id = $1 AND direction = 'in' AND NOT is_bounce AND NOT is_auto_reply) AS replies,
       (SELECT count(DISTINCT m.lead_id)::int FROM messages m WHERE m.campaign_id = $1 AND m.category IN ('interested')) AS interested`,
    [id],
  );
}

router.get('/campaigns', ah(async (req, res) => {
  const rows = await db.many('SELECT * FROM campaigns ORDER BY created_at DESC');
  const out = [];
  for (const c of rows) out.push({ ...c, stats: await campaignStats(c.id) });
  res.json(out);
}));

router.post('/campaigns', ah(async (req, res) => {
  const d = readCampaign(req.body);
  const keys = Object.keys(d);
  const row = await db.one(
    `INSERT INTO campaigns (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')}) RETURNING *`,
    keys.map((k) => d[k]),
  );
  await setMailboxes(row.id, req.body.mailbox_ids);
  // Start with a sensible 3-step sequence the user edits.
  const defaults = [
    { step_no: 1, delay_days: 0, subject: '{{company}} + quick question', body: '{Hi|Hello|Hey} {{first_name|there}},\n\n{{icebreaker|I came across {{company}} recently.}}\n\nWe help [who you help] [get specific result] without [common pain]. [One line of proof: a client, a number].\n\nWould it be worth a quick chat to see if this could work for {{company}} too?\n\n{{sender_first_name}}' },
    { step_no: 2, delay_days: 3, subject: '', body: '{Hi|Hey} {{first_name|there}},\n\nJust bumping this up in case it got buried. {Is this something you are looking at this quarter?|Is this on your radar right now?}\n\n{{sender_first_name}}' },
    { step_no: 3, delay_days: 5, subject: '', body: '{{first_name|Hi}},\n\nI will not keep filling your inbox. If [problem] becomes a priority, just reply here and I will send over a few ideas.\n\nAll the best,\n{{sender_first_name}}' },
  ];
  for (const s of defaults) {
    await db.query('INSERT INTO campaign_steps (campaign_id, step_no, delay_days, subject, body) VALUES ($1,$2,$3,$4,$5)',
      [row.id, s.step_no, s.delay_days, s.subject, s.body]);
  }
  res.status(201).json(row);
}));

router.get('/campaigns/:id', ah(async (req, res) => {
  const c = await db.one('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!c) throw notFound();
  const steps = await db.many('SELECT * FROM campaign_steps WHERE campaign_id = $1 ORDER BY step_no', [c.id]);
  const mailboxIds = (await db.many('SELECT mailbox_id FROM campaign_mailboxes WHERE campaign_id = $1', [c.id])).map((r) => r.mailbox_id);
  const stepStats = await db.many(
    `SELECT step_no, count(*)::int AS sent,
       count(*) FILTER (WHERE EXISTS (SELECT 1 FROM messages r WHERE r.direction = 'in' AND r.thread_key = m.thread_key
                                     AND NOT r.is_bounce AND NOT r.is_auto_reply AND r.in_reply_to = m.message_id))::int AS replies
     FROM messages m WHERE m.campaign_id = $1 AND m.direction = 'out' AND m.step_no IS NOT NULL GROUP BY step_no ORDER BY step_no`,
    [c.id],
  );
  res.json({
    campaign: c, steps, mailbox_ids: mailboxIds, stats: await campaignStats(c.id), step_stats: stepStats,
    diagnose: await sender.diagnose(c.id),
  });
}));

router.patch('/campaigns/:id', ah(async (req, res) => {
  const existing = await db.one('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound();
  const d = readCampaign(req.body, existing);
  const keys = Object.keys(d);
  const row = await db.one(
    `UPDATE campaigns SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1 RETURNING *`,
    [existing.id, ...keys.map((k) => d[k])],
  );
  await setMailboxes(existing.id, req.body.mailbox_ids);
  res.json(row);
}));

router.put('/campaigns/:id/steps', ah(async (req, res) => {
  const c = await db.one('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!c) throw notFound();
  const steps = Array.isArray(req.body.steps) ? req.body.steps : [];
  if (!steps.length) throw bad('A campaign needs at least one step');
  if (steps.length > 10) throw bad('At most 10 steps');
  const clean = steps.map((s, i) => ({
    step_no: i + 1,
    delay_days: i === 0 ? 0 : int(s.delay_days, { min: 0, max: 60, def: 3 }),
    subject: str(s.subject, { max: 300 }),
    body: str(s.body, { max: 10000, required: true, name: `Step ${i + 1} body` }),
  }));
  if (!clean[0].subject) throw bad('The first email needs a subject');
  await db.tx(async (client) => {
    await client.query('DELETE FROM campaign_steps WHERE campaign_id = $1', [c.id]);
    for (const s of clean) {
      await client.query('INSERT INTO campaign_steps (campaign_id, step_no, delay_days, subject, body) VALUES ($1,$2,$3,$4,$5)',
        [c.id, s.step_no, s.delay_days, s.subject, s.body]);
    }
    // Leads that already finished all old steps but now have a new one: re-open them.
    await client.query(
      `UPDATE campaign_leads SET status = 'active', next_send_at = COALESCE(last_sent_at, now()) + make_interval(days => s.delay_days)
       FROM campaign_steps s
       WHERE campaign_leads.campaign_id = $1 AND campaign_leads.status = 'completed'
         AND s.campaign_id = $1 AND s.step_no = campaign_leads.steps_sent + 1`,
      [c.id],
    );
  });
  res.json({ ok: true });
}));

router.post('/campaigns/:id/status', ah(async (req, res) => {
  const status = req.body.status;
  if (!['active', 'paused'].includes(status)) throw bad('Status must be active or paused');
  const c = await db.one('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!c) throw notFound();
  if (status === 'active') {
    const mbs = await db.one('SELECT count(*)::int AS n FROM campaign_mailboxes WHERE campaign_id = $1', [c.id]);
    if (!mbs.n) throw bad('Choose at least one mailbox to send from');
    const steps = await db.one('SELECT count(*)::int AS n FROM campaign_steps WHERE campaign_id = $1', [c.id]);
    if (!steps.n) throw bad('Write at least one email');
    const leads = await db.one(`SELECT count(*)::int AS n FROM campaign_leads WHERE campaign_id = $1 AND status = 'active'`, [c.id]);
    if (!leads.n) throw bad('Add leads first');
  }
  const row = await db.one(
    `UPDATE campaigns SET status = $2, started_at = COALESCE(started_at, CASE WHEN $2 = 'active' THEN now() END) WHERE id = $1 RETURNING *`,
    [c.id, status],
  );
  await logEvent('campaign', `Campaign "${c.name}" ${status === 'active' ? 'started' : 'paused'}`, { campaignId: c.id });
  res.json(row);
}));

router.delete('/campaigns/:id', ah(async (req, res) => {
  await db.query('DELETE FROM campaigns WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- leads in a campaign

router.get('/campaigns/:id/leads', ah(async (req, res) => {
  const status = req.query.status || null;
  res.json(await db.many(
    `SELECT cl.*, l.email, l.first_name, l.last_name, l.company, l.status AS lead_status, m.email AS mailbox_email
     FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id LEFT JOIN mailboxes m ON m.id = cl.mailbox_id
     WHERE cl.campaign_id = $1 AND ($2::text IS NULL OR cl.status = $2)
     ORDER BY cl.next_send_at NULLS LAST, cl.id LIMIT 500`,
    [req.params.id, status],
  ));
}));

// Add leads by ids or by the same filter as the Leads page.
router.post('/campaigns/:id/leads', ah(async (req, res) => {
  const c = await db.one('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!c) throw notFound();
  const params = [c.id];
  let source;
  if (Array.isArray(req.body.ids) && req.body.ids.length) {
    params.push(req.body.ids.map(Number).filter(Number.isInteger));
    source = 'SELECT l.id FROM leads l WHERE l.id = ANY($2)';
  } else if (req.body.filter) {
    const fparams = [];
    const where = leadFilter(req.body.filter, fparams);
    // shift placeholders by one because $1 is the campaign id
    source = `SELECT l.id FROM leads l ${where.replace(/\$(\d+)/g, (m, n) => `$${Number(n) + 1}`)}`;
    params.push(...fparams);
  } else {
    throw bad('Choose leads to add');
  }
  const result = await db.query(
    `INSERT INTO campaign_leads (campaign_id, lead_id, next_send_at)
     SELECT $1, l.id, now() FROM leads l
     WHERE l.id IN (${source}) AND l.email IS NOT NULL
       AND l.status NOT IN ('unsubscribed', 'bounced')
       AND NOT EXISTS (SELECT 1 FROM suppressions s WHERE s.value = l.email OR s.value = split_part(l.email, '@', 2))
       AND NOT EXISTS (SELECT 1 FROM campaign_leads x WHERE x.lead_id = l.id AND x.status = 'active')
     ON CONFLICT (campaign_id, lead_id) DO NOTHING`,
    params,
  );
  res.json({ added: result.rowCount });
}));

router.delete('/campaigns/:id/leads/:clId', ah(async (req, res) => {
  await db.query(
    `UPDATE campaign_leads SET status = 'stopped', stop_reason = 'Removed by you', next_send_at = NULL WHERE id = $1 AND campaign_id = $2`,
    [req.params.clId, req.params.id],
  );
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- previews and checks

router.post('/content/check', ah(async (req, res) => {
  res.json(spamcheck.check({ subject: String(req.body.subject || ''), body: String(req.body.body || ''), stepNo: Number(req.body.step_no || 1) }));
}));

async function previewFor(c, stepNo, leadId, mailboxId) {
  const s = await settings.all();
  const step = await db.one('SELECT * FROM campaign_steps WHERE campaign_id = $1 AND step_no = $2', [c.id, stepNo]);
  if (!step) throw bad('Save the sequence first');
  const lead = leadId
    ? await db.one('SELECT * FROM leads WHERE id = $1', [leadId])
    : (await db.one(
      `SELECT l.* FROM campaign_leads cl JOIN leads l ON l.id = cl.lead_id WHERE cl.campaign_id = $1 ORDER BY random() LIMIT 1`, [c.id],
    )) || {
      id: 0, first_name: 'Priya', last_name: 'Sharma', company: 'Acme Analytics Pvt Ltd', title: 'Founder', email: 'priya@example.com',
      city: 'Bengaluru', country: 'India', icebreaker: '',
    };
  const mbRow = mailboxId
    ? await db.one('SELECT * FROM mailboxes WHERE id = $1', [mailboxId])
    : await db.one('SELECT m.* FROM campaign_mailboxes cm JOIN mailboxes m ON m.id = cm.mailbox_id WHERE cm.campaign_id = $1 LIMIT 1', [c.id]);
  const mailbox = mbRow || { email: 'you@yourdomain.com', from_name: 'Your Name', signature: '' };
  const fakeThread = stepNo > 1 ? { thread_message_id: '<preview@local>', last_message_id: '<preview@local>', thread_subject: 'Earlier subject' } : null;
  const email = buildCampaignEmail({ campaign: c, step, lead, mailbox, campaignLead: fakeThread, settings: s });
  return { email, lead, mailbox, step };
}

router.post('/campaigns/:id/preview', ah(async (req, res) => {
  const c = await db.one('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!c) throw notFound();
  const { email, lead, mailbox, step } = await previewFor(c, int(req.body.step_no, { min: 1, def: 1 }), req.body.lead_id, req.body.mailbox_id);
  res.json({
    from: `${mailbox.from_name} <${mailbox.email}>`,
    to: lead.email,
    lead: { id: lead.id, name: [lead.first_name, lead.last_name].filter(Boolean).join(' '), company: lead.company },
    subject: email.subject, text: email.text, missing: email.missing, headers: email.headers,
    check: spamcheck.check({ subject: step.subject, body: step.body, stepNo: step.step_no }),
  });
}));

// Send a rendered step to yourself to see exactly what prospects get.
router.post('/campaigns/:id/test', ah(async (req, res) => {
  const c = await db.one('SELECT * FROM campaigns WHERE id = $1', [req.params.id]);
  if (!c) throw notFound();
  const to = normalizeEmail(req.body.to || config.adminEmail);
  if (!to) throw bad('Enter the address to send the test to');
  const mailboxId = req.body.mailbox_id || (await db.one('SELECT mailbox_id FROM campaign_mailboxes WHERE campaign_id = $1 LIMIT 1', [c.id]) || {}).mailbox_id;
  if (!mailboxId) throw bad('Choose a mailbox for this campaign first');
  const mb = await account.loadMailbox(mailboxId);
  const { email } = await previewFor(c, int(req.body.step_no, { min: 1, def: 1 }), req.body.lead_id, mb.id);
  try {
    await smtp.send(mb, { to, subject: `[TEST] ${email.subject}`, text: email.text, messageId: newMessageId(mb.email), headers: email.headers });
  } catch (err) {
    throw bad(`Send failed: ${errMessage(err)}`);
  }
  res.json({ ok: true, to, from: mb.email });
}));

module.exports = router;
