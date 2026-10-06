// Unified inbox (one place for every mailbox): conversation list, thread view, reply,
// categorise, lead status, AI-suggested replies.
const express = require('express');
const db = require('../db');
const smtp = require('../mail/smtp');
const account = require('../mail/account');
const ai = require('../ai');
const settings = require('../settings');
const { replySubject, tidy } = require('../mail/compose');
const { suppress, stopLead } = require('../leads/suppress');
const { newMessageId, errMessage } = require('../util');
const { ah, bad, notFound, int, str } = require('./helpers');

const router = express.Router();

const CATEGORIES = ['interested', 'not_interested', 'ooo', 'unsubscribe', 'question', 'referral', 'wrong_person', 'other', 'bounce'];

// Conversations = threads with at least one incoming message, newest activity first.
router.get('/inbox', ah(async (req, res) => {
  const params = [];
  const where = [`t.has_in`];
  const add = (sql, v) => { params.push(v); where.push(sql.replace('?', `$${params.length}`)); };
  if (req.query.mailbox_id) add('t.mailbox_id = ?', Number(req.query.mailbox_id));
  if (req.query.category) add('t.category = ?', req.query.category);
  if (req.query.unread === '1') where.push('t.unread > 0');
  if (req.query.view === 'leads') where.push('t.lead_id IS NOT NULL AND NOT t.is_bounce');
  if (req.query.view === 'other') where.push('t.lead_id IS NULL AND NOT t.is_bounce');
  if (req.query.view === 'bounces') where.push('t.is_bounce');
  if (req.query.view !== 'bounces' && !req.query.category) where.push('NOT t.is_bounce');
  if (req.query.q) add(`(t.subject ILIKE ? OR t.from_email ILIKE $${params.length + 1} OR t.snippet ILIKE $${params.length + 1})`, `%${req.query.q}%`);
  const perPage = int(req.query.per_page, { min: 1, max: 100, def: 40 });
  const page = int(req.query.page, { min: 1, def: 1 });
  const rows = await db.many(
    `WITH t AS (
       SELECT DISTINCT ON (m.thread_key)
         m.thread_key, m.mailbox_id, m.subject, m.snippet, m.sent_at AS last_at, m.direction AS last_direction,
         last_in.from_email, last_in.from_name, last_in.category, last_in.is_bounce, last_in.was_spam,
         COALESCE(m.lead_id, last_in.lead_id) AS lead_id,
         (SELECT count(*) FROM messages u WHERE u.thread_key = m.thread_key AND u.direction = 'in' AND NOT u.is_read) AS unread,
         (SELECT count(*) FROM messages c WHERE c.thread_key = m.thread_key) AS message_count,
         last_in.id IS NOT NULL AS has_in
       FROM messages m
       LEFT JOIN LATERAL (
         SELECT i.* FROM messages i WHERE i.thread_key = m.thread_key AND i.direction = 'in' ORDER BY i.sent_at DESC LIMIT 1
       ) last_in ON true
       ORDER BY m.thread_key, m.sent_at DESC
     )
     SELECT t.*, mb.email AS mailbox_email, l.first_name, l.last_name, l.company, l.status AS lead_status
     FROM t JOIN mailboxes mb ON mb.id = t.mailbox_id LEFT JOIN leads l ON l.id = t.lead_id
     WHERE ${where.join(' AND ')}
     ORDER BY t.last_at DESC LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    params,
  );
  const counts = await db.one(
    `SELECT count(DISTINCT thread_key) FILTER (WHERE NOT is_read)::int AS unread,
            count(DISTINCT thread_key) FILTER (WHERE category = 'interested')::int AS interested
     FROM messages WHERE direction = 'in' AND NOT is_bounce`,
  );
  res.json({ rows, page, counts });
}));

async function loadThread(key) {
  const messages = await db.many(
    `SELECT m.*, mb.email AS mailbox_email FROM messages m JOIN mailboxes mb ON mb.id = m.mailbox_id
     WHERE m.thread_key = $1 ORDER BY m.sent_at, m.id`,
    [key],
  );
  if (!messages.length) throw notFound('Conversation not found');
  const leadId = messages.map((m) => m.lead_id).filter(Boolean).pop();
  const lead = leadId ? await db.one('SELECT * FROM leads WHERE id = $1', [leadId]) : null;
  const campaignId = messages.map((m) => m.campaign_id).filter(Boolean).pop();
  const campaign = campaignId ? await db.one('SELECT id, name FROM campaigns WHERE id = $1', [campaignId]) : null;
  return { messages, lead, campaign };
}

router.get('/inbox/thread', ah(async (req, res) => {
  const key = str(req.query.key, { max: 1000, required: true, name: 'Thread' });
  const thread = await loadThread(key);
  await db.query(`UPDATE messages SET is_read = true WHERE thread_key = $1 AND NOT is_read`, [key]);
  res.json(thread);
}));

router.post('/inbox/thread/unread', ah(async (req, res) => {
  await db.query(
    `UPDATE messages SET is_read = false WHERE id = (SELECT id FROM messages WHERE thread_key = $1 AND direction = 'in' ORDER BY sent_at DESC LIMIT 1)`,
    [req.body.key],
  );
  res.json({ ok: true });
}));

router.post('/inbox/thread/category', ah(async (req, res) => {
  const { key, category } = req.body;
  if (!CATEGORIES.includes(category)) throw bad('Unknown category');
  const last = await db.one(
    `UPDATE messages SET category = $2 WHERE id = (SELECT id FROM messages WHERE thread_key = $1 AND direction = 'in' ORDER BY sent_at DESC LIMIT 1)
     RETURNING lead_id`,
    [key, category],
  );
  if (last && last.lead_id) {
    const map = { interested: 'interested', not_interested: 'not_interested', wrong_person: 'not_interested', unsubscribe: 'unsubscribed' };
    if (map[category]) await db.query('UPDATE leads SET status = $2, updated_at = now() WHERE id = $1', [last.lead_id, map[category]]);
    if (category === 'unsubscribe') {
      const lead = await db.one('SELECT email FROM leads WHERE id = $1', [last.lead_id]);
      if (lead && lead.email) await suppress(lead.email, 'Marked unsubscribe in inbox');
      await stopLead(last.lead_id, 'unsubscribed', 'Asked to stop');
    }
  }
  res.json({ ok: true });
}));

// Reply in the thread, from the mailbox the conversation lives in.
router.post('/inbox/reply', ah(async (req, res) => {
  const key = str(req.body.key, { max: 1000, required: true, name: 'Thread' });
  const body = str(req.body.body, { max: 20000, required: true, name: 'Message' });
  const { messages, lead } = await loadThread(key);
  const lastIn = [...messages].reverse().find((m) => m.direction === 'in' && !m.is_bounce);
  const last = messages[messages.length - 1];
  const anchor = lastIn || last;
  const mb = await account.loadMailbox(anchor.mailbox_id);
  if (!mb) throw bad('The mailbox for this conversation was removed');
  const to = lastIn ? lastIn.from_email : last.to_email;
  if (!to) throw bad('No recipient address in this conversation');

  const quoted = String(anchor.body_text || '').split('\n').slice(0, 40).map((l) => `> ${l}`).join('\n');
  const who = anchor.direction === 'in' ? (anchor.from_name || anchor.from_email) : mb.email;
  const parts = [body];
  if (mb.signature && !body.includes(mb.signature.trim())) parts.push(mb.signature);
  parts.push(`On ${new Date(anchor.sent_at).toUTCString()}, ${who} wrote:\n${quoted}`);
  const text = tidy(parts.join('\n\n'));
  const messageId = newMessageId(mb.email);
  const references = [anchor.references_hdr, anchor.message_id].filter(Boolean).join(' ');
  const subject = replySubject(anchor.subject);
  try {
    await smtp.send(mb, { to, subject, text, messageId, inReplyTo: anchor.message_id, references });
  } catch (err) {
    await account.recordFailure(mb, err, 'Reply from inbox');
    throw bad(`Could not send: ${errMessage(err)}`);
  }
  await db.query(
    `INSERT INTO messages (mailbox_id, direction, message_id, in_reply_to, references_hdr, thread_key, from_email, from_name,
                           to_email, subject, body_text, snippet, lead_id, campaign_id, campaign_lead_id)
     VALUES ($1,'out',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)`,
    [mb.id, messageId, anchor.message_id, references, key, mb.email, mb.from_name, to, subject, text, body.slice(0, 160),
      lead ? lead.id : null, anchor.campaign_id, anchor.campaign_lead_id],
  );
  res.json({ ok: true });
}));

router.post('/inbox/suggest', ah(async (req, res) => {
  const { messages, lead } = await loadThread(str(req.body.key, { max: 1000, required: true }));
  const mb = await db.one('SELECT from_name FROM mailboxes WHERE id = $1', [messages[messages.length - 1].mailbox_id]);
  const s = await settings.all();
  const r = await ai.suggestReply({
    thread: messages.filter((m) => !m.is_bounce).slice(-8), lead, senderName: mb && mb.from_name, offer: s.company_name,
  });
  res.json(r);
}));

module.exports = router;
