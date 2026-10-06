// Inbox sync: pulls new mail from every mailbox into the unified inbox, links replies to
// leads/campaigns, stops sequences on reply, handles bounces + unsubscribes, and rescues
// prospect replies that landed in your spam folder.
const { simpleParser } = require('mailparser');
const db = require('../db');
const imap = require('../mail/imap');
const account = require('../mail/account');
const classify = require('./classify');
const { suppress, stopLead } = require('../leads/suppress');
const { logEvent } = require('../util');

const FIRST_SYNC_DAYS = 14;
const MAX_PER_RUN = 150;
const MAX_SOURCE_BYTES = 3 * 1024 * 1024;

function addressOf(list) {
  const v = list && list.value && list.value[0];
  return v ? { email: String(v.address || '').toLowerCase(), name: v.name || '' } : { email: '', name: '' };
}

function refsOf(parsed) {
  const refs = [];
  if (parsed.inReplyTo) refs.push(...String(parsed.inReplyTo).match(/<[^>]+>/g) || []);
  if (parsed.references) {
    const list = Array.isArray(parsed.references) ? parsed.references : String(parsed.references).split(/\s+/);
    refs.push(...list.map((r) => (r.startsWith('<') ? r : `<${r}>`)));
  }
  return [...new Set(refs.filter(Boolean))];
}

async function syncAll() {
  const mailboxes = await db.many(`SELECT id FROM mailboxes WHERE status <> 'error' AND role = 'sender' ORDER BY last_synced_at NULLS FIRST`);
  for (const { id } of mailboxes) {
    await syncMailbox(id).catch((err) => console.error(`[sync ${id}]`, err.message));
  }
}

async function syncMailbox(mailboxId) {
  const mb = await account.loadMailbox(mailboxId);
  if (!mb) return { fetched: 0 };
  let fetched = 0;
  try {
    await imap.withImap(mb, async (client) => {
      const info = await imap.folders(client);
      for (const folder of [info.inbox, info.spam].filter(Boolean)) {
        fetched += await syncFolder(client, mb, folder, folder === info.spam);
      }
    });
    await db.query('UPDATE mailboxes SET last_synced_at = now() WHERE id = $1', [mb.id]);
    await account.recordSuccess(mb);
  } catch (err) {
    await account.recordFailure(mb, err, 'Inbox sync (IMAP)');
    throw err;
  }
  return { fetched };
}

async function syncFolder(client, mb, folder, isSpam) {
  const lock = await client.getMailboxLock(folder);
  const toRescue = [];
  let count = 0;
  try {
    const box = client.mailbox;
    const state = await db.one('SELECT * FROM mailbox_folders WHERE mailbox_id = $1 AND path = $2', [mb.id, folder]);
    const validity = String(box.uidValidity);
    let uids;
    if (!state || state.uid_validity !== validity) {
      const since = new Date(Date.now() - (isSpam ? 3 : FIRST_SYNC_DAYS) * 86400000);
      uids = (await client.search({ since }, { uid: true })) || [];
    } else {
      uids = ((await client.search({ uid: `${Number(state.last_uid) + 1}:*` }, { uid: true })) || [])
        .filter((u) => u > Number(state.last_uid));
    }
    uids = uids.sort((a, b) => a - b).slice(0, MAX_PER_RUN);

    // Download first, then process (imapflow cannot run other commands mid-fetch).
    const downloaded = [];
    if (uids.length) {
      for await (const msg of client.fetch(uids, { uid: true, source: { maxLength: MAX_SOURCE_BYTES } }, { uid: true })) {
        downloaded.push({ uid: msg.uid, source: msg.source });
      }
    }
    let maxUid = state && state.uid_validity === validity ? Number(state.last_uid) : 0;
    for (const item of downloaded) {
      maxUid = Math.max(maxUid, item.uid);
      try {
        const parsed = await simpleParser(item.source, { skipHtmlToText: false, skipImageLinks: true });
        const result = await processIncoming(mb, folder, item.uid, parsed, isSpam);
        if (result === 'stored') count += 1;
        if (result === 'stored' && isSpam) toRescue.push(item.uid);
      } catch (err) {
        console.warn(`[sync ${mb.email}] message ${item.uid}:`, err.message);
      }
    }
    // First sync: remember where the folder ends so we only look at new mail next time.
    if (!state || state.uid_validity !== validity) maxUid = Math.max(maxUid, Number(box.uidNext || 1) - 1);
    if (uids.length === MAX_PER_RUN && downloaded.length) maxUid = downloaded[downloaded.length - 1].uid;
    await db.query(
      `INSERT INTO mailbox_folders (mailbox_id, path, uid_validity, last_uid) VALUES ($1,$2,$3,$4)
       ON CONFLICT (mailbox_id, path) DO UPDATE SET uid_validity = EXCLUDED.uid_validity, last_uid = EXCLUDED.last_uid`,
      [mb.id, folder, validity, maxUid],
    );

    // A prospect's reply sitting in spam: move it to the inbox (also teaches the filter).
    for (const uid of toRescue) {
      await client.messageMove(String(uid), 'INBOX', { uid: true }).catch(() => {});
    }
  } finally {
    lock.release();
  }
  return count;
}

