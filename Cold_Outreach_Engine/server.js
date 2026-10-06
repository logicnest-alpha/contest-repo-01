// Cold Outreach Engine - web server + background engines
const fs = require('fs');
const path = require('path');

// Load .env when present (real environment variables win).
const envFile = path.join(__dirname, '.env');
if (fs.existsSync(envFile) && process.loadEnvFile) process.loadEnvFile(envFile);

const express = require('express');
const config = require('./src/config');
const db = require('./src/db');
const scheduler = require('./src/engine/scheduler');

if (!config.appSecret || config.appSecret.length < 32) {
  console.error('Set APP_SECRET to a random string of at least 32 characters (it encrypts mailbox passwords).');
  process.exit(1);
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; "
      + "connect-src 'self'; frame-ancestors 'none'; form-action 'self'",
  });
  next();
});

app.get('/healthz', (req, res) => res.json({ ok: true }));
app.use(require('./src/unsubscribe'));
// CSV uploads can be large; every other API body is small.
app.use('/api/leads/import', express.json({ limit: '25mb' }));
app.use(express.json({ limit: '2mb' }));
app.use('/api', require('./src/api'));
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  if (err.type === 'entity.too.large') return res.status(413).json({ error: 'That upload is too large' });
  if (err.status && err.status < 500) return res.status(err.status).json({ error: err.message });
  switch (err.code) {
    case '23505': return res.status(409).json({ error: 'That already exists' });
    case '23514': case '23502': case '22P02': case '22003': case '23503':
      return res.status(400).json({ error: `Invalid value: ${err.detail || err.message}` });
    default:
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong on the server' });
  }
});

let server;
db.init()
  .then(() => {
    server = app.listen(config.port, () => console.log(`Cold Outreach Engine on http://localhost:${config.port}`));
    if (config.enginesEnabled) scheduler.start();
    else console.log('ENGINES=off: background sending / warmup / sync are disabled on this instance');
  })
  .catch((err) => {
    console.error('Could not start:', err.message);
    process.exit(1);
  });

function shutdown() {
  scheduler.stop();
  if (server) server.close();
  db.close().finally(() => process.exit(0));
}
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
