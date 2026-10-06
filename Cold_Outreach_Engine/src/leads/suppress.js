// Do-not-contact list (emails and whole domains).
const db = require('../db');
const { domainOf } = require('../util');

async function isSuppressed(email, client = db) {
  const e = String(email || '').toLowerCase();
  if (!e) return false;
  const { rows } = await client.query('SELECT 1 FROM suppressions WHERE value = $1 OR value = $2 LIMIT 1', [e, domainOf(e)]);
  return rows.length > 0;
}

async function suppress(value, reason, client = db) {
  const v = String(value || '').trim().toLowerCase();
  if (!v) return;
  const kind = v.includes('@') ? 'email' : 'domain';
  await client.query(
    `INSERT INTO suppressions (value, kind, reason) VALUES ($1, $2, $3)
     ON CONFLICT (value) DO NOTHING`,
    [v, kind, String(reason || '').slice(0, 200)],
  );
}

// Stop every running sequence for this lead.
async function stopLead(leadId, status, reason, client = db) {
  await client.query(
    `UPDATE campaign_leads SET status = $2, stop_reason = $3, next_send_at = NULL
     WHERE lead_id = $1 AND status = 'active'`,
    [leadId, status, reason],
  );
}

module.exports = { isSuppressed, suppress, stopLead };
