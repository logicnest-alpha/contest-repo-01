// Small helpers shared by the route files.

// Wrap async route handlers so errors reach the Express error handler.
const ah = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const bad = (message) => new HttpError(400, message);
const notFound = (what = 'Not found') => new HttpError(404, what);

function int(value, { min = -Infinity, max = Infinity, def = null } = {}) {
  if (value === undefined || value === null || value === '') return def;
  const n = Number(value);
  if (!Number.isInteger(n)) throw bad(`Expected a whole number, got "${value}"`);
  if (n < min || n > max) throw bad(`Number ${n} must be between ${min} and ${max}`);
  return n;
}

function str(value, { max = 500, required = false, name = 'value' } = {}) {
  const s = value === undefined || value === null ? '' : String(value).trim();
  if (required && !s) throw bad(`${name} is required`);
  if (s.length > max) throw bad(`${name} is too long (max ${max} characters)`);
  return s;
}

function bool(value, def = false) {
  if (value === undefined || value === null || value === '') return def;
  return value === true || value === 'true' || value === 1 || value === '1' || value === 'on';
}

function list(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '').split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
}

function hhmm(value, def) {
  const s = String(value || def || '').trim();
  if (!/^([01]?\d|2[0-3]):[0-5]\d$/.test(s)) throw bad(`Time must look like 09:30, got "${s}"`);
  return s;
}

module.exports = { ah, HttpError, bad, notFound, int, str, bool, list, hhmm };