async function processIncoming(mb, folder, uid, parsed, isSpam) {
  const messageId = parsed.messageId || `<no-id-${mb.id}-${folder}-${uid}@local>`;
  const from = addressOf(parsed.from);
  if (from.email === mb.email) return 'own';

  const refs = refsOf(parsed);
  // Warmup traffic is handled by the warmup engine, never shown in the inbox.
  const warm = await db.one(
    'SELECT 1 AS x FROM warmup_messages WHERE message_id = $1 OR message_id = ANY($2::text[]) LIMIT 1',
    [messageId, refs],
  );
  if (warm) return 'warmup';
  if (await db.one('SELECT 1 AS x FROM messages WHERE mailbox_id = $1 AND message_id = $2', [mb.id, messageId])) return 'dup';

  const subject = parsed.subject || '';
  const text = String(parsed.text || '').slice(0, 50000);
  let sentAt = parsed.date && !Number.isNaN(parsed.date.getTime()) && parsed.date <= new Date() ? parsed.date : new Date();

  // ---- bounces
  const bounce = classify.detectBounce(parsed);
  if (bounce) {
    await handleBounce(mb, bounce, { messageId, subject, text, sentAt, folder, uid });
    return isSpam ? 'bounce' : 'stored';
  }

  // ---- link to something we sent
  const parent = refs.length
    ? await db.one(
      `SELECT * FROM messages WHERE message_id = ANY($1::text[]) AND direction = 'out' ORDER BY sent_at DESC LIMIT 1`, [refs],
    )
    : null;
  let lead = null;
  if (parent && parent.lead_id) lead = await db.one('SELECT * FROM leads WHERE id = $1', [parent.lead_id]);
  if (!lead && from.email) lead = await db.one('SELECT * FROM leads WHERE email = $1', [from.email]);
  if (isSpam && !lead && !parent) return 'junk'; // real spam stays in spam
  // The sender's clock can be off: never sort a reply above the email it answers.
  if (parent && sentAt <= new Date(parent.sent_at)) sentAt = new Date(new Date(parent.sent_at).getTime() + 1000);

  const auto = classify.isAutoReply(parsed.headers, subject);
  const unsubscribeRequest = /^\s*unsubscribe\s*$/i.test(subject) || /^\s*unsubscribe\s*$/i.test(classify.latestReply(text));
  let category = null;
  if (lead) category = unsubscribeRequest ? 'unsubscribe' : auto ? 'ooo' : null;

  const inserted = await db.one(
    `INSERT INTO messages (mailbox_id, direction, message_id, in_reply_to, references_hdr, thread_key, from_email, from_name,
                           to_email, cc, subject, body_text, snippet, lead_id, campaign_id, campaign_lead_id, step_no,
                           folder, imap_uid, was_spam, is_read, is_auto_reply, category, sent_at)
     VALUES ($1,'in',$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)
     ON CONFLICT (mailbox_id, message_id) DO NOTHING RETURNING id`,
    [mb.id, messageId, parsed.inReplyTo || null, refs.join(' ') || null, parent ? parent.thread_key : messageId,
      from.email, from.name, mb.email, parsed.cc ? parsed.cc.text : null, subject, text,
      classify.latestReply(text).replace(/\s+/g, ' ').slice(0, 160), lead ? lead.id : null,
      parent ? parent.campaign_id : null, parent ? parent.campaign_lead_id : null, parent ? parent.step_no : null,
      folder, uid, isSpam, Boolean(auto), Boolean(auto), category, sentAt],
  );
  if (!inserted) return 'dup';
  if (!lead) return 'stored';

  if (unsubscribeRequest) {
    await optOut(lead, 'Asked to unsubscribe');
    return 'stored';
  }
  if (auto) {
    // Out-of-office: keep the sequence going.
    await logEvent('reply', `Auto-reply from ${from.email}`, { mailboxId: mb.id, leadId: lead.id, campaignId: parent && parent.campaign_id });
    return 'stored';
  }
  await handleReply(mb, lead, parent, inserted.id, { subject, text, from });
  return 'stored';
}

async function optOut(lead, reason) {
  await suppress(lead.email, reason);
  await db.query(`UPDATE leads SET status = 'unsubscribed', updated_at = now() WHERE id = $1`, [lead.id]);
  await stopLead(lead.id, 'unsubscribed', reason);
  // A reply that was an opt-out counts as an unsubscribe in campaign stats, not a reply.
  await db.query(
    `UPDATE campaign_leads SET status = 'unsubscribed', stop_reason = $2
     WHERE lead_id = $1 AND status = 'replied' AND replied_at > now() - interval '1 day'`,
    [lead.id, reason],
  );
  await logEvent('unsubscribe', `${lead.email} opted out`, { leadId: lead.id });
}

