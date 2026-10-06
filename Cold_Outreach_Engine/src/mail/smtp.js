// Outgoing mail through each mailbox's own SMTP server (Zoho signs it with your DKIM key).
const nodemailer = require('nodemailer');

const transports = new Map(); // mailbox id -> { key, transport }

function transportFor(mailbox) {
  const key = [mailbox.smtp_host, mailbox.smtp_port, mailbox.smtp_secure, mailbox.username, mailbox.password].join('|');
  const cached = transports.get(mailbox.id);
  if (cached && cached.key === key) return cached.transport;
  if (cached) cached.transport.close();
  const transport = nodemailer.createTransport({
    host: mailbox.smtp_host,
    port: mailbox.smtp_port,
    secure: mailbox.smtp_secure,
    requireTLS: !mailbox.smtp_secure,
    auth: { user: mailbox.username, pass: mailbox.password },
    pool: true,
    maxConnections: 1,
    maxMessages: 50,
    connectionTimeout: 20000,
    greetingTimeout: 15000,
    socketTimeout: 60000,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: process.env.MAIL_ALLOW_SELF_SIGNED !== 'true' },
  });
  transports.set(mailbox.id, { key, transport });
  return transport;
}

function forget(mailboxId) {
  const cached = transports.get(mailboxId);
  if (cached) cached.transport.close();
  transports.delete(mailboxId);
}

// Plain text first: cold email that looks like a normal 1:1 email gets the best placement.
// `html` is optional and only added when the caller passes it.
async function send(mailbox, { to, subject, text, html, messageId, inReplyTo, references, headers = {} }) {
  const transport = transportFor(mailbox);
  const info = await transport.sendMail({
    from: { name: mailbox.from_name || '', address: mailbox.email },
    to,
    subject,
    text,
    html,
    messageId,
    inReplyTo: inReplyTo || undefined,
    references: references || undefined,
    headers,
    textEncoding: 'quoted-printable',
  });
  return info;
}

async function verify(mailbox) {
  const transport = nodemailer.createTransport({
    host: mailbox.smtp_host,
    port: mailbox.smtp_port,
    secure: mailbox.smtp_secure,
    requireTLS: !mailbox.smtp_secure,
    auth: { user: mailbox.username, pass: mailbox.password },
    connectionTimeout: 15000,
    tls: { minVersion: 'TLSv1.2', rejectUnauthorized: process.env.MAIL_ALLOW_SELF_SIGNED !== 'true' },
  });
  try {
    await transport.verify();
  } finally {
    transport.close();
  }
}

module.exports = { send, verify, forget };
