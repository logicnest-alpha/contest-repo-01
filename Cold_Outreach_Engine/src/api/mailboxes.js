// Domains, mailboxes and warmup.
const express = require('express');
const db = require('../db');
const smtp = require('../mail/smtp');
const imap = require('../mail/imap');
const { PROVIDERS } = require('../mail/providers');
const account = require('../mail/account');
const health = require('../engine/health');
const warmup = require('../engine/warmup');
const sync = require('../engine/sync');
const sender = require('../engine/sender');
const settings = require('../settings');
const { encrypt, normalizeEmail, normalizeDomain, domainOf, errMessage, logEvent } = require('../util');
const { ah, bad, notFound, int, str, bool } = require('./helpers');

const router = express.Router();

// ---------------------------------------------------------------- domains

router.get('/domains', ah(async (req, res) => {
  res.json(await db.many(
    `SELECT d.*, (SELECT count(*)::int FROM mailboxes m WHERE m.domain_id = d.id) AS mailboxes
     FROM domains d ORDER BY d.name`,
  ));
}));

async function ensureDomain(name, selector) {
  const domain = normalizeDomain(name);
  if (!domain) throw bad('Enter a domain like mail.yourbrand.com');
  const row = await db.one(
    `INSERT INTO domains (name, dkim_selector) VALUES ($1, $2)
     ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING *`,
    [domain, selector || 'zmail'],
  );
  return row;
}

router.post('/domains', ah(async (req, res) => {
  const d = await ensureDomain(req.body.name, str(req.body.dkim_selector, { max: 63 }) || 'zmail');
  const report = await health.checkDomainRow(d).catch(() => null);
  res.status(201).json({ ...d, dns_report: report });
}));

router.patch('/domains/:id', ah(async (req, res) => {
  const selector = str(req.body.dkim_selector, { max: 63, required: true, name: 'DKIM selector' });
  if (!/^[a-z0-9._-]+$/i.test(selector)) throw bad('DKIM selector may only contain letters, digits, dot, dash and underscore');
  const d = await db.one('UPDATE domains SET dkim_selector = $2 WHERE id = $1 RETURNING *', [req.params.id, selector]);
  if (!d) throw notFound();
  res.json(d);
}));

router.post('/domains/:id/check', ah(async (req, res) => {
  const d = await db.one('SELECT * FROM domains WHERE id = $1', [req.params.id]);
  if (!d) throw notFound();
  res.json(await health.checkDomainRow(d));
}));

