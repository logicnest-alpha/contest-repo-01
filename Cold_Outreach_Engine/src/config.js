// Environment configuration. Everything else is edited from the Settings page.
const crypto = require('crypto');

const appSecret = process.env.APP_SECRET || '';
if (appSecret && appSecret.length < 32) {
  console.warn('APP_SECRET should be at least 32 characters long.');
}

module.exports = {
  port: Number(process.env.PORT || 3000),
  databaseUrl: process.env.DATABASE_URL || '',
  adminEmail: (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase(),
  adminPassword: process.env.ADMIN_PASSWORD || '',
  // Encrypts mailbox passwords + API keys at rest and signs login cookies.
  // Changing it makes stored mailbox passwords unreadable (you would re-enter them).
  appSecret,
  secretKey: crypto.createHash('sha256').update(`enc:${appSecret}`).digest(),
  signKey: crypto.createHash('sha256').update(`sig:${appSecret}`).digest(),
  // Public https URL of this app. Enables one-click unsubscribe links (RFC 8058).
  publicUrl: (process.env.PUBLIC_URL || '').replace(/\/+$/, ''),
  // Set ENGINES=off to run only the web UI (for example on a second instance).
  enginesEnabled: process.env.ENGINES !== 'off',
};
