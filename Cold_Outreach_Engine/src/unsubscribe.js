// Public one-click unsubscribe (RFC 8058). Only active when PUBLIC_URL is set.
const express = require('express');
const db = require('./db');
const { verify, logEvent } = require('./util');
const { suppress, stopLead } = require('./leads/suppress');

const router = express.Router();

function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title><style>body{font-family:system-ui,sans-serif;max-width:480px;margin:15vh auto;padding:0 20px;color:#222}
button{font:inherit;padding:10px 18px;border-radius:8px;border:1px solid #222;background:#222;color:#fff;cursor:pointer}</style></head>
<body>${message}</body></html>`;
}

async function optOut(token) {
  const payload = verify(token);
  if (!payload || !payload.l) return false;
  const lead = await db.one('SELECT id, email FROM leads WHERE id = $1', [payload.l]);
  if (!lead || !lead.email) return true;
  await suppress(lead.email, 'Unsubscribe link');
  await db.query(`UPDATE leads SET status = 'unsubscribed', updated_at = now() WHERE id = $1`, [lead.id]);
  await stopLead(lead.id, 'unsubscribed', 'Unsubscribe link');
  await logEvent('unsubscribe', `${lead.email} unsubscribed via link`, { leadId: lead.id });
  return true;
}

// Mail clients POST here for one-click unsubscribe; people who click land on GET first.
router.get('/u/:token', (req, res) => {
  if (!verify(req.params.token)) return res.status(400).send(page('Invalid link', '<p>This link is not valid.</p>'));
  res.send(page('Unsubscribe', `<h2>Stop these emails?</h2><p>Click below and you will not hear from us again.</p>
    <form method="post"><button type="submit">Unsubscribe</button></form>`));
});

router.post('/u/:token', express.urlencoded({ extended: false }), async (req, res, next) => {
  try {
    const ok = await optOut(req.params.token);
    if (!ok) return res.status(400).send(page('Invalid link', '<p>This link is not valid.</p>'));
    res.send(page('Unsubscribed', '<h2>Done.</h2><p>You have been removed and will not receive further emails.</p>'));
  } catch (err) {
    next(err);
  }
});

module.exports = router;
