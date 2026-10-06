// Hunter.io: find the people + verified emails at a company domain, or find one person's email.
const settings = require('../../settings');

async function call(path, params) {
  const key = await settings.getSecret('hunter_api_key');
  if (!key) throw new Error('Add your Hunter API key in Settings > Integrations');
  const qs = new URLSearchParams({ ...params, api_key: key });
  const res = await fetch(`https://api.hunter.io/v2/${path}?${qs}`, { signal: AbortSignal.timeout(30000) });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const detail = body.errors && body.errors[0] ? body.errors[0].details : res.statusText;
    throw new Error(`Hunter ${res.status}: ${detail}`);
  }
  return body.data || {};
}

function statusOf(verification) {
  const s = verification && verification.status;
  if (s === 'valid') return 'valid';
  if (s === 'invalid') return 'invalid';
  if (s === 'accept_all') return 'risky';
  return 'unknown';
}

// options: { limit, seniority: 'senior,executive', department: 'executive,marketing,sales' }
async function domainSearch(domain, options = {}) {
  const params = { domain, limit: String(Math.min(100, Number(options.limit || 10))), type: 'personal' };
  if (options.seniority) params.seniority = options.seniority;
  if (options.department) params.department = options.department;
  const d = await call('domain-search', params);
  return (d.emails || []).map((e) => ({
    email: e.value,
    email_status: statusOf(e.verification),
    first_name: e.first_name,
    last_name: e.last_name,
    title: e.position,
    company: d.organization,
    company_domain: d.domain || domain,
    website: d.domain ? `https://${d.domain}` : null,
    linkedin_url: e.linkedin,
    phone: e.phone_number,
    city: d.city,
    country: d.country,
    industry: d.industry,
    employees: d.headcount,
    custom: { confidence: String(e.confidence ?? ''), seniority: e.seniority || '', department: e.department || '' },
  }));
}

async function emailFinder({ domain, first_name, last_name }) {
  const d = await call('email-finder', { domain, first_name, last_name });
  if (!d.email) return null;
  return { email: d.email, email_status: statusOf(d.verification), score: d.score, title: d.position, linkedin_url: d.linkedin_url };
}

module.exports = { domainSearch, emailFinder };
