// PostgreSQL connection pool.
// DATABASE_URL may hold several comma-separated candidate URLs (for example
// two pooler hosts); the first one that answers is used.
const { Pool } = require('pg');

let pool;

function makePool(url) {
  const useSsl = process.env.DATABASE_SSL === 'true' || /supabase\.com/.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_SIZE || 5),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}

async function init() {
  const candidates = (process.env.DATABASE_URL || '')
    .split(',').map((s) => s.trim()).filter(Boolean);
  if (!candidates.length) throw new Error('DATABASE_URL is not set');

  let lastError;
  for (const url of candidates) {
    // search_path (rms) and timezone (Asia/Kolkata) come from ALTER ROLE rms_app
    const candidate = makePool(url);
    try {
      await candidate.query('SELECT 1 FROM staff LIMIT 1');
      pool = candidate;
      console.log(`Connected to database host ${new URL(url).hostname}`);
      return;
    } catch (err) {
      lastError = err;
      console.warn(`Database candidate ${new URL(url).hostname} failed: ${err.message}`);
      await candidate.end().catch(() => {});
    }
  }
  throw lastError;
}

function query(text, params) {
  return pool.query(text, params);
}

// Run fn(client) inside BEGIN ... COMMIT; roll back on any error.
async function tx(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

module.exports = { init, query, tx };
