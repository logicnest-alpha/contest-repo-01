// Login with bcrypt-hashed passwords and stateless JSON Web Tokens.
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('./db');

const SECRET = process.env.JWT_SECRET || 'dev-only-secret-change-me';
const TOKEN_TTL = '12h';

// very small in-memory brute-force guard: 10 failed attempts / 15 min / IP
const failures = new Map();
function tooManyFailures(ip) {
  const entry = failures.get(ip);
  if (!entry) return false;
  if (Date.now() - entry.first > 15 * 60 * 1000) {
    failures.delete(ip);
    return false;
  }
  return entry.count >= 10;
}
function recordFailure(ip) {
  const entry = failures.get(ip) || { count: 0, first: Date.now() };
  entry.count += 1;
  failures.set(ip, entry);
}

async function login(req, res) {
  const { username, password } = req.body || {};
  if (tooManyFailures(req.ip)) {
    return res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
  }
  if (!username || !password) {
    return res.status(400).json({ error: 'Enter username and password' });
  }
  const { rows } = await db.query(
    'SELECT staff_id, full_name, username, role, password_hash FROM staff WHERE username = $1 AND is_active',
    [String(username).trim().toLowerCase()]
  );
  const user = rows[0];
  if (!user || !(await bcrypt.compare(String(password), user.password_hash))) {
    recordFailure(req.ip);
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  failures.delete(req.ip);
  const profile = { staff_id: user.staff_id, full_name: user.full_name, username: user.username, role: user.role };
  const token = jwt.sign(profile, SECRET, { expiresIn: TOKEN_TTL });
  res.json({ token, user: profile });
}

function requireAuth(req, res, next) {
  const header = req.get('authorization') || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Please log in' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Session expired, please log in again' });
  }
}

// allow(...roles): only these roles may call the route (MANAGER always may)
function allow(...roles) {
  return (req, res, next) => {
    if (req.user.role === 'MANAGER' || roles.includes(req.user.role)) return next();
    res.status(403).json({ error: `This action needs one of: ${['MANAGER', ...roles].join(', ')}` });
  };
}

module.exports = { login, requireAuth, allow };
