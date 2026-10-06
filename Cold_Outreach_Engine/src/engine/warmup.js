// Self-warmup between your own mailboxes (+ optional seed inboxes at Gmail etc.).
//
// 1. Each sender emails other mailboxes in the pool, ramping up daily volume slowly.
// 2. The receiving mailbox logs in over IMAP, finds the email, and if it landed in
//    spam moves it to the inbox ("not spam" signal), marks it read / important,
//    files it into a "Warmup" folder so your real inbox stays clean,
// 3. and replies to a share of them so the conversation looks real.
// Placement (inbox vs spam) is recorded for every email, which gives a live
// deliverability score per mailbox.
const db = require('../db');
const smtp = require('../mail/smtp');
const imap = require('../mail/imap');
const account = require('../mail/account');
const settings = require('../settings');
const content = require('./warmup-content');
const {
  windowMinutesLeft, randInt, pick, chance, newMessageId, domainOf, errMessage, logEvent,
} = require('../util');
const { replySubject } = require('../mail/compose');

const MAX_DEPTH = 3; // at most 3 replies per conversation

function daysSince(dateValue) {
  const start = new Date(dateValue);
  start.setHours(0, 0, 0, 0);
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((now - start) / 86400000));
}

// Today's number of new warmup emails for a mailbox.
function dailyTarget(mb) {
  const day = daysSince(mb.warmup_started_on);
  return Math.min(mb.warmup_max_daily, mb.warmup_start_volume + mb.warmup_increment * day);
}

function windowOf(s) {
  return {
    tz: s.timezone,
    days: s.warmup_weekends ? [] : [1, 2, 3, 4, 5],
    start: s.warmup_window_start,
    end: s.warmup_window_end,
  };
}

async function pool(tz) {
  return db.many(
    `SELECT m.*,
       (SELECT count(*)::int FROM warmup_messages w
         WHERE w.from_mailbox_id = m.id AND w.depth = 0 AND w.status <> 'failed'
           AND w.created_at >= date_trunc('day', now() AT TIME ZONE $1) AT TIME ZONE $1) AS sent_today
     FROM mailboxes m
     WHERE m.warmup_enabled AND m.status <> 'error'`,
    [tz],
  );
}

function chooseReceiver(sender, members) {
  const others = members.filter((m) => m.id !== sender.id);
  if (!others.length) return null;
  const seeds = others.filter((m) => m.role === 'seed');
  // Half of the traffic goes to seed inboxes (Gmail etc.) when you have them:
  // that is where your prospects' spam filters live.
  if (seeds.length && chance(50)) return pick(seeds);
  const crossDomain = others.filter((m) => domainOf(m.email) !== domainOf(sender.email));
  return pick(crossDomain.length ? crossDomain : others);
}

