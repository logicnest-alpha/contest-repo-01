// App settings stored in the `settings` table. API keys are encrypted at rest.
const db = require('./db');
const { encrypt, decrypt } = require('./util');

const DEFAULTS = {
  timezone: 'Asia/Kolkata',
  company_name: '',
  physical_address: '',
  // Appended to campaign emails (plain text). Keep it short and human.
  optout_line: "P.S. Not the right person or not relevant? Just reply \"no\" and I won't follow up.",
  // Warmup sends only inside this daily window (in `timezone`).
  warmup_window_start: '08:00',
  warmup_window_end: '20:00',
  warmup_weekends: true,
  // Mailboxes need this many warmup days before campaigns may use them.
  min_warmup_days: 14,
  // Auto-pause a mailbox's campaigns when these are crossed (last 7 days).
  max_bounce_rate: 4,        // % of campaign emails that bounced
  max_spam_rate: 15,         // % of warmup emails that landed in spam
  ai_model: 'claude-opus-5-5',
};

// Integration keys: stored encrypted; environment variables work as a fallback.
const SECRETS = {
  anthropic_api_key: 'ANTHROPIC_API_KEY',
  apollo_api_key: 'APOLLO_API_KEY',
  hunter_api_key: 'HUNTER_API_KEY',
  google_places_api_key: 'GOOGLE_PLACES_API_KEY',
};

let cache = null;

async function load() {
  const rows = await db.many('SELECT key, value FROM settings');
  const values = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS) values[r.key] = r.value;
  cache = values;
  return values;
}

async function all() {
  return cache || load();
}

async function get(key) {
  return (await all())[key];
}

async function update(patch) {
  for (const [key, value] of Object.entries(patch)) {
    if (!(key in DEFAULTS)) continue;
    await db.query(
      `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
      [key, JSON.stringify(value)],
    );
  }
  return load();
}

async function getSecret(name) {
  if (!(name in SECRETS)) throw new Error(`Unknown secret ${name}`);
  const row = await db.one('SELECT value FROM settings WHERE key = $1', [`secret:${name}`]);
  if (row && row.value) {
    try {
      return decrypt(row.value);
    } catch {
      console.warn(`Stored ${name} cannot be decrypted (APP_SECRET changed?)`);
    }
  }
  return process.env[SECRETS[name]] || '';
}

async function setSecret(name, value) {
  if (!(name in SECRETS)) throw new Error(`Unknown secret ${name}`);
  if (!value) {
    await db.query('DELETE FROM settings WHERE key = $1', [`secret:${name}`]);
    return;
  }
  await db.query(
    `INSERT INTO settings (key, value, updated_at) VALUES ($1, $2, now())
     ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()`,
    [`secret:${name}`, JSON.stringify(encrypt(value))],
  );
}

// Which integrations are configured (never returns the keys themselves).
async function secretStatus() {
  const out = {};
  for (const name of Object.keys(SECRETS)) out[name] = Boolean(await getSecret(name));
  return out;
}

module.exports = { DEFAULTS, SECRETS, all, get, update, getSecret, setSecret, secretStatus, reload: load };
