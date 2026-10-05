// Restaurant Order Management System - web server
const path = require('path');
const express = require('express');
const db = require('./src/db');
const api = require('./src/api');

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Content-Security-Policy':
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; " +
      "img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
  });
  next();
});

app.use(express.json({ limit: '100kb' }));
app.use('/api', api);
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use(express.static(path.join(__dirname, 'public'), { maxAge: 0 }));
app.get('*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

// Turn database errors into clear messages for the user
app.use((err, req, res, next) => {
  if (err.type === 'entity.parse.failed') return res.status(400).json({ error: 'Invalid JSON' });
  switch (err.code) {
    case 'P0001': // RAISE EXCEPTION in a PL/pgSQL function / trigger
      return res.status(400).json({ error: err.message });
    case '23505':
      return res.status(409).json({ error: 'That would create a duplicate (for example a second open order on the same table or a duplicate name).' });
    case '23514': case '23502': case '22P02': case '22003': case '23503':
      return res.status(400).json({ error: `Invalid value: ${err.detail || err.message}` });
    case '57014':
      return res.status(503).json({ error: 'The database took too long to answer, please retry.' });
    default:
      console.error(err);
      return res.status(500).json({ error: 'Something went wrong on the server' });
  }
});

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => app.listen(PORT, () => {
    console.log(`RMS listening on port ${PORT}`);
    if (process.env.SMOKE_TEST === 'true') {
      require('./scripts/smoke-test').smokeTest(`http://127.0.0.1:${PORT}`).catch((e) => console.error('[smoke]', e.message));
    }
  }))
  .catch((err) => {
    console.error('Could not connect to the database:', err.message);
    process.exit(1);
  });
