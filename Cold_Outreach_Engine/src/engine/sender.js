// Campaign sending: one email per mailbox at a time, random gaps, daily caps that ramp up,
// sending windows in the prospect's time zone, follow-ups in the same thread.
const db = require('../db');
const smtp = require('../mail/smtp');
const account = require('../mail/account');
const settings = require('../settings');
const { buildCampaignEmail } = require('../mail/compose');
const { isSuppressed, suppress, stopLead } = require('../leads/suppress');
const { daysSince } = require('./warmup');
const {
  windowMinutesLeft, randInt, shuffle, errMessage, logEvent,
} = require('../util');

const LEASE_MINUTES = 20;

function dayStartSql(param) {
  return `date_trunc('day', now() AT TIME ZONE ${param}) AT TIME ZONE ${param}`;
}

// Campaign volume ramps too: 5/day on the first sending day, +3/day up to the limit.
function effectiveDailyLimit(mb) {
  if (!mb.campaign_ramp || !mb.first_campaign_send_on) return mb.campaign_ramp ? Math.min(5, mb.daily_campaign_limit) : mb.daily_campaign_limit;
  return Math.min(mb.daily_campaign_limit, 5 + 3 * daysSince(mb.first_campaign_send_on));
}

async function mailboxSentToday(mailboxId, tz) {
  const row = await db.one(
    `SELECT count(*)::int AS n FROM messages
     WHERE mailbox_id = $1 AND direction = 'out' AND step_no IS NOT NULL AND sent_at >= ${dayStartSql('$2')}`,
    [mailboxId, tz],
  );
  return row.n;
}

async function campaignSentToday(campaignId, tz) {
  const row = await db.one(
    `SELECT count(*)::int AS n FROM messages
     WHERE campaign_id = $1 AND direction = 'out' AND step_no IS NOT NULL AND sent_at >= ${dayStartSql('$2')}`,
    [campaignId, tz],
  );
  return row.n;
}

// Why a mailbox may not send campaign mail right now (null = ready).
async function notReadyReason(mb, s) {
  if (mb.status !== 'active') return `mailbox is ${mb.status}`;
  if (mb.role !== 'sender') return 'seed inboxes never send campaigns';
  const warmed = daysSince(mb.warmup_started_on);
  if (warmed < Number(s.min_warmup_days || 0)) return `still warming up (day ${warmed} of ${s.min_warmup_days})`;
  const limit = effectiveDailyLimit(mb);
  const sent = await mailboxSentToday(mb.id, s.timezone);
  if (sent >= limit) return `daily limit reached (${sent}/${limit})`;
  return null;
}

async function tick() {
  const s = await settings.all();
  const campaigns = await db.many(`SELECT * FROM campaigns WHERE status = 'active' ORDER BY id`);
  for (const c of campaigns) {
    try {
      await runCampaign(c, s);
    } catch (err) {
      console.error(`[campaign ${c.id}]`, err);
    }
  }
  // Finish campaigns that have nothing left to send.
  await db.query(
    `UPDATE campaigns c SET status = 'completed'
     WHERE c.status = 'active' AND EXISTS (SELECT 1 FROM campaign_leads WHERE campaign_id = c.id)
       AND NOT EXISTS (SELECT 1 FROM campaign_leads WHERE campaign_id = c.id AND status = 'active')`,
  );
}

async function runCampaign(c, s) {
  if (!windowMinutesLeft({ tz: c.timezone, days: c.send_days, start: c.window_start, end: c.window_end })) return;
  let budget = c.daily_limit - (await campaignSentToday(c.id, c.timezone));
  if (budget <= 0) return;
  const mailboxes = await db.many(
    `SELECT m.* FROM campaign_mailboxes cm JOIN mailboxes m ON m.id = cm.mailbox_id
     WHERE cm.campaign_id = $1 AND m.status = 'active' AND m.role = 'sender'
       AND (m.next_campaign_send_at IS NULL OR m.next_campaign_send_at <= now())`,
    [c.id],
  );
  for (const mb of shuffle(mailboxes)) {
    if (budget <= 0) break;
    if (await notReadyReason(mb, s)) continue;
    const result = await sendNext(c, mb, s);
    if (result === 'sent') budget -= 1;
  }
}

