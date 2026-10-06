// Lead sources with a stubbed network: request shape + response mapping.
process.env.APP_SECRET = process.env.APP_SECRET || 'unit-test-secret-0123456789abcdef0123456789';

const test = require('node:test');
const assert = require('node:assert');
const settings = require('../src/settings');

settings.getSecret = async () => 'test-key';
const calls = [];
function stubFetch(handler) {
  global.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    const { status = 200, body } = handler(String(url), init);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  };
}

const apollo = require('../src/leads/sources/apollo');
const hunter = require('../src/leads/sources/hunter');
const places = require('../src/leads/sources/places');
const { extract } = require('../src/leads/enrich');

test('Apollo search sends ICP filters and maps people', async () => {
  stubFetch(() => ({ body: { pagination: { total_entries: 812 }, people: [{ id: 'p1', first_name: 'Priya', last_name_obfuscated: 'S***a', title: 'Founder', organization: { name: 'Acme', primary_domain: 'acme.io' }, has_email: true }] } }));
  const r = await apollo.searchPeople({ titles: 'founder, ceo', locations: 'India', min_employees: 10, max_employees: 100, keywords: 'shopify' });
  const req = calls.at(-1);
  assert.match(req.url, /mixed_people\/api_search$/);
  assert.strictEqual(req.init.headers['x-api-key'], 'test-key');
  const body = JSON.parse(req.init.body);
  assert.deepStrictEqual(body.person_titles, ['founder', 'ceo']);
  assert.deepStrictEqual(body.organization_num_employees_ranges, ['1,10', '11,20', '21,50', '51,100']);
  assert.strictEqual(r.total, 812);
  assert.strictEqual(r.people[0].company_domain, 'acme.io');
});

test('Apollo reveal maps a matched person to a lead', async () => {
  stubFetch(() => ({ body: { person: { id: 'p1', email: 'priya@acme.io', email_status: 'verified', first_name: 'Priya', last_name: 'Sharma', title: 'Founder', city: 'Pune', organization: { name: 'Acme', primary_domain: 'acme.io', estimated_num_employees: 40, industry: 'retail' } } } }));
  const { leads, missing } = await apollo.enrichPeople(['p1']);
  assert.strictEqual(missing, 0);
  assert.strictEqual(leads[0].email, 'priya@acme.io');
  assert.strictEqual(leads[0].email_status, 'valid');
  assert.strictEqual(leads[0].employees, 40);
});

test('Hunter domain search maps verified people', async () => {
  stubFetch(() => ({ body: { data: { domain: 'acme.io', organization: 'Acme', country: 'IN', emails: [
    { value: 'priya@acme.io', first_name: 'Priya', last_name: 'Sharma', position: 'CEO', confidence: 97, verification: { status: 'valid' } },
    { value: 'x@acme.io', verification: { status: 'accept_all' } },
  ] } } }));
  const rows = await hunter.domainSearch('acme.io', { limit: 5, seniority: 'executive' });
  assert.match(calls.at(-1).url, /domain-search\?domain=acme\.io&limit=5&type=personal&seniority=executive&api_key=test-key/);
  assert.strictEqual(rows[0].email_status, 'valid');
  assert.strictEqual(rows[1].email_status, 'risky');
});

test('Google Places text search maps businesses and follows pages', async () => {
  let page = 0;
  stubFetch((url, init) => {
    page += 1;
    assert.strictEqual(init.headers['X-Goog-Api-Key'], 'test-key');
    assert.match(init.headers['X-Goog-FieldMask'], /places\.websiteUri/);
    if (page === 1) {
      return { body: { nextPageToken: 'T2', places: [
        { displayName: { text: 'Smile Dental' }, websiteUri: 'https://www.smiledental.in/', nationalPhoneNumber: '040 1234', rating: 4.7, userRatingCount: 210, primaryTypeDisplayName: { text: 'Dentist' }, addressComponents: [{ longText: 'Hyderabad', types: ['locality'] }, { longText: 'India', types: ['country'] }] },
        { displayName: { text: 'No Site Clinic' } },
      ] } };
    }
    assert.strictEqual(JSON.parse(init.body).pageToken, 'T2');
    return { body: { places: [{ displayName: { text: 'Bright Teeth' }, websiteUri: 'https://brightteeth.com' }] } };
  });
  const rows = await places.textSearch('dentists in Hyderabad', { max: 60 });
  assert.strictEqual(rows.length, 2);
  assert.deepStrictEqual([rows[0].company, rows[0].company_domain, rows[0].city, rows[0].country, rows[0].industry], ['Smile Dental', 'smiledental.in', 'Hyderabad', 'India', 'Dentist']);
  assert.strictEqual(rows[0].custom.google_rating, '4.7');
});

test('website extraction finds emails, socials, tech and team pages', () => {
  const html = `<html><head><title>Acme | Shopify experts</title><meta name="description" content="We build D2C stores">
    <script src="https://cdn.shopify.com/x.js"></script><script src="https://www.googletagmanager.com/gtm.js"></script></head>
    <body><a href="mailto:hello@acme.io?subject=Hi">Email</a> Write to priya [at] acme [dot] io
    <img src="logo@2x.png"> <a href="tel:+91 98765 43210">Call</a>
    <a href="https://www.linkedin.com/company/acme-io/">in</a> <a href="https://twitter.com/share?u=x">share</a>
    <a href="/about-us">About</a> <a href="https://other.com/contact">x</a></body></html>`;
  const x = extract(html, 'https://acme.io/');
  assert.deepStrictEqual(x.emails.sort(), ['hello@acme.io', 'priya@acme.io']);
  assert.deepStrictEqual(x.phones, ['+919876543210']);
  assert.strictEqual(x.socials.linkedin, 'https://www.linkedin.com/company/acme-io');
  assert.strictEqual(x.socials.twitter, undefined);
  assert.ok(x.tech.includes('Shopify') && x.tech.includes('Google Tag Manager'));
  assert.deepStrictEqual(x.links, ['https://acme.io/about-us']);
  assert.strictEqual(x.description, 'We build D2C stores');
});

test('AI reply classification sends a structured-output request and parses the answer', async () => {
  settings.get = async (k) => (k === 'ai_model' ? 'claude-opus-5-5' : undefined);
  stubFetch(() => ({
    body: {
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-opus-5-5', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: '{"category":"interested","confidence":0.92,"summary":"Wants a call on Thursday."}' }],
      usage: { input_tokens: 100, output_tokens: 20 },
    },
  }));
  const ai = require('../src/ai');
  const r = await ai.classifyReply({ subject: 'Re: idea', text: 'Sounds good, call Thursday?' });
  assert.deepStrictEqual(r, { category: 'interested', confidence: 0.92, summary: 'Wants a call on Thursday.' });
  const req = calls.at(-1);
  assert.match(req.url, /\/v1\/messages/);
  const body = JSON.parse(req.init.body);
  assert.strictEqual(body.model, 'claude-opus-5-5');
  assert.strictEqual(body.fallbacks, 'default');
  assert.strictEqual(body.output_config.effort, 'low');
  assert.strictEqual(body.output_config.format.type, 'json_schema');
  assert.match(JSON.stringify(body.output_config.format.schema.properties.category), /unsubscribe/);
  assert.deepStrictEqual(body.output_config.format.schema.required, ['category', 'confidence', 'summary']);
  const headers = new Headers(req.init.headers);
  assert.match(headers.get('anthropic-beta') || '', /server-side-fallback-2026-07-01/);
});
