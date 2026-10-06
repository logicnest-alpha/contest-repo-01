// Unit tests for the pure logic (no database or mail server needed): npm test
process.env.APP_SECRET = process.env.APP_SECRET || 'unit-test-secret-0123456789abcdef0123456789';

const test = require('node:test');
const assert = require('node:assert');
const { simpleParser } = require('mailparser');
const util = require('../src/util');
const compose = require('../src/mail/compose');
const spamcheck = require('../src/mail/spamcheck');
const classify = require('../src/engine/classify');
const { parseCsv } = require('../src/leads/sources/csv');
const { scoreLead } = require('../src/leads/icp');
const { prepare } = require('../src/leads/store');
const { orgDomain } = require('../src/mail/dns');
const health = require('../src/engine/health');
const { effectiveDailyLimit } = require('../src/engine/sender');
const { dailyTarget } = require('../src/engine/warmup');

test('secrets round-trip and tampering is detected', () => {
  const blob = util.encrypt('app-password-123');
  assert.notStrictEqual(blob, 'app-password-123');
  assert.strictEqual(util.decrypt(blob), 'app-password-123');
  const parts = blob.split(':');
  parts[3] = Buffer.from('tampered').toString('base64');
  assert.throws(() => util.decrypt(parts.join(':')));
});

test('signed tokens verify and expire', () => {
  const t = util.sign({ l: 42 });
  assert.deepStrictEqual(util.verify(t), { l: 42 });
  assert.strictEqual(util.verify(`${t}x`), null);
  assert.strictEqual(util.verify(util.sign({ exp: Date.now() - 1 })), null);
});

test('sending window respects days and hours in the time zone', () => {
  // 2026-10-06 is a Tuesday. 04:30 UTC = 10:00 in Kolkata.
  const at = new Date('2026-10-06T04:30:00Z');
  const w = { tz: 'Asia/Kolkata', days: [1, 2, 3, 4, 5], start: '09:00', end: '17:00' };
  assert.strictEqual(util.windowMinutesLeft(w, at), 420);
  assert.strictEqual(util.windowMinutesLeft({ ...w, days: [6, 7] }, at), 0);
  assert.strictEqual(util.windowMinutesLeft({ ...w, start: '11:00' }, at), 0);
});

test('email and domain normalisation', () => {
  assert.strictEqual(util.normalizeEmail(' John.Doe@Acme.IO '), 'john.doe@acme.io');
  assert.strictEqual(util.normalizeEmail('not-an-email'), '');
  assert.strictEqual(util.normalizeDomain('https://www.Acme.io/about?x=1'), 'acme.io');
  assert.strictEqual(orgDomain('mail.brand.co.in'), 'brand.co.in');
  assert.strictEqual(orgDomain('go.brand.com'), 'brand.com');
});

test('templates: variables, fallbacks, nested fallbacks, custom fields, missing values', () => {
  const vars = compose.leadVars(
    { first_name: 'PRIYA', company: 'Acme Analytics Pvt Ltd', custom: { 'pain point': 'slow hiring' } },
    { from_name: 'Vishal Chepyala', email: 'v@mail.brand.com' },
  );
  assert.strictEqual(vars.first_name, 'Priya');
  assert.strictEqual(vars.company, 'Acme Analytics');
  assert.strictEqual(vars.sender_first_name, 'Vishal');
  assert.strictEqual(compose.fill('Hi {{first_name}}', vars).text, 'Hi Priya');
  assert.strictEqual(compose.fill('Hi {{last_name|there}}', vars).text, 'Hi there');
  assert.strictEqual(compose.fill('{{icebreaker|Saw {{company}} online.}}', vars).text, 'Saw Acme Analytics online.');
  assert.strictEqual(compose.fill('{{custom.pain_point}} / {{pain_point}}', vars).text, 'slow hiring / slow hiring');
  assert.deepStrictEqual(compose.fill('Hi {{last_name}}', vars).missing, ['last_name']);
});

test('spintax picks one option and leaves variables intact', () => {
  for (let i = 0; i < 20; i++) {
    const out = compose.spin('{Hi|Hello|Hey} {{first_name|there}}, {quick|short} {question|note}');
    assert.match(out, /^(Hi|Hello|Hey) \{\{first_name\|there\}\}, (quick|short) (question|note)$/);
  }
});

