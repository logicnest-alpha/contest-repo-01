// Insert / merge leads. Existing values are kept; only empty fields are filled in.
const db = require('../db');
const { normalizeEmail, normalizeDomain, domainOf } = require('../util');
const { isSuppressed } = require('./suppress');
const { scoreLead } = require('./icp');

const FIELDS = ['first_name', 'last_name', 'title', 'company', 'company_domain', 'website', 'linkedin_url', 'phone',
  'city', 'country', 'industry', 'employees'];
const FREE_MAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|aol|proton|rediffmail)\./i;

function clean(value, max = 300) {
  if (value === null || value === undefined) return null;
  const s = String(value).replace(/\s+/g, ' ').trim();
  return s ? s.slice(0, max) : null;
}

// "250" -> 250, "51-200" -> 126, "10,000+" -> 10000
function parseEmployees(value) {
  if (typeof value === 'number') return value > 0 ? Math.round(value) : null;
  const nums = (String(value ?? '').replace(/,/g, '').match(/\d+/g) || []).map(Number).filter((n) => n > 0);
  if (!nums.length) return null;
  const n = nums.length >= 2 ? Math.round((nums[0] + nums[1]) / 2) : nums[0];
  return Math.min(n, 10000000);
}

function prepare(input) {
  const lead = {};
  for (const f of FIELDS) lead[f] = clean(input[f]);
  lead.email = normalizeEmail(input.email) || null;
  lead.employees = parseEmployees(input.employees);
  lead.company_domain = normalizeDomain(input.company_domain || input.website)
    || (lead.email && !FREE_MAIL.test(lead.email) ? domainOf(lead.email) : null) || null;
  if (lead.website && !/^https?:\/\//i.test(lead.website)) lead.website = `https://${lead.website}`;
  lead.custom = input.custom && typeof input.custom === 'object' ? input.custom : {};
  lead.email_status = ['valid', 'risky', 'invalid'].includes(input.email_status) ? input.email_status : 'unknown';
  lead.icebreaker = clean(input.icebreaker, 600);
  return lead;
}

// Returns 'inserted' | 'updated' | 'skipped:<reason>'
async function upsert(input, { source = 'manual', tags = [], icp = null } = {}) {
  const lead = prepare(input);
  if (!lead.email && !lead.company_domain && !lead.company) return 'skipped:no email or company';
  if (lead.email && (await isSuppressed(lead.email))) return 'skipped:suppressed';
  lead.icp_score = icp ? scoreLead(lead, icp) : null;
  const tagList = [...new Set(tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean))];

  if (lead.email) {
    const row = await db.one(
      `INSERT INTO leads (email, first_name, last_name, title, company, company_domain, website, linkedin_url, phone,
                          city, country, industry, employees, source, custom, email_status, icebreaker, icp_score, tags)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
       ON CONFLICT (email) DO UPDATE SET
         first_name = COALESCE(leads.first_name, EXCLUDED.first_name),
         last_name = COALESCE(leads.last_name, EXCLUDED.last_name),
         title = COALESCE(leads.title, EXCLUDED.title),
         company = COALESCE(leads.company, EXCLUDED.company),
         company_domain = COALESCE(leads.company_domain, EXCLUDED.company_domain),
         website = COALESCE(leads.website, EXCLUDED.website),
         linkedin_url = COALESCE(leads.linkedin_url, EXCLUDED.linkedin_url),
         phone = COALESCE(leads.phone, EXCLUDED.phone),
         city = COALESCE(leads.city, EXCLUDED.city),
         country = COALESCE(leads.country, EXCLUDED.country),
         industry = COALESCE(leads.industry, EXCLUDED.industry),
         employees = COALESCE(leads.employees, EXCLUDED.employees),
         custom = EXCLUDED.custom || leads.custom,
         email_status = CASE WHEN leads.email_status = 'unknown' THEN EXCLUDED.email_status ELSE leads.email_status END,
         icebreaker = COALESCE(leads.icebreaker, EXCLUDED.icebreaker),
         icp_score = COALESCE(EXCLUDED.icp_score, leads.icp_score),
         tags = ARRAY(SELECT DISTINCT unnest(leads.tags || EXCLUDED.tags)),
         updated_at = now()
       RETURNING (xmax = 0) AS inserted`,
      [lead.email, lead.first_name, lead.last_name, lead.title, lead.company, lead.company_domain, lead.website,
        lead.linkedin_url, lead.phone, lead.city, lead.country, lead.industry, lead.employees, source,
        JSON.stringify(lead.custom), lead.email_status, lead.icebreaker, lead.icp_score, tagList],
    );
    return row.inserted ? 'inserted' : 'updated';
  }

  // Company-level lead without an email yet (e.g. Google Maps). One per domain/company.
  const existing = await db.one(
    `SELECT id FROM leads WHERE email IS NULL AND (
       ($1::text IS NOT NULL AND company_domain = $1) OR ($1::text IS NULL AND lower(company) = lower($2)))
     LIMIT 1`,
    [lead.company_domain, lead.company],
  );
  if (existing) {
    await db.query(`UPDATE leads SET tags = ARRAY(SELECT DISTINCT unnest(tags || $2::text[])), updated_at = now() WHERE id = $1`, [existing.id, tagList]);
    return 'updated';
  }
  await db.query(
    `INSERT INTO leads (first_name, last_name, title, company, company_domain, website, linkedin_url, phone, city, country,
                        industry, employees, source, custom, icp_score, tags)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
    [lead.first_name, lead.last_name, lead.title, lead.company, lead.company_domain, lead.website, lead.linkedin_url,
      lead.phone, lead.city, lead.country, lead.industry, lead.employees, source, JSON.stringify(lead.custom), lead.icp_score, tagList],
  );
  return 'inserted';
}

async function upsertMany(list, options, update) {
  const counts = { inserted: 0, updated: 0, skipped: 0, reasons: {} };
  let i = 0;
  for (const item of list) {
    const r = await upsert(item, options);
    if (r.startsWith('skipped')) {
      counts.skipped += 1;
      const reason = r.split(':')[1];
      counts.reasons[reason] = (counts.reasons[reason] || 0) + 1;
    } else {
      counts[r] += 1;
    }
    i += 1;
    if (update) await update({ progress: i, total: list.length });
  }
  return counts;
}

module.exports = { upsert, upsertMany, prepare };