async function handleReply(mb, lead, parent, messageRowId, { subject, text, from }) {
  // 1) stop sequences for this lead (campaigns with stop_on_reply)
  await db.query(
    `UPDATE campaign_leads cl SET status = 'replied', replied_at = now(), next_send_at = NULL, stop_reason = 'Lead replied'
     FROM campaigns c WHERE c.id = cl.campaign_id AND cl.lead_id = $1 AND cl.status = 'active' AND c.stop_on_reply`,
    [lead.id],
  );
  await db.query(
    `UPDATE campaign_leads SET replied_at = COALESCE(replied_at, now()) WHERE lead_id = $1`, [lead.id],
  );
  // 2) stop colleagues at the same company (campaigns with stop_on_company_reply)
  if (lead.company_domain) {
    await db.query(
      `UPDATE campaign_leads cl SET status = 'stopped', next_send_at = NULL, stop_reason = 'A colleague replied'
       FROM campaigns c, leads l
       WHERE c.id = cl.campaign_id AND l.id = cl.lead_id AND cl.status = 'active' AND c.stop_on_company_reply
         AND l.company_domain = $1 AND l.id <> $2`,
      [lead.company_domain, lead.id],
    );
  }
  // 3) categorise and update the lead
  const result = await classify.categorize({ subject, text });
  await db.query('UPDATE messages SET category = $2 WHERE id = $1', [messageRowId, result.category]);
  if (result.category === 'unsubscribe') {
    await optOut(lead, 'Asked not to be contacted');
  } else {
    const status = classify.LEAD_STATUS[result.category] || 'replied';
    // Never downgrade a lead that is already further along (e.g. meeting booked).
    await db.query(
      `UPDATE leads SET status = $2, updated_at = now()
       WHERE id = $1 AND status NOT IN ('meeting', 'unsubscribed', 'bounced')
         AND NOT (status = 'interested' AND $2 = 'replied')`,
      [lead.id, status],
    );
  }
  await logEvent('reply', `Reply from ${from.email} (${result.category})${result.summary ? `: ${result.summary}` : ''}`, {
    mailboxId: mb.id, leadId: lead.id, campaignId: parent && parent.campaign_id,
  });
}

async function handleBounce(mb, bounce, { messageId, subject, text, sentAt, folder, uid }) {
  let lead = null;
  let original = null;
  if (bounce.originalMessageId) {
    original = await db.one(`SELECT * FROM messages WHERE message_id = $1 AND direction = 'out' LIMIT 1`, [bounce.originalMessageId]);
    if (original && original.lead_id) lead = await db.one('SELECT * FROM leads WHERE id = $1', [original.lead_id]);
  }
  if (!lead && bounce.recipient) lead = await db.one('SELECT * FROM leads WHERE email = $1', [bounce.recipient]);
  if (!lead) {
    // Fall back to any address in the notice that we emailed from this mailbox recently.
    const candidates = bounce.candidates.filter((e) => e !== mb.email && !/mailer-daemon|postmaster/.test(e));
    if (candidates.length) {
      lead = await db.one(
        `SELECT l.* FROM leads l JOIN messages m ON m.lead_id = l.id
         WHERE l.email = ANY($1::text[]) AND m.mailbox_id = $2 AND m.direction = 'out' AND m.sent_at > now() - interval '14 days'
         ORDER BY m.sent_at DESC LIMIT 1`,
        [candidates, mb.id],
      );
    }
  }
  await db.query(
    `INSERT INTO messages (mailbox_id, direction, message_id, thread_key, from_email, to_email, subject, body_text, snippet,
                           lead_id, campaign_id, campaign_lead_id, folder, imap_uid, is_read, is_bounce, category, sent_at)
     VALUES ($1,'in',$2,$3,'mailer-daemon',$4,$5,$6,$7,$8,$9,$10,$11,$12,true,true,'bounce',$13)
     ON CONFLICT (mailbox_id, message_id) DO NOTHING`,
    [mb.id, messageId, original ? original.thread_key : messageId, mb.email, subject, text.slice(0, 20000),
      `Delivery failed${bounce.recipient ? ` to ${bounce.recipient}` : ''}${bounce.status ? ` (${bounce.status})` : ''}`,
      lead ? lead.id : null, original ? original.campaign_id : null, original ? original.campaign_lead_id : null, folder, uid, sentAt],
  );
  if (!lead) return;
  if (bounce.hard) {
    await db.query(`UPDATE leads SET status = 'bounced', email_status = 'invalid', updated_at = now() WHERE id = $1`, [lead.id]);
    await suppress(lead.email, `Hard bounce ${bounce.status || ''}`.trim());
    await stopLead(lead.id, 'bounced', `Bounced ${bounce.status || ''}`.trim());
    await logEvent('bounce', `Hard bounce: ${lead.email} ${bounce.status || ''}`, { level: 'warn', mailboxId: mb.id, leadId: lead.id });
  } else {
    await logEvent('bounce', `Soft bounce (temporary): ${lead.email} ${bounce.status || ''}`, { mailboxId: mb.id, leadId: lead.id });
  }
}

module.exports = { syncAll, syncMailbox, processIncoming };