router.delete('/domains/:id', ah(async (req, res) => {
  const used = await db.one('SELECT count(*)::int AS n FROM mailboxes WHERE domain_id = $1', [req.params.id]);
  if (used.n) throw bad('Remove the mailboxes on this domain first');
  await db.query('DELETE FROM domains WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- mailboxes

const PUBLIC_COLS = `m.id, m.domain_id, m.email, m.from_name, m.role, m.provider, m.smtp_host, m.smtp_port, m.smtp_secure,
  m.imap_host, m.imap_port, m.username, m.signature, m.status, m.status_reason, m.warmup_enabled, m.warmup_started_on,
  m.warmup_start_volume, m.warmup_increment, m.warmup_max_daily, m.warmup_reply_rate, m.daily_campaign_limit,
  m.campaign_ramp, m.first_campaign_send_on, m.min_gap_minutes, m.next_campaign_send_at, m.last_synced_at,
  m.last_error, m.last_error_at, m.created_at`;

router.get('/mailboxes', ah(async (req, res) => {
  const s = await settings.all();
  const rows = await db.many(`SELECT ${PUBLIC_COLS} FROM mailboxes m ORDER BY m.role, m.email`);
  const metrics = new Map((await health.mailboxMetrics()).map((m) => [m.id, m]));
  const out = [];
  for (const m of rows) {
    const met = metrics.get(m.id);
    out.push({
      ...m,
      warmup_day: warmup.daysSince(m.warmup_started_on),
      warmup_target_today: m.warmup_enabled ? warmup.dailyTarget(m) : 0,
      campaign_limit_today: sender.effectiveDailyLimit(m),
      not_ready: m.role === 'sender' ? await sender.notReadyReason(m, s) : null,
      metrics: met ? { ...health.score(met), sent_7d: met.sent_7d, bounces_7d: met.bounces_7d, replies_7d: met.replies_7d } : null,
    });
  }
  res.json(out);
}));

function readMailboxBody(body, existing = {}) {
  const provider = body.provider !== undefined ? String(body.provider) : existing.provider || 'zoho-com';
  if (!PROVIDERS[provider]) throw bad('Unknown provider');
  const preset = PROVIDERS[provider];
  const pickVal = (k, fallback) => (body[k] !== undefined && body[k] !== '' ? body[k] : fallback);
  const out = {
    provider,
    from_name: str(pickVal('from_name', existing.from_name || ''), { max: 120 }),
    role: pickVal('role', existing.role || 'sender'),
    smtp_host: str(pickVal('smtp_host', existing.smtp_host || preset.smtp_host), { max: 255 }),
    smtp_port: int(pickVal('smtp_port', existing.smtp_port || preset.smtp_port), { min: 1, max: 65535 }),
    smtp_secure: bool(pickVal('smtp_secure', existing.smtp_secure ?? preset.smtp_secure), true),
    imap_host: str(pickVal('imap_host', existing.imap_host || preset.imap_host), { max: 255 }),
    imap_port: int(pickVal('imap_port', existing.imap_port || preset.imap_port), { min: 1, max: 65535 }),
    signature: str(pickVal('signature', existing.signature || ''), { max: 2000 }),
    warmup_enabled: bool(pickVal('warmup_enabled', existing.warmup_enabled ?? true), true),
    warmup_start_volume: int(pickVal('warmup_start_volume', existing.warmup_start_volume ?? 3), { min: 1, max: 50 }),
    warmup_increment: int(pickVal('warmup_increment', existing.warmup_increment ?? 2), { min: 0, max: 20 }),
    warmup_max_daily: int(pickVal('warmup_max_daily', existing.warmup_max_daily ?? 35), { min: 1, max: 150 }),
    warmup_reply_rate: int(pickVal('warmup_reply_rate', existing.warmup_reply_rate ?? 40), { min: 0, max: 100 }),
    daily_campaign_limit: int(pickVal('daily_campaign_limit', existing.daily_campaign_limit ?? 30), { min: 0, max: 500 }),
    campaign_ramp: bool(pickVal('campaign_ramp', existing.campaign_ramp ?? true), true),
    min_gap_minutes: int(pickVal('min_gap_minutes', existing.min_gap_minutes ?? 8), { min: 1, max: 240 }),
  };
  if (!['sender', 'seed'].includes(out.role)) throw bad('Role must be sender or seed');
  if (!out.smtp_host || !out.imap_host) throw bad('SMTP and IMAP servers are required');
  if (body.warmup_started_on) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(body.warmup_started_on)) throw bad('Warmup start date must be YYYY-MM-DD');
    out.warmup_started_on = body.warmup_started_on;
  }
  return out;
}

async function testConnection(mb) {
  const result = { smtp: null, imap: null };
  try {
    await smtp.verify(mb);
    result.smtp = { ok: true };
  } catch (err) {
    result.smtp = { ok: false, error: errMessage(err) };
  }
  try {
    result.imap = { ok: true, ...(await imap.test(mb)) };
  } catch (err) {
    result.imap = { ok: false, error: errMessage(err) + (err.responseText ? ` (${err.responseText})` : '') };
  }
  result.ok = result.smtp.ok && result.imap.ok;
  return result;
}

router.post('/mailboxes', ah(async (req, res) => {
  const email = normalizeEmail(req.body.email);
  if (!email) throw bad('Enter a valid email address');
  const password = String(req.body.password || '');
  if (!password) throw bad('Password (or app password) is required');
  const data = readMailboxBody(req.body);
  const username = str(req.body.username, { max: 255 }) || email;

  if (!bool(req.body.skip_test)) {
    const test = await testConnection({ ...data, email, username, password });
    if (!test.ok) return res.status(400).json({ error: 'Could not connect with these settings', test });
  }
  const domain = data.role === 'sender' ? await ensureDomain(domainOf(email)) : null;
  const cols = { ...data, email, username, password_enc: encrypt(password), domain_id: domain ? domain.id : null };
  const keys = Object.keys(cols);
  const row = await db.one(
    `INSERT INTO mailboxes (${keys.join(', ')}) VALUES (${keys.map((_, i) => `$${i + 1}`).join(', ')})
     ON CONFLICT (email) DO NOTHING RETURNING id`,
    keys.map((k) => cols[k]),
  );
  if (!row) throw bad('This mailbox is already connected');
  if (domain) health.checkDomainRow(domain).catch(() => {});
  await logEvent('mailbox', `Connected ${email} (${data.role})`, { mailboxId: row.id });
  res.status(201).json({ id: row.id });
}));

router.patch('/mailboxes/:id', ah(async (req, res) => {
  const existing = await db.one('SELECT * FROM mailboxes WHERE id = $1', [req.params.id]);
  if (!existing) throw notFound();
  const data = readMailboxBody(req.body, existing);
  if (req.body.username !== undefined) data.username = str(req.body.username, { max: 255 }) || existing.email;
  if (req.body.password) data.password_enc = encrypt(String(req.body.password));
  const keys = Object.keys(data);
  await db.query(
    `UPDATE mailboxes SET ${keys.map((k, i) => `${k} = $${i + 2}`).join(', ')} WHERE id = $1`,
    [existing.id, ...keys.map((k) => data[k])],
  );
  smtp.forget(existing.id);
  res.json({ ok: true });
}));

router.post('/mailboxes/:id/test', ah(async (req, res) => {
  const mb = await account.loadMailbox(req.params.id);
  if (!mb) throw notFound();
  const result = await testConnection(mb);
  if (result.ok && mb.status === 'error') {
    await db.query(`UPDATE mailboxes SET status = 'active', status_reason = NULL, error_count = 0, last_error = NULL WHERE id = $1`, [mb.id]);
    result.reactivated = true;
  }
  res.json(result);
}));

router.post('/mailboxes/:id/status', ah(async (req, res) => {
  const status = req.body.status;
  if (!['active', 'paused'].includes(status)) throw bad('Status must be active or paused');
  const row = await db.one(
    `UPDATE mailboxes SET status = $2, status_reason = $3, error_count = 0 WHERE id = $1 RETURNING email`,
    [req.params.id, status, status === 'paused' ? 'Paused by you' : null],
  );
  if (!row) throw notFound();
  await logEvent('mailbox', `${row.email} ${status === 'paused' ? 'paused' : 'resumed'} by you`, { mailboxId: Number(req.params.id) });
  res.json({ ok: true });
}));

router.post('/mailboxes/:id/sync', ah(async (req, res) => {
  res.json(await sync.syncMailbox(Number(req.params.id)));
}));

router.delete('/mailboxes/:id', ah(async (req, res) => {
  smtp.forget(Number(req.params.id));
  await db.query('DELETE FROM mailboxes WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- warmup

router.get('/warmup', ah(async (req, res) => {
  const s = await settings.all();
  const rows = await warmup.stats(Number(req.query.days || 14));
  const today = await db.many(
    `SELECT from_mailbox_id AS id, count(*) FILTER (WHERE depth = 0)::int AS new_today, count(*) FILTER (WHERE depth > 0)::int AS replies_today
     FROM warmup_messages WHERE status <> 'failed' AND created_at >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1
     GROUP BY from_mailbox_id`,
    [s.timezone],
  );
  const t = new Map(today.map((r) => [r.id, r]));
  res.json(rows.map((r) => {
    const checked = r.inbox + r.spam + r.missing;
    return {
      ...r,
      day: warmup.daysSince(r.warmup_started_on),
      target_today: r.warmup_enabled && r.role === 'sender' ? warmup.dailyTarget(r) : 0,
      new_today: (t.get(r.id) || {}).new_today || 0,
      replies_today: (t.get(r.id) || {}).replies_today || 0,
      inbox_rate: checked ? Math.round((1000 * r.inbox) / checked) / 10 : null,
    };
  }));
}));

router.get('/warmup/:id/daily', ah(async (req, res) => {
  res.json(await warmup.daily(Number(req.params.id), 14));
}));

router.get('/warmup/recent', ah(async (req, res) => {
  res.json(await db.many(
    `SELECT w.id, w.subject, w.status, w.depth, w.sent_at, w.checked_at, w.error, f.email AS from_email, t.email AS to_email
     FROM warmup_messages w JOIN mailboxes f ON f.id = w.from_mailbox_id JOIN mailboxes t ON t.id = w.to_mailbox_id
     ORDER BY w.id DESC LIMIT 60`,
  ));
}));

module.exports = router;
