// Apollo.io: search people by ICP (free, no emails), then reveal emails for the ones you pick
// (People Enrichment, uses Apollo credits). Needs an Apollo API key from a plan with API access.
const settings = require('../../settings');

const BASE = 'https://api.apollo.io/api/v1';

async function call(path, body) {
  const key = await settings.getSecret('apollo_api_key');
  if (!key) throw new Error('Add your Apollo API key in Settings > Integrations');
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache', 'x-api-key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(45000),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Apollo ${res.status}: ${data.error || data.message || res.statusText}`);
  return data;
}

function list(value) {
  if (Array.isArray(value)) return value.map((v) => String(v).trim()).filter(Boolean);
  return String(value || '').split(/[,\n]/).map((v) => v.trim()).filter(Boolean);
}

// Employee ranges in Apollo's "min,max" format.
const SIZE_RANGES = ['1,10', '11,20', '21,50', '51,100', '101,200', '201,500', '501,1000', '1001,2000', '2001,5000', '5001,10000'];

function sizeRanges(min, max) {
  if (min == null && max == null) return undefined;
  const lo = min == null ? 1 : Number(min);
  const hi = max == null ? 1e9 : Number(max);
  return SIZE_RANGES.filter((r) => {
    const [a, b] = r.split(',').map(Number);
    return b >= lo && a <= hi;
  });
}

// filters: { titles, seniorities, locations, keywords, domains, min_employees, max_employees, page, per_page }
async function searchPeople(filters) {
  const body = {
    person_titles: list(filters.titles),
    person_seniorities: list(filters.seniorities),
    person_locations: list(filters.locations),
    q_organization_domains_list: list(filters.domains),
    organization_num_employees_ranges: sizeRanges(filters.min_employees, filters.max_employees),
    q_keywords: filters.keywords ? String(filters.keywords) : undefined,
    page: Number(filters.page || 1),
    per_page: Math.min(100, Number(filters.per_page || 25)),
  };
  for (const k of Object.keys(body)) {
    if (body[k] === undefined || (Array.isArray(body[k]) && !body[k].length)) delete body[k];
  }
  const data = await call('/mixed_people/api_search', body);
  const people = data.people || data.contacts || [];
  return {
    total: (data.pagination && data.pagination.total_entries) || data.total_entries || people.length,
    page: body.page,
    people: people.map((p) => {
      const org = p.organization || {};
      return {
        id: p.id,
        first_name: p.first_name,
        last_name: p.last_name || p.last_name_obfuscated || '',
        title: p.title,
        company: org.name || p.organization_name,
        company_domain: org.primary_domain || org.website_url || null,
        city: p.city, country: p.country,
        has_email: p.has_email !== undefined ? p.has_email : null,
      };
    }),
  };
}

function toLead(person) {
  const org = person.organization || {};
  return {
    email: person.email,
    email_status: person.email_status === 'verified' ? 'valid' : person.email_status ? 'risky' : 'unknown',
    first_name: person.first_name,
    last_name: person.last_name,
    title: person.title,
    company: org.name,
    company_domain: org.primary_domain,
    website: org.website_url,
    linkedin_url: person.linkedin_url,
    city: person.city,
    country: person.country,
    industry: org.industry,
    employees: org.estimated_num_employees,
    phone: org.phone || (org.primary_phone && org.primary_phone.number),
    custom: { seniority: person.seniority || '', state: person.state || '', apollo_id: person.id || '' },
  };
}

// Reveal emails for Apollo person ids. Returns lead inputs (people without an email are skipped).
async function enrichPeople(ids, update) {
  const leads = [];
  let missing = 0;
  for (let i = 0; i < ids.length; i++) {
    const data = await call('/people/match', { id: ids[i], reveal_personal_emails: false });
    const person = data.person;
    if (person && person.email && !/email_not_unlocked|domain\.com/.test(person.email)) leads.push(toLead(person));
    else missing += 1;
    if (update) await update({ progress: i + 1, total: ids.length });
  }
  return { leads, missing };
}

module.exports = { searchPeople, enrichPeople };