test('campaign email: first email starts a thread, follow-up replies in it', () => {
  const campaign = { timezone: 'Asia/Kolkata', unsubscribe_header: true };
  const mailbox = { email: 'v@mail.brand.com', from_name: 'Vishal', signature: 'Vishal\nBrand' };
  const lead = { id: 7, email: 'p@acme.io', first_name: 'Priya', company: 'Acme' };
  const settings = { optout_line: 'Reply "no" to opt out.', physical_address: '' };
  const first = compose.buildCampaignEmail({ campaign, mailbox, lead, settings, campaignLead: null, step: { step_no: 1, subject: '{{company}} idea', body: 'Hi {{first_name}}' } });
  assert.strictEqual(first.subject, 'Acme idea');
  assert.strictEqual(first.newThread, true);
  assert.match(first.text, /^Hi Priya\n\nVishal\nBrand\n\nReply "no" to opt out\.$/);
  assert.match(first.headers['List-Unsubscribe'], /mailto:v@mail\.brand\.com\?subject=unsubscribe/);

  const cl = { thread_message_id: first.messageId, last_message_id: first.messageId, thread_subject: first.subject, references_hdr: null };
  const second = compose.buildCampaignEmail({ campaign, mailbox, lead, settings, campaignLead: cl, step: { step_no: 2, subject: '', body: 'Bumping this' } });
  assert.strictEqual(second.subject, 'Re: Acme idea');
  assert.strictEqual(second.inReplyTo, first.messageId);
  assert.strictEqual(second.references, first.messageId);
  assert.strictEqual(second.newThread, false);
});

test('spam check rewards plain personal emails and flags spammy ones', () => {
  const good = spamcheck.check({ subject: 'quick question', body: '{Hi|Hello} {{first_name|there}},\n\nSaw {{company}} is hiring SDRs. We help teams ramp new reps in half the time.\n\nWorth a chat?', stepNo: 1 });
  assert.ok(good.score >= 85, `good email scored ${good.score}`);
  const bad = spamcheck.check({ subject: 'FREE MONEY!!!', body: 'Click here https://bit.ly/x to get CASH NOW!!! 100% free, act now. GUARANTEED RESULTS', stepNo: 1 });
  assert.ok(bad.score < 40, `spammy email scored ${bad.score}`);
  // whole-word matching: "ideal" is not "deal"
  assert.ok(!spamcheck.check({ subject: 'idea', body: 'An ideal fit for {{company}}', stepNo: 2 }).issues.some((i) => /trigger/.test(i.message)));
});

test('reply parsing: quoted text, auto-replies, categories', () => {
  assert.strictEqual(classify.latestReply('Sounds good!\n\nOn Tue, 6 Oct 2026, Vishal wrote:\n> Hi Priya'), 'Sounds good!');
  assert.strictEqual(classify.latestReply('Yes please\n> quoted'), 'Yes please');
  const headers = new Map([['auto-submitted', 'auto-replied']]);
  assert.strictEqual(classify.isAutoReply(headers, 'Re: hello'), true);
  assert.strictEqual(classify.isAutoReply(new Map(), 'Out of Office: back Monday'), true);
  assert.strictEqual(classify.isAutoReply(new Map(), 'Re: your email'), false);
  assert.strictEqual(classify.ruleCategory('Please remove me from your list'), 'unsubscribe');
  assert.strictEqual(classify.ruleCategory('No thanks, not interested'), 'not_interested');
  assert.strictEqual(classify.ruleCategory('no'), 'not_interested');
  assert.strictEqual(classify.ruleCategory('Sounds interesting, can we book a call Thursday?'), 'interested');
  assert.strictEqual(classify.ruleCategory('How does this work with Shopify?'), 'question');
  assert.strictEqual(classify.ruleCategory("I'm not the right person, reach out to anil@acme.io"), 'referral');
});

