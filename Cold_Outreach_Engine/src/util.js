// Shared helpers: secrets, signed tokens, time zones, randomness, activity log.
const crypto = require('crypto');
const config = require('./config');

// ---------------------------------------------------------------- secrets (AES-256-GCM)

function encrypt(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', config.secretKey, iv);
  const data = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  return ['v1', iv.toString('base64'), cipher.getAuthTag().toString('base64'), data.toString('base64')].join(':');
}

function decrypt(blob) {
  if (!blob) return '';
  const [v, iv, tag, data] = String(blob).split(':');
  if (v !== 'v1') throw new Error('Unknown secret format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', config.secretKey, Buffer.from(iv, 'base64'));
  decipher.setAuthTag(Buffer.from(tag, 'base64'));
  return Buffer.concat([decipher.update(Buffer.from(data, 'base64')), decipher.final()]).toString('utf8');
}

// ---------------------------------------------------------------- signed tokens

function b64url(buf) {
  return Buffer.from(buf).toString('base64url');
}

function sign(payload) {
  const body = b64url(JSON.stringify(payload));
  const mac = crypto.createHmac('sha256', config.signKey).update(body).digest('base64url');
  return `${body}.${mac}`;
}

function verify(token) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expected = crypto.createHmac('sha256', config.signKey).update(body).digest('base64url');
  const a = Buffer.from(mac);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
    if (payload.exp && Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

function safeEqual(a, b) {
  const ha = crypto.createHash('sha256').update(String(a)).digest();
  const hb = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(ha, hb);
}

// ---------------------------------------------------------------- time zones

const WEEKDAYS = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

// Wall-clock parts of `date` in time zone `tz`.
function zoned(tz, date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', weekday: 'short',
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }).formatToParts(date);
  const get = (t) => parts.find((p) => p.type === t).value;
  const hour = Number(get('hour')) % 24;
  const minute = Number(get('minute'));
  return {
    date: `${get('year')}-${get('month')}-${get('day')}`,
    weekday: WEEKDAYS[get('weekday')],
    hour,
    minute,
    minutes: hour * 60 + minute,
  };
}

function hhmmToMinutes(value) {
  const [h, m] = String(value || '0:0').split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function isValidTimeZone(tz) {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

// Is `date` inside the sending window? Returns minutes left in the window (0 = closed).
function windowMinutesLeft({ tz, days, start, end }, date = new Date()) {
  const now = zoned(tz, date);
  if (days && days.length && !days.map(Number).includes(now.weekday)) return 0;
  const s = hhmmToMinutes(start);
  const e = hhmmToMinutes(end);
  if (now.minutes < s || now.minutes >= e) return 0;
  return e - now.minutes;
}

// ---------------------------------------------------------------- randomness

function randInt(min, max) {
  return min + Math.floor(Math.random() * (max - min + 1));
}

function pick(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function chance(percent) {
  return Math.random() * 100 < percent;
}

function shuffle(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function newMessageId(email) {
  const domain = String(email).split('@')[1] || 'localhost';
  return `<${crypto.randomBytes(12).toString('hex')}.${Date.now().toString(36)}@${domain}>`;
}

// ---------------------------------------------------------------- misc

function domainOf(email) {
  const at = String(email || '').lastIndexOf('@');
  return at > 0 ? String(email).slice(at + 1).toLowerCase() : '';
}

function normalizeDomain(input) {
  let s = String(input || '').trim().toLowerCase();
  if (!s) return '';
  s = s.replace(/^[a-z]+:\/\//, '').replace(/^www\./, '');
  s = s.split(/[/?#:]/)[0];
  return /^[a-z0-9.-]+\.[a-z]{2,}$/.test(s) ? s : '';
}

const EMAIL_RE = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

function normalizeEmail(input) {
  const s = String(input || '').trim().toLowerCase().replace(/^mailto:/, '');
  return EMAIL_RE.test(s) && s.length <= 254 ? s : '';
}

function errMessage(err) {
  if (!err) return 'Unknown error';
  return String(err.response || err.message || err).slice(0, 500);
}

// Activity log shown on the dashboard. Never throws.
async function logEvent(kind, message, { level = 'info', mailboxId = null, campaignId = null, leadId = null } = {}) {
  try {
    const db = require('./db');
    await db.query(
      'INSERT INTO events (kind, level, message, mailbox_id, campaign_id, lead_id) VALUES ($1,$2,$3,$4,$5,$6)',
      [kind, level, String(message).slice(0, 1000), mailboxId, campaignId, leadId],
    );
  } catch (err) {
    console.error('[event]', err.message);
  }
  if (level !== 'info') console.log(`[${level}] ${kind}: ${message}`);
}

module.exports = {
  encrypt, decrypt, sign, verify, safeEqual,
  zoned, hhmmToMinutes, isValidTimeZone, windowMinutesLeft,
  randInt, pick, chance, shuffle, newMessageId,
  domainOf, normalizeDomain, normalizeEmail, errMessage, logEvent,
};