// Claim the next due lead for this mailbox (follow-ups first) with a short lease.
async function claim(campaignId, mailboxId) {
  return db.tx(async (client) => {
    const { rows } = await client.query(
      `SELECT cl.id FROM campaign_leads cl
       WHERE cl.campaign_id = $1 AND cl.status = 'active' AND cl.next_send_at <= now()
         AND (cl.mailbox_id = $2 OR (cl.mailbox_id IS NULL AND cl.steps_sent = 0))
       ORDER BY cl.steps_sent DESC, cl.next_send_at
       LIMIT 1 FOR UPDATE SKIP LOCKED`,
      [campaignId, mailboxId],
    );
    if (!rows.length) return null;
    await client.query(
      `UPDATE campaign_leads SET next_send_at = now() + make_interval(mins => $2) WHERE id = $1`,
      [rows[0].id, LEASE_MINUTES],
    );
    return rows[0].id;
  });
}

async function stop(cl, status, reason) {
  await db.query(
    `UPDATE campaign_leads SET status = $2, stop_reason = $3, next_send_at = NULL WHERE id = $1`,
    [cl.id, status, reason],
  );
}

function isRecipientRejection(err) {
  const code = Number(err && err.responseCode);
  return (err && err.code === 'EENVELOPE') || (code >= 550 && code <= 554 && /recipient|mailbox|user|address/i.test(errMessage(err)));
}

async function sendNext(c, mbRow, s) {
  const clId = await claim(c.id, mbRow.id);
  if (!clId) return 'idle';
  const cl = await db.one('SELECT * FROM campaign_leads WHERE id = $1', [clId]);
  const lead = await db.one('SELECT * FROM leads WHERE id = $1', [cl.lead_id]);

  // ---- safety checks before anything leaves the building
  if (!lead || !lead.email) { await stop(cl, 'stopped', 'Lead has no email address'); return 'skipped'; }
  if (await isSuppressed(lead.email)) { await stop(cl, 'stopped', 'On the do-not-contact list'); return 'skipped'; }
  if (['unsubscribed', 'bounced'].includes(lead.status)) { await stop(cl, 'stopped', `Lead is ${lead.status}`); return 'skipped'; }
  if (c.stop_on_reply && ['replied', 'interested', 'meeting', 'not_interested'].includes(lead.status)) {
    await stop(cl, 'stopped', 'Lead already replied'); return 'skipped';
  }
  if (lead.email_status === 'invalid') { await stop(cl, 'stopped', 'Email address is invalid'); return 'skipped'; }
  if (lead.email_status === 'risky' && !c.allow_risky) { await stop(cl, 'stopped', 'Email is risky (catch-all / role) and the campaign excludes risky'); return 'skipped'; }
  if (lead.email_status === 'unknown' && !c.allow_unverified) { await stop(cl, 'stopped', 'Email not verified - verify leads first or allow unverified'); return 'skipped'; }

  const step = await db.one('SELECT * FROM campaign_steps WHERE campaign_id = $1 AND step_no = $2', [c.id, cl.steps_sent + 1]);
  if (!step) {
    await db.query(`UPDATE campaign_leads SET status = 'completed', next_send_at = NULL WHERE id = $1`, [cl.id]);
    return 'skipped';
  }

  const mb = await account.loadMailbox(mbRow.id);
  const email = buildCampaignEmail({ campaign: c, step, lead, mailbox: mb, campaignLead: cl, settings: s });
  if (email.missing.length) {
    await stop(cl, 'failed', `Missing values for: ${email.missing.join(', ')} (add a fallback like {{first_name|there}})`);
    return 'skipped';
  }

  try {
    await smtp.send(mb, {
      to: lead.first_name ? { name: [lead.first_name, lead.last_name].filter(Boolean).join(' '), address: lead.email } : lead.email,
      subject: email.subject,
      text: email.text,
      messageId: email.messageId,
      inReplyTo: email.inReplyTo,
      references: email.references,
      headers: email.headers,
    });
  } catch (err) {
    if (isRecipientRejection(err)) {
      await db.query(`UPDATE leads SET status = 'bounced', email_status = 'invalid', updated_at = now() WHERE id = $1`, [lead.id]);
      await suppress(lead.email, `Rejected by server: ${errMessage(err).slice(0, 120)}`);
      await stopLead(lead.id, 'bounced', 'Address rejected');
      await logEvent('bounce', `${lead.email} rejected at send time`, { level: 'warn', mailboxId: mb.id, campaignId: c.id, leadId: lead.id });
      return 'skipped';
    }
    // Mailbox / network problem: release the lead for a retry later and back off this mailbox.
    await db.query(`UPDATE campaign_leads SET next_send_at = now() + interval '30 minutes' WHERE id = $1`, [cl.id]);
    await db.query(`UPDATE mailboxes SET next_campaign_send_at = now() + interval '15 minutes' WHERE id = $1`, [mb.id]);
    await account.recordFailure(mb, err, 'Campaign send');
    return 'error';
  }

  // ---- bookkeeping
  const nextStep = await db.one('SELECT delay_days FROM campaign_steps WHERE campaign_id = $1 AND step_no = $2', [c.id, step.step_no + 1]);
  const gap = Math.round(mb.min_gap_minutes * 60 * (0.75 + Math.random() * 0.9)); // seconds
  const references = email.newThread ? null : email.references;
  const threadKey = email.newThread ? email.messageId : (cl.thread_message_id || email.messageId);
  await db.tx(async (client) => {
    await client.query(
      `INSERT INTO messages (mailbox_id, direction, message_id, in_reply_to, references_hdr, thread_key, from_email, from_name,
                             to_email, subject, body_text, snippet, lead_id, campaign_id, campaign_lead_id, step_no)
       VALUES ($1,'out',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15)`,
      [mb.id, email.messageId, email.inReplyTo, references, threadKey, mb.email, mb.from_name, lead.email,
        email.subject, email.text, email.text.slice(0, 160), lead.id, c.id, cl.id, step.step_no],
    );
    await client.query(
      `UPDATE campaign_leads SET
         steps_sent = steps_sent + 1, mailbox_id = $2, last_sent_at = now(),
         thread_message_id = CASE WHEN $3 THEN $4 ELSE thread_message_id END,
         thread_subject = $5, last_message_id = $4, references_hdr = $6,
         status = CASE WHEN $7::int IS NULL THEN 'completed' ELSE status END,
         next_send_at = CASE WHEN $7::int IS NULL THEN NULL
                             ELSE now() + make_interval(days => $7::int) + make_interval(mins => $8) END
       WHERE id = $1`,
      [cl.id, mb.id, email.newThread, email.messageId, email.threadSubject, references,
        nextStep ? nextStep.delay_days : null, randInt(-90, 90)],
    );
    await client.query(`UPDATE leads SET status = 'contacted', updated_at = now() WHERE id = $1 AND status = 'new'`, [lead.id]);
    await client.query(
      `UPDATE mailboxes SET next_campaign_send_at = now() + make_interval(secs => $2),
         first_campaign_send_on = COALESCE(first_campaign_send_on, current_date)
       WHERE id = $1`,
      [mb.id, gap],
    );
  });
  await account.recordSuccess(mb);
  return 'sent';
}

