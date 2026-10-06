// Dashboard, settings, integrations, activity log, background jobs, metadata for the UI.
const express = require('express');
const db = require('../db');
const config = require('../config');
const settings = require('../settings');
const scheduler = require('../engine/scheduler');
const health = require('../engine/health');
const ai = require('../ai');
const { list: providerList } = require('../mail/providers');
const { isValidTimeZone } = require('../util');
const { ah, bad, int, str, bool, hhmm } = require('./helpers');

const router = express.Router();

router.get('/meta', ah(async (req, res) => {
  res.json({
    providers: providerList(),
    ai_models: ai.MODELS,
    ai_enabled: await ai.enabled(),
    integrations: await settings.secretStatus(),
    public_url: config.publicUrl,
    admin_email: config.adminEmail,
    scheduler: scheduler.status(),
    settings: await settings.all(),
  });
}));

router.get('/dashboard', ah(async (req, res) => {
  const s = await settings.all();
  const tz = s.timezone;
  const dayStart = `date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1`;
  const today = await db.one(
    `SELECT
       (SELECT count(*)::int FROM messages WHERE direction = 'out' AND step_no IS NOT NULL AND sent_at >= ${dayStart}) AS sent,
       (SELECT count(*)::int FROM messages WHERE direction = 'in' AND lead_id IS NOT NULL AND NOT is_bounce AND NOT is_auto_reply AND created_at >= ${dayStart}) AS replies,
       (SELECT count(*)::int FROM warmup_messages WHERE status <> 'failed' AND created_at >= ${dayStart}) AS warmup`,
    [tz],
  );
  const week = await db.one(
    `SELECT
       (SELECT count(*)::int FROM messages WHERE direction = 'out' AND step_no IS NOT NULL AND sent_at > now() - interval '7 days') AS sent,
       (SELECT count(DISTINCT lead_id)::int FROM messages WHERE direction = 'in' AND lead_id IS NOT NULL AND campaign_id IS NOT NULL
          AND NOT is_bounce AND NOT is_auto_reply AND created_at > now() - interval '7 days') AS replies,
       (SELECT count(*)::int FROM messages WHERE is_bounce AND created_at > now() - interval '7 days') AS bounces,
       (SELECT count(DISTINCT lead_id)::int FROM messages WHERE category = 'interested' AND created_at > now() - interval '7 days') AS interested,
       (SELECT count(*)::int FROM warmup_messages WHERE status = 'inbox' AND sent_at > now() - interval '7 days') AS warm_inbox,
       (SELECT count(*)::int FROM warmup_messages WHERE status IN ('inbox','spam','missing') AND sent_at > now() - interval '7 days') AS warm_checked`,
  );
  const totals = await db.one(
    `SELECT (SELECT count(*)::int FROM leads) AS leads,
            (SELECT count(*)::int FROM leads WHERE email_status = 'valid') AS verified,
            (SELECT count(*)::int FROM leads WHERE status IN ('interested','meeting')) AS pipeline,
            (SELECT count(*)::int FROM campaigns WHERE status = 'active') AS active_campaigns,
            (SELECT count(*)::int FROM messages WHERE direction = 'in' AND NOT is_read AND NOT is_bounce) AS unread`,
  );
  const series = await db.many(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
       (SELECT count(*)::int FROM messages m WHERE m.direction = 'out' AND m.step_no IS NOT NULL AND (m.sent_at AT TIME ZONE $1)::date = d::date) AS sent,
       (SELECT count(*)::int FROM messages m WHERE m.direction = 'in' AND m.lead_id IS NOT NULL AND NOT m.is_bounce AND NOT m.is_auto_reply
          AND (m.created_at AT TIME ZONE $1)::date = d::date) AS replies,
       (SELECT count(*)::int FROM warmup_messages w WHERE w.status <> 'failed' AND (w.created_at AT TIME ZONE $1)::date = d::date) AS warmup
     FROM generate_series((now() AT TIME ZONE $1)::date - 13, (now() AT TIME ZONE $1)::date, interval '1 day') d ORDER BY d`,
    [tz],
  );
  const mailboxes = (await health.mailboxMetrics()).map((m) => ({
    id: m.id, email: m.email, status: m.status, role: m.role, ...health.score(m), sent_7d: m.sent_7d,
  }));
  const events = await db.many('SELECT * FROM events ORDER BY ts DESC LIMIT 25');
  res.json({
    today, week, totals, series, mailboxes, events,
    rates: {
      reply_rate: week.sent ? Math.round((1000 * week.replies) / week.sent) / 10 : null,
      bounce_rate: week.sent ? Math.round((1000 * week.bounces) / week.sent) / 10 : null,
      inbox_rate: week.warm_checked ? Math.round((1000 * week.warm_inbox) / week.warm_checked) / 10 : null,
    },
    scheduler: scheduler.status(),
  });
}));

router.get('/events', ah(async (req, res) => {
  res.json(await db.many('SELECT * FROM events ORDER BY ts DESC LIMIT $1', [int(req.query.limit, { min: 1, max: 500, def: 100 })]));
}));

router.get('/settings', ah(async (req, res) => {
  res.json({ settings: await settings.all(), integrations: await settings.secretStatus() });
}));

router.put('/settings', ah(async (req, res) => {
  const b = req.body || {};
  const patch = {};
  if (b.timezone !== undefined) {
    if (!isValidTimeZone(b.timezone)) throw bad('Unknown time zone');
    patch.timezone = b.timezone;
  }
  for (const k of ['company_name', 'physical_address', 'optout_line']) {
    if (b[k] !== undefined) patch[k] = str(b[k], { max: 500 });
  }
  if (b.warmup_window_start !== undefined) patch.warmup_window_start = hhmm(b.warmup_window_start);
  if (b.warmup_window_end !== undefined) patch.warmup_window_end = hhmm(b.warmup_window_end);
  if (b.warmup_weekends !== undefined) patch.warmup_weekends = bool(b.warmup_weekends);
  if (b.min_warmup_days !== undefined) patch.min_warmup_days = int(b.min_warmup_days, { min: 0, max: 60 });
  if (b.max_bounce_rate !== undefined) patch.max_bounce_rate = int(b.max_bounce_rate, { min: 1, max: 50 });
  if (b.max_spam_rate !== undefined) patch.max_spam_rate = int(b.max_spam_rate, { min: 1, max: 100 });
  if (b.ai_model !== undefined) patch.ai_model = str(b.ai_model, { max: 80 });
  res.json(await settings.update(patch));
}));

router.put('/settings/secrets', ah(async (req, res) => {
  for (const name of Object.keys(settings.SECRETS)) {
    if (req.body[name] !== undefined) await settings.setSecret(name, String(req.body[name]).trim());
  }
  res.json(await settings.secretStatus());
}));

router.post('/jobs/:name/run', ah(async (req, res) => {
  const ran = await scheduler.runNow(req.params.name);
  res.json({ ran });
}));

module.exports = router;