test('bounce notices (DSN) are recognised with recipient and status', async () => {
  const raw = [
    'From: Mail Delivery System <MAILER-DAEMON@mx.example>',
    'To: v@mail.brand.com',
    'Subject: Undelivered Mail Returned to Sender',
    'MIME-Version: 1.0',
    'Content-Type: multipart/report; report-type=delivery-status; boundary="B"',
    '',
    '--B',
    'Content-Type: text/plain',
    '',
    'Delivery failed.',
    '--B',
    'Content-Type: message/delivery-status',
    '',
    'Reporting-MTA: dns; mx.example',
    '',
    'Final-Recipient: rfc822; ghost@acme.io',
    'Action: failed',
    'Status: 5.1.1',
    '--B',
    'Content-Type: text/rfc822-headers',
    '',
    'Message-ID: <abc123@mail.brand.com>',
    'Subject: Acme idea',
    '--B--',
    '',
  ].join('\r\n');
  const b = classify.detectBounce(await simpleParser(raw));
  assert.strictEqual(b.recipient, 'ghost@acme.io');
  assert.strictEqual(b.status, '5.1.1');
  assert.strictEqual(b.hard, true);
  assert.strictEqual(b.originalMessageId, '<abc123@mail.brand.com>');
  const normal = await simpleParser('From: priya@acme.io\r\nSubject: Re: Acme idea\r\n\r\nSounds good');
  assert.strictEqual(classify.detectBounce(normal), null);
});

test('CSV import maps common export columns and keeps the rest as variables', () => {
  const { mapping, rows } = parseCsv('First Name,Last Name,Work Email,Company Name,Website,# Employees,Email Status,Pain Point\nPriya,Sharma,P@Acme.io,Acme,acme.io,11-50,Verified,slow hiring\n');
  assert.strictEqual(mapping['Work Email'], 'email');
  assert.strictEqual(rows[0].email_status, 'valid');
  assert.strictEqual(rows[0].custom.pain_point, 'slow hiring');
  const lead = prepare(rows[0]);
  assert.strictEqual(lead.email, 'p@acme.io');
  assert.strictEqual(lead.company_domain, 'acme.io');
  assert.strictEqual(lead.employees, 31);
  assert.strictEqual(lead.website, 'https://acme.io');
});

test('ICP score weights title, industry, location, size and keywords; exclusions zero it', () => {
  const icp = { titles: ['founder', 'ceo'], industries: ['ecommerce'], locations: ['india'], keywords: ['shopify'], exclude_keywords: ['agency'], min_employees: 10, max_employees: 200 };
  const perfect = { title: 'Co-Founder & CEO', industry: 'Ecommerce', country: 'India', employees: 40, enrichment: { tech: ['Shopify'] } };
  assert.strictEqual(scoreLead(perfect, icp), 100);
  assert.strictEqual(scoreLead({ ...perfect, title: 'Intern' }, icp), 65);
  assert.strictEqual(scoreLead({ ...perfect, company: 'Growth Agency' }, icp), 0);
});

test('ramps: warmup volume and campaign limit grow slowly', () => {
  const today = new Date().toISOString().slice(0, 10);
  const tenDaysAgo = new Date(Date.now() - 10 * 86400000).toISOString().slice(0, 10);
  assert.strictEqual(dailyTarget({ warmup_started_on: today, warmup_start_volume: 3, warmup_increment: 2, warmup_max_daily: 35 }), 3);
  assert.strictEqual(dailyTarget({ warmup_started_on: tenDaysAgo, warmup_start_volume: 3, warmup_increment: 2, warmup_max_daily: 35 }), 23);
  assert.strictEqual(effectiveDailyLimit({ campaign_ramp: true, first_campaign_send_on: null, daily_campaign_limit: 30 }), 5);
  assert.strictEqual(effectiveDailyLimit({ campaign_ramp: true, first_campaign_send_on: tenDaysAgo, daily_campaign_limit: 30 }), 30);
  assert.strictEqual(effectiveDailyLimit({ campaign_ramp: false, first_campaign_send_on: null, daily_campaign_limit: 30 }), 30);
});

test('health score drops with spam placement and bounces', () => {
  const clean = health.score({ sent_7d: 100, bounces_7d: 1, warm_checked_7d: 100, warm_spam_7d: 2, replies_7d: 5, status: 'active', dns_report: { score: 100 } });
  const bad = health.score({ sent_7d: 100, bounces_7d: 8, warm_checked_7d: 100, warm_spam_7d: 30, replies_7d: 0, status: 'active', dns_report: { score: 50 } });
  assert.ok(clean.health >= 90, `clean ${clean.health}`);
  assert.ok(bad.health < 40, `bad ${bad.health}`);
  assert.strictEqual(bad.spam_rate, 30);
  assert.strictEqual(clean.reply_rate, 5);
});