// Explain, per mailbox, why a campaign is or is not sending right now (shown in the UI).
async function diagnose(campaignId) {
  const s = await settings.all();
  const c = await db.one('SELECT * FROM campaigns WHERE id = $1', [campaignId]);
  if (!c) return null;
  const open = windowMinutesLeft({ tz: c.timezone, days: c.send_days, start: c.window_start, end: c.window_end }) > 0;
  const mbs = await db.many(
    `SELECT m.* FROM campaign_mailboxes cm JOIN mailboxes m ON m.id = cm.mailbox_id WHERE cm.campaign_id = $1 ORDER BY m.email`,
    [campaignId],
  );
  const mailboxes = [];
  for (const mb of mbs) {
    mailboxes.push({
      email: mb.email,
      reason: await notReadyReason(mb, s),
      limit_today: effectiveDailyLimit(mb),
      sent_today: await mailboxSentToday(mb.id, s.timezone),
      next_send_at: mb.next_campaign_send_at,
    });
  }
  return {
    window_open: open,
    campaign_sent_today: await campaignSentToday(c.id, c.timezone),
    daily_limit: c.daily_limit,
    due_now: (await db.one(
      `SELECT count(*)::int AS n FROM campaign_leads WHERE campaign_id = $1 AND status = 'active' AND next_send_at <= now()`, [campaignId],
    )).n,
    mailboxes,
  };
}

module.exports = { tick, diagnose, effectiveDailyLimit, notReadyReason };
