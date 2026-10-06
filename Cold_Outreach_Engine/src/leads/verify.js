// Email verification. Bounces above ~2% damage a new domain fast, so every lead is checked
// before it can be emailed:
//   built-in (free): syntax, domain has MX, disposable domains, role addresses, free webmail
//   Hunter (optional API key): mailbox-level check incl. catch-all detection
const dns = require('dns').promises;
const settings = require('../settings');
const { normalizeEmail, domainOf } = require('../util');

const DISPOSABLE = new Set([
  'mailinator.com', 'guerrillamail.com', 'guerrillamail.net', '10minutemail.com', 'tempmail.com', 'temp-mail.org',
  'yopmail.com', 'trashmail.com', 'getnada.com', 'sharklasers.com', 'maildrop.cc', 'dispostable.com', 'fakeinbox.com',
  'throwawaymail.com', 'mintemail.com', 'mohmal.com', 'emailondeck.com', 'tempail.com', 'moakt.com', 'mail.tm',
]);
const FREE = new Set([
  'gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'yahoo.co.uk', 'hotmail.com', 'outlook.com', 'live.com',
  'msn.com', 'aol.com', 'icloud.com', 'me.com', 'proton.me', 'protonmail.com', 'zoho.com', 'zohomail.in', 'gmx.com',
  'yandex.com', 'rediffmail.com', 'mail.com',
]);
const ROLE = /^(info|sales|support|admin|contact|hello|office|team|marketing|help|enquiry|enquiries|inquiry|careers|jobs|hr|billing|accounts|noreply|no-reply|webmaster|postmaster|abuse|service|customerservice|newsletter|press|media)$/;

const mxCache = new Map();

async function hasMx(domain) {
  if (mxCache.has(domain)) return mxCache.get(domain);
  let ok;
  try {
    ok = (await dns.resolveMx(domain)).length > 0;
  } catch (err) {
    if (['ENOTFOUND', 'ENODATA'].includes(err.code)) {
      // No MX: mail falls back to the A record (RFC 5321), which is rare and risky.
      try { ok = (await dns.resolve4(domain)).length > 0 ? 'a-only' : false; } catch { ok = false; }
    } else {
      ok = 'unknown';
    }
  }
  mxCache.set(domain, ok);
  return ok;
}

async function basicCheck(rawEmail) {
  const email = normalizeEmail(rawEmail);
  if (!email) return { status: 'invalid', reason: 'Not a valid email address', checks: {} };
  const domain = domainOf(email);
  const local = email.split('@')[0];
  const checks = {
    disposable: DISPOSABLE.has(domain),
    role: ROLE.test(local),
    free: FREE.has(domain),
    mx: await hasMx(domain),
  };
  if (checks.disposable) return { status: 'invalid', reason: 'Disposable email domain', checks };
  if (checks.mx === false) return { status: 'invalid', reason: 'Domain cannot receive email (no MX)', checks };
  if (checks.mx === 'a-only') return { status: 'risky', reason: 'Domain has no MX record', checks };
  if (checks.role) return { status: 'risky', reason: 'Role address (info@, sales@ ...) - lower reply rates, more complaints', checks };
  if (checks.mx === 'unknown') return { status: 'unknown', reason: 'DNS lookup failed', checks };
  return { status: 'unknown', reason: 'Passed basic checks (add a Hunter key for mailbox-level verification)', checks, basicOk: true };
}

async function hunterVerify(email, key) {
  const url = `https://api.hunter.io/v2/email-verifier?email=${encodeURIComponent(email)}&api_key=${encodeURIComponent(key)}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (res.status === 202) return null; // still verifying on Hunter's side
  if (!res.ok) throw new Error(`Hunter ${res.status}: ${(body.errors && body.errors[0] && body.errors[0].details) || res.statusText}`);
  const d = body.data || {};
  // status: valid | invalid | accept_all | webmail | disposable | unknown
  const map = { valid: 'valid', webmail: 'valid', invalid: 'invalid', disposable: 'invalid', accept_all: 'risky', unknown: 'unknown' };
  return {
    status: map[d.status] || 'unknown',
    reason: `Hunter: ${d.status}${d.score != null ? ` (score ${d.score})` : ''}`,
    hunter: { status: d.status, result: d.result, score: d.score, smtp_check: d.smtp_check, accept_all: d.accept_all },
  };
}

// Returns { status: valid|risky|invalid|unknown, reason, checks, hunter? }
async function verifyEmail(email) {
  const basic = await basicCheck(email);
  if (basic.status === 'invalid' || (!basic.basicOk && basic.status !== 'risky')) return basic;
  const key = await settings.getSecret('hunter_api_key');
  if (!key) return basic;
  try {
    const h = await hunterVerify(normalizeEmail(email), key);
    if (!h) return basic;
    // A role address that Hunter confirms still stays "risky".
    if (basic.status === 'risky' && h.status === 'valid') return { ...basic, hunter: h.hunter };
    return { ...h, checks: basic.checks };
  } catch (err) {
    return { ...basic, reason: `${basic.reason}; Hunter check failed: ${err.message}` };
  }
}

module.exports = { verifyEmail, basicCheck };