async function sendOne({ sender, receiver, subject, body, parent }) {
  const from = await account.loadMailbox(sender.id);
  const messageId = newMessageId(from.email);
  const references = parent ? [parent.references_hdr, parent.message_id].filter(Boolean).join(' ') : null;
  const row = await db.one(
    `INSERT INTO warmup_messages (from_mailbox_id, to_mailbox_id, parent_id, depth, message_id, references_hdr, subject, body)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
    [from.id, receiver.id, parent ? parent.id : null, parent ? parent.depth + 1 : 0, messageId, references, subject, body],
  );
  try {
    await smtp.send(from, {
      to: receiver.from_name ? { name: receiver.from_name, address: receiver.email } : receiver.email,
      subject,
      text: body,
      messageId,
      inReplyTo: parent ? parent.message_id : null,
      references,
    });
    await db.query(`UPDATE warmup_messages SET status = 'sent', sent_at = now() WHERE id = $1`, [row.id]);
    await account.recordSuccess(from);
    return true;
  } catch (err) {
    await db.query(`UPDATE warmup_messages SET status = 'failed', error = $2 WHERE id = $1`, [row.id, errMessage(err)]);
    await account.recordFailure(from, err, 'Warmup send');
    return false;
  }
}

// Runs every minute: spreads today's warmup volume randomly across the window.
async function sendTick() {
  const s = await settings.all();
  const left = windowMinutesLeft(windowOf(s));
  if (!left) return;
  const members = await pool(s.timezone);
  if (members.length < 2) return;

  for (const sender of members.filter((m) => m.role === 'sender')) {
    const remaining = dailyTarget(sender) - sender.sent_today;
    if (remaining <= 0) continue;
    if (Math.random() >= remaining / left) continue;
    const receiver = chooseReceiver(sender, members);
    if (!receiver) continue;
    const msg = content.newConversation(sender, receiver);
    await sendOne({ sender, receiver, subject: msg.subject, body: msg.body });
  }

  // Replies that are due (scheduled by checkTick).
  const due = await db.many(
    `SELECT w.*, f.email AS from_email, f.from_name AS from_from_name, f.status AS from_status,
            t.email AS to_email, t.from_name AS to_from_name, t.status AS to_status
     FROM warmup_messages w
     JOIN mailboxes f ON f.id = w.from_mailbox_id
     JOIN mailboxes t ON t.id = w.to_mailbox_id
     WHERE w.reply_due_at <= now() AND NOT w.replied
     ORDER BY w.reply_due_at LIMIT 20`,
  );
  for (const p of due) {
    await db.query('UPDATE warmup_messages SET replied = true WHERE id = $1', [p.id]);
    if (p.to_status === 'error' || p.from_status === 'error') continue;
    // The receiver of the parent answers the parent's sender.
    const replier = { id: p.to_mailbox_id, email: p.to_email, from_name: p.to_from_name };
    const original = { id: p.from_mailbox_id, email: p.from_email, from_name: p.from_from_name };
    const { body } = content.reply(replier, original, p.body);
    await sendOne({ sender: replier, receiver: original, subject: replySubject(p.subject), body, parent: p });
  }
}

// Runs every few minutes: each receiving mailbox looks for its warmup mail.
async function checkTick() {
  const pending = await db.many(
    `SELECT w.*, f.email AS from_email
     FROM warmup_messages w
     JOIN mailboxes f ON f.id = w.from_mailbox_id
     JOIN mailboxes t ON t.id = w.to_mailbox_id
     WHERE w.status = 'sent' AND w.sent_at < now() - interval '2 minutes' AND t.status <> 'error'
     ORDER BY w.sent_at LIMIT 300`,
  );
  const byReceiver = new Map();
  for (const w of pending) {
    if (!byReceiver.has(w.to_mailbox_id)) byReceiver.set(w.to_mailbox_id, []);
    byReceiver.get(w.to_mailbox_id).push(w);
  }
  for (const [receiverId, items] of byReceiver) {
    const receiver = await account.loadMailbox(receiverId);
    if (!receiver) continue;
    try {
      await processReceiver(receiver, items);
      await account.recordSuccess(receiver);
    } catch (err) {
      await account.recordFailure(receiver, err, 'Warmup check (IMAP)');
    }
  }
}

async function processReceiver(receiver, items) {
  await imap.withImap(receiver, async (client) => {
    const info = await imap.folders(client);
    const found = new Map(); // warmup id -> 'inbox' | 'spam'

    // 1) Spam folder first: rescue anything that landed there.
    if (info.spam) {
      const lock = await client.getMailboxLock(info.spam);
      try {
        for (const w of items) {
          const uid = await imap.findUid(client, w.message_id, { from: w.from_email, subject: w.subject });
          if (!uid) continue;
          await client.messageMove(String(uid), 'INBOX', { uid: true });
          found.set(w.id, 'spam');
        }
      } finally {
        lock.release();
      }
    }

    // 2) Inbox: open it, mark read (sometimes important), file it away.
    const warmupFolder = await imap.ensureWarmupFolder(client, info);
    const lock = await client.getMailboxLock('INBOX');
    try {
      for (const w of items) {
        const uid = await imap.findUid(client, w.message_id, { from: w.from_email, subject: w.subject });
        if (!uid) continue;
        if (!found.has(w.id)) found.set(w.id, 'inbox');
        const flags = ['\\Seen'];
        if (chance(25)) flags.push('\\Flagged');
        await client.messageFlagsAdd(String(uid), flags, { uid: true });
        if (warmupFolder) await client.messageMove(String(uid), warmupFolder, { uid: true });
      }
    } finally {
      lock.release();
    }

    const rescued = new Map(); // sender email -> count
    for (const w of items) {
      const placement = found.get(w.id);
      if (placement) {
        const reply = w.depth < MAX_DEPTH && chance(receiver.warmup_reply_rate);
        await db.query(
          `UPDATE warmup_messages SET status = $2, checked_at = now(),
             reply_due_at = CASE WHEN $3 THEN now() + make_interval(mins => $4) ELSE NULL END
           WHERE id = $1`,
          [w.id, placement, reply, randInt(4, 90)],
        );
        if (placement === 'spam') rescued.set(w.from_email, (rescued.get(w.from_email) || 0) + 1);
      } else if (Date.now() - new Date(w.sent_at).getTime() > 3 * 3600 * 1000) {
        await db.query(`UPDATE warmup_messages SET status = 'missing', checked_at = now() WHERE id = $1`, [w.id]);
      }
    }
    if (rescued.size) {
      const list = [...rescued].map(([from, count]) => `${count} from ${from}`).join(', ');
      await logEvent('warmup', `${receiver.email} moved warmup emails out of spam: ${list}`, { level: 'warn', mailboxId: receiver.id });
    }
  });
}

// Placement stats per sending mailbox over the last `days` days.
async function stats(days = 14) {
  return db.many(
    `SELECT m.id, m.email, m.role, m.warmup_enabled, m.warmup_started_on, m.warmup_start_volume,
            m.warmup_increment, m.warmup_max_daily, m.warmup_reply_rate, m.status,
            count(w.*) FILTER (WHERE w.status IN ('sent','inbox','spam','missing'))::int AS sent,
            count(w.*) FILTER (WHERE w.status = 'inbox')::int AS inbox,
            count(w.*) FILTER (WHERE w.status = 'spam')::int AS spam,
            count(w.*) FILTER (WHERE w.status = 'missing')::int AS missing,
            count(w.*) FILTER (WHERE w.status = 'failed')::int AS failed,
            count(w.*) FILTER (WHERE w.depth > 0 AND w.status <> 'failed')::int AS replies
     FROM mailboxes m
     LEFT JOIN warmup_messages w ON w.from_mailbox_id = m.id AND w.created_at > now() - make_interval(days => $1)
     GROUP BY m.id ORDER BY m.email`,
    [days],
  );
}

async function daily(mailboxId, days = 14) {
  return db.many(
    `SELECT to_char(d, 'YYYY-MM-DD') AS day,
            count(w.*) FILTER (WHERE w.status = 'inbox')::int AS inbox,
            count(w.*) FILTER (WHERE w.status = 'spam')::int AS spam,
            count(w.*) FILTER (WHERE w.status IN ('missing','sent'))::int AS other
     FROM generate_series(current_date - ($2::int - 1), current_date, interval '1 day') d
     LEFT JOIN warmup_messages w ON w.from_mailbox_id = $1 AND w.created_at::date = d::date AND w.status <> 'failed'
     GROUP BY d ORDER BY d`,
    [mailboxId, days],
  );
}

module.exports = { sendTick, checkTick, stats, daily, dailyTarget, daysSince };
