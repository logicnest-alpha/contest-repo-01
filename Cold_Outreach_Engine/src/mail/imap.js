// IMAP helpers (reading inboxes, finding spam folders, moving warmup mail).
const { ImapFlow } = require('imapflow');

const WARMUP_FOLDER = 'Warmup';

function clientFor(mailbox) {
  const client = new ImapFlow({
    host: mailbox.imap_host,
    port: mailbox.imap_port,
    // 993 = implicit TLS (Zoho, Gmail). Other ports connect plain and upgrade with STARTTLS when offered.
    secure: Number(mailbox.imap_port) === 993,
    auth: { user: mailbox.username, pass: mailbox.password },
    logger: false,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 120000,
    tls: { rejectUnauthorized: process.env.MAIL_ALLOW_SELF_SIGNED !== 'true' },
  });
  client.on('error', (err) => console.warn(`[imap ${mailbox.email}]`, err.message));
  return client;
}

// Open a connection, run fn(client), always log out.
async function withImap(mailbox, fn) {
  const client = clientFor(mailbox);
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

// INBOX, the spam folder (Zoho: "Spam", Gmail: "[Gmail]/Spam") and the Sent folder.
async function folders(client) {
  const list = await client.list();
  const bySpecial = (flag) => list.find((f) => f.specialUse === flag);
  const byName = (re) => list.find((f) => re.test(f.name) || re.test(f.path));
  const spam = bySpecial('\\Junk') || byName(/^(spam|junk|junk e-?mail|bulk mail)$/i);
  const sent = bySpecial('\\Sent') || byName(/^(sent|sent items|sent mail)$/i);
  return {
    all: list.map((f) => f.path),
    inbox: 'INBOX',
    spam: spam ? spam.path : null,
    sent: sent ? sent.path : null,
    hasWarmup: list.some((f) => f.path === WARMUP_FOLDER || f.name === WARMUP_FOLDER),
  };
}

async function ensureWarmupFolder(client, info) {
  if (info.hasWarmup) return WARMUP_FOLDER;
  try {
    await client.mailboxCreate(WARMUP_FOLDER);
  } catch (err) {
    // Already exists (race) is fine; anything else means we just leave mail in the inbox.
    if (!/exist/i.test(err.message || '')) return null;
  }
  info.hasWarmup = true;
  return WARMUP_FOLDER;
}

// UID of the message with this Message-ID in the currently opened folder.
async function findUid(client, messageId, fallback) {
  const bare = String(messageId).replace(/^<|>$/g, '');
  let uids = await client.search({ header: { 'message-id': bare } }, { uid: true });
  if (uids && uids.length) return uids[uids.length - 1];
  // Some servers do not index the Message-ID header; fall back to from + subject and compare.
  if (fallback && fallback.from && fallback.subject) {
    uids = await client.search({ from: fallback.from, subject: fallback.subject }, { uid: true });
    if (uids && uids.length) {
      for await (const msg of client.fetch(uids.slice(-20), { envelope: true }, { uid: true })) {
        if (msg.envelope && String(msg.envelope.messageId || '').replace(/^<|>$/g, '') === bare) return msg.uid;
      }
    }
  }
  return null;
}

// Log in and list folders. Used by "Test connection".
async function test(mailbox) {
  return withImap(mailbox, async (client) => {
    const info = await folders(client);
    return { spam: info.spam, sent: info.sent, folders: info.all.length };
  });
}

module.exports = { withImap, folders, ensureWarmupFolder, findUid, test, WARMUP_FOLDER };
