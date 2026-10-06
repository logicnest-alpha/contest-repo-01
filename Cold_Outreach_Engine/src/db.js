// PostgreSQL pool + tiny migration runner (every db/NNN_*.sql file runs once, in order).
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');
const config = require('./config');

let pool;

function makePool() {
  const url = config.databaseUrl;
  const useSsl = process.env.DATABASE_SSL === 'true' || /supabase\.(com|co)|render\.com|neon\.tech/.test(url);
  return new Pool({
    connectionString: url,
    max: Number(process.env.DB_POOL_SIZE || 8),
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
    ssl: useSsl ? { rejectUnauthorized: false } : false,
  });
}

async function migrate() {
  await pool.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`);
  const dir = path.join(__dirname, '..', 'db');
  const files = fs.readdirSync(dir).filter((f) => /^\d+_.*\.sql$/.test(f)).sort();
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  const done = new Set(rows.map((r) => r.name));
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await tx(async (c) => {
      await c.query(sql);
      await c.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
    });
    console.log(`Applied migration ${file}`);
  }
}

async function init() {
  if (!config.databaseUrl) throw new Error('DATABASE_URL is not set');
  pool = makePool();
  pool.on('error', (err) => console.error('[db] idle client error:', err.message));
  await pool.query('SELECT 1');
  await migrate();
}

function query(text, params) {
  return pool.query(text, params);
}

async function one(text, params) {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

async function many(text, params) {
  const { rows } = await pool.query(text, params);
  return rows;
}

// Run fn inside a transaction; fn receives a client with .query()
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

// Session-level advisory lock so only one process runs the background engines.
async function tryLeaderLock() {
  const client = await pool.connect();
  const { rows } = await client.query('SELECT pg_try_advisory_lock(727001) AS ok');
  if (rows[0].ok) return client; // keep this connection open for as long as we lead
  client.release();
  return null;
}

async function close() {
  if (pool) await pool.end();
}

module.exports = { init, query, one, many, tx, tryLeaderLock, close };
