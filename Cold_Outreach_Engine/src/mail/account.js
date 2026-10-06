// Mailbox credentials + connection health bookkeeping.
const db = require('../db');
const { decrypt, errMessage, logEvent } = require('../util');

async function loadMailbox(id) {
  const row = await db.one('SELECT * FROM mailboxes WHERE id = $1', [id]);
  if (!row) return null;
  return withPassword(row);
}

function withPassword(row) {
  let password = '';
  try {
    password = decrypt(row.password_enc);
  } catch {
    password = '';
  }
  return { ...row, password };
}

function isAuthError(err) {
  if (!err) return false;
  if (err.authenticationFailed || err.code === 'EAUTH') return true;
  const text = `${errMessage(err)} ${err.responseText || ''}`;
  return /\b(534|535)\b|AUTHENTICATIONFAILED|invalid credentials|authentication failed/i.test(text);
}

// Record a connection failure. Auth failures, or 5 failures in a row, put the
// mailbox into "error" so nothing else is sent from it until you fix it.
async function recordFailure(mailbox, err, what) {
  const message = `${what}: ${errMessage(err)}`;
  const auth = isAuthError(err);
  const row = await db.one(
    `UPDATE mailboxes SET last_error = $2, last_error_at = now(), error_count = error_count + 1
     WHERE id = $1 RETURNING error_count, status`,
    [mailbox.id, message],
  );
  if (row && row.status !== 'error' && (auth || row.error_count >= 5)) {
    await db.query(`UPDATE mailboxes SET status = 'error', status_reason = $2 WHERE id = $1`, [
      mailbox.id,
      auth ? 'Login failed - check the password / app password and that IMAP is enabled in Zoho' : message,
    ]);
    await logEvent('mailbox', `${mailbox.email} stopped: ${message}`, { level: 'error', mailboxId: mailbox.id });
  }
}

async function recordSuccess(mailbox) {
  if (mailbox.error_count > 0) {
    await db.query('UPDATE mailboxes SET error_count = 0 WHERE id = $1', [mailbox.id]);
  }
}

module.exports = { loadMailbox, withPassword, recordFailure, recordSuccess, isAuthError };
