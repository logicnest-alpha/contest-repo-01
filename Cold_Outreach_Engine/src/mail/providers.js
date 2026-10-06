// Server presets. Zoho organisation (custom-domain) accounts use the "pro" hosts;
// pick the region your Zoho account lives in (the URL you log in at: zoho.com, zoho.in, ...).
// Check yours in Zoho Mail > Settings > Mail Accounts > IMAP / SMTP.

// spf: the include Zoho shows in its admin console for that data centre. The domain
// health check accepts any include containing "zoho", so copy Zoho's exact value.
const zoho = (suffix, label, spf) => ({
  label: `Zoho Mail (${label})`,
  smtp_host: `smtppro.${suffix}`, smtp_port: 465, smtp_secure: true,
  imap_host: `imappro.${suffix}`, imap_port: 993,
  spf_include: `include:${spf}`,
});

const PROVIDERS = {
  'zoho-com': zoho('zoho.com', 'zoho.com - US', 'zohomail.com'),
  'zoho-in': zoho('zoho.in', 'zoho.in - India', 'zohomail.in'),
  'zoho-eu': zoho('zoho.eu', 'zoho.eu - Europe', 'zohomail.eu'),
  'zoho-au': zoho('zoho.com.au', 'zoho.com.au - Australia', 'zohomail.com.au'),
  'zoho-jp': zoho('zoho.jp', 'zoho.jp - Japan', 'zohomail.jp'),
  'zoho-ca': zoho('zohocloud.ca', 'zohocloud.ca - Canada', 'zohocloud.ca'),
  'zoho-sa': zoho('zoho.sa', 'zoho.sa - Saudi Arabia', 'zohomail.sa'),
  gmail: {
    label: 'Gmail / Google Workspace (app password)',
    smtp_host: 'smtp.gmail.com', smtp_port: 465, smtp_secure: true,
    imap_host: 'imap.gmail.com', imap_port: 993,
  },
  custom: {
    label: 'Other (enter servers manually)',
    smtp_host: '', smtp_port: 465, smtp_secure: true,
    imap_host: '', imap_port: 993,
  },
};

function list() {
  return Object.entries(PROVIDERS).map(([id, p]) => ({ id, ...p }));
}

module.exports = { PROVIDERS, list };
