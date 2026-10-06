// Single-owner login (ADMIN_EMAIL / ADMIN_PASSWORD) with an HMAC-signed HttpOnly cookie.
const config = require('./config');
const { sign, verify, safeEqual } = require('./util');

const COOKIE = 'coe_session';
const SESSION_DAYS = 7;
const attempts = new Map(); // ip -> { count, until }

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

function setSessionCookie(req, res, token, maxAgeSeconds) {
  const secure = req.secure ? '; Secure' : '';
  res.setHeader('Set-Cookie',
    `${COOKIE}=${encodeURIComponent(token)}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAgeSeconds}${secure}`);
}

function login(req, res) {
  const ip = req.ip || 'unknown';
  const now = Date.now();
  const a = attempts.get(ip) || { count: 0, until: 0 };
  if (a.until > now) {
    return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
  }
  const { email, password } = req.body || {};
  if (!config.adminPassword) {
    return res.status(500).json({ error: 'ADMIN_PASSWORD is not set on the server.' });
  }
  const ok = safeEqual(String(email || '').trim().toLowerCase(), config.adminEmail)
    && safeEqual(String(password || ''), config.adminPassword);
  if (!ok) {
    a.count += 1;
    if (a.count >= 5) { a.until = now + 10 * 60 * 1000; a.count = 0; }
    attempts.set(ip, a);
    return res.status(401).json({ error: 'Wrong email or password' });
  }
  attempts.delete(ip);
  const token = sign({ sub: config.adminEmail, exp: now + SESSION_DAYS * 86400 * 1000 });
  setSessionCookie(req, res, token, SESSION_DAYS * 86400);
  res.json({ email: config.adminEmail });
}

function logout(req, res) {
  setSessionCookie(req, res, '', 0);
  res.json({ ok: true });
}

function requireAuth(req, res, next) {
  const session = verify(readCookie(req, COOKIE));
  if (!session) return res.status(401).json({ error: 'Please log in' });
  req.user = session.sub;
  next();
}

module.exports = { login, logout, requireAuth };
