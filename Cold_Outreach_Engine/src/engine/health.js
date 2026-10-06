// Deliverability guard rails: per-mailbox health score, automatic pause on bad signals,
// and periodic DNS checks for every domain.
const db = require('../db');
const settings = require('../settings');
const { checkDomain } = require('../mail/dns');
const { PROVIDERS } = require('../mail/providers');
const { logEvent } = require('../util');

const MIN_SAMPLE = 20;

async function mailboxMetrics() {
  return db.many(
    `SELECT m.id, m.email, m.status, m.role, m.provider, m.domain_id, d.dns_report,
       (SELECT count(*)::int FROM messages x WHERE x.mailbox_id = m.id AND x.direction = 'out'
          AND x.step_no IS NOT NULL AND x.sent_at > now() - interval '7 days') AS sent_7d,
       (SELECT count(*)::int FROM messages x WHERE x.mailbox_id = m.id AND x.is_bounce
          AND x.sent_at > now() - interval '7 days') AS bounces_7d,
       (SELECT count(*)::int FROM messages x WHERE x.mailbox_id = m.id AND x.direction = 'in' AND NOT x.is_bounce
          AND NOT x.is_auto_reply AND x.campaign_id IS NOT NULL AND x.sent_at > now() - interval '7 days') AS replies_7d,
       (SELECT count(*)::int FROM warmup_messages w WHERE w.from_mailbox_id = m.id AND w.status IN ('inbox','spam')
          AND w.sent_at > now() - interval '7 days') AS warm_checked_7d,
       (SELECT count(*)::int FROM warmup_messages w WHERE w.from_mailbox_id = m.id AND w.status = 'spam'
          AND w.sent_at > now() - interval '7 days') AS warm_spam_7d
     FROM mailboxes m LEFT JOIN domains d ON d.id = m.domain_id
     ORDER BY m.email`,
  );
}

function score(m) {
  const bounceRate = m.sent_7d ? (100 * m.bounces_7d) / m.sent_7d : 0;
  const spamRate = m.warm_checked_7d ? (100 * m.warm_spam_7d) / m.warm_checked_7d : 0;
  const dns = m.dns_report ? m.dns_report.score : null;
  let s = 100;
  s -= Math.min(40, spamRate * 1.5);
  s -= Math.min(30, bounceRate * 5);
  if (dns !== null && dns !== undefined) s -= (100 - dns) * 0.3;
  if (m.status === 'error') s = Math.min(s, 20);
  return {
    health: Math.max(0, Math.round(s)),
    bounce_rate: Math.round(bounceRate * 10) / 10,
    spam_rate: Math.round(spamRate * 10) / 10,
    inbox_rate: m.warm_checked_7d ? Math.round(1000 - spamRate * 10) / 10 : null,
    reply_rate: m.sent_7d ? Math.round((1000 * m.replies_7d) / m.sent_7d) / 10 : null,
    dns_score: dns,
  };
}

// Pause campaign sending (warmup keeps running) when a mailbox shows trouble.
async function run() {
  const s = await settings.all();
  const metrics = await mailboxMetrics();
  for (const m of metrics) {
    if (m.status !== 'active' || m.role !== 'sender') continue;
    const sc = score(m);
    let reason = null;
    if (m.sent_7d >= MIN_SAMPLE && sc.bounce_rate > Number(s.max_bounce_rate)) {
      reason = `Bounce rate ${sc.bounce_rate}% over the last 7 days (limit ${s.max_bounce_rate}%). Clean / verify your lead list.`;
    } else if (m.warm_checked_7d >= MIN_SAMPLE && sc.spam_rate > Number(s.max_spam_rate)) {
      reason = `${sc.spam_rate}% of warmup emails landed in spam (limit ${s.max_spam_rate}%). Let warmup run before sending again.`;
    } else if (m.dns_report && m.dns_report.listed) {
      reason = 'Domain is on a blocklist.';
    }
    if (reason) {
      await db.query(`UPDATE mailboxes SET status = 'paused', status_reason = $2 WHERE id = $1`, [m.id, `Auto-paused: ${reason}`]);
      await logEvent('health', `${m.email} auto-paused: ${reason}`, { level: 'warn', mailboxId: m.id });
    }
  }
}

async function checkDomainRow(domain) {
  const mb = await db.one('SELECT provider FROM mailboxes WHERE domain_id = $1 LIMIT 1', [domain.id]);
  const provider = PROVIDERS[mb ? mb.provider : 'zoho-com'] || PROVIDERS['zoho-com'];
  const report = await checkDomain(domain.name, { selector: domain.dkim_selector, spfInclude: provider.spf_include });
  await db.query('UPDATE domains SET dns_report = $2, dns_checked_at = now() WHERE id = $1', [domain.id, report]);
  return report;
}

async function dnsAll() {
  const domains = await db.many(`SELECT * FROM domains WHERE dns_checked_at IS NULL OR dns_checked_at < now() - interval '12 hours'`);
  for (const d of domains) {
    const before = d.dns_report;
    const report = await checkDomainRow(d).catch((err) => {
      console.warn(`[dns ${d.name}]`, err.message);
      return null;
    });
    if (report && before && before.score === 100 && report.score < 100) {
      await logEvent('dns', `${d.name}: DNS check dropped to ${report.score}/100`, { level: 'warn' });
    }
    if (report && report.listed && !(before && before.listed)) {
      await logEvent('dns', `${d.name} appears on a domain blocklist`, { level: 'error' });
    }
  }
}

async function cleanup() {
  await db.query(`DELETE FROM events WHERE ts < now() - interval '90 days'`);
  await db.query(`DELETE FROM warmup_messages WHERE created_at < now() - interval '120 days'`);
  await db.query(`DELETE FROM tasks WHERE created_at < now() - interval '30 days'`);
}

module.exports = { run, dnsAll, checkDomainRow, mailboxMetrics, score, cleanup };
