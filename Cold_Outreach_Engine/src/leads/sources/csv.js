// CSV import with automatic column mapping (Apollo, Sales Navigator exports, Clay, sheets...).
const { parse } = require('csv-parse/sync');

const ALIASES = {
  email: ['email', 'emailaddress', 'workemail', 'businessemail', 'mail', 'primaryemail', 'contactemail', 'personalemail'],
  first_name: ['firstname', 'first', 'givenname', 'fname'],
  last_name: ['lastname', 'last', 'surname', 'familyname', 'lname'],
  full_name: ['name', 'fullname', 'contactname', 'person', 'contact'],
  title: ['title', 'jobtitle', 'position', 'designation', 'role', 'headline'],
  company: ['company', 'companyname', 'organization', 'organisation', 'organizationname', 'account', 'accountname', 'business', 'businessname'],
  website: ['website', 'companywebsite', 'url', 'websiteurl', 'web', 'site', 'companyurl'],
  company_domain: ['domain', 'companydomain', 'emaildomain'],
  linkedin_url: ['linkedin', 'linkedinurl', 'personlinkedinurl', 'linkedinprofile', 'profileurl', 'linkedinprofileurl'],
  phone: ['phone', 'phonenumber', 'mobile', 'mobilephone', 'workphone', 'directphone', 'corporatephone', 'companyphone', 'workdirectphone'],
  city: ['city', 'town', 'personcity'],
  country: ['country', 'personcountry', 'companycountry'],
  industry: ['industry', 'sector', 'vertical', 'category'],
  employees: ['employees', 'numberofemployees', 'employeecount', 'companysize', 'headcount', 'size', 'noofemployees'],
  email_status: ['emailstatus', 'emailverificationstatus', 'verificationstatus', 'emailconfidence'],
  icebreaker: ['icebreaker', 'personalization', 'personalisation', 'firstline', 'opener'],
};

function key(header) {
  return String(header || '').toLowerCase().replace(/[^a-z0-9]/g, '');
}

function varName(header) {
  return String(header || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
}

function mapColumns(headers) {
  const mapping = {};
  for (const h of headers) {
    const k = key(h);
    const field = Object.keys(ALIASES).find((f) => ALIASES[f].includes(k));
    mapping[h] = field && !Object.values(mapping).includes(field) ? field : null;
  }
  return mapping;
}

function emailStatus(value) {
  const v = String(value || '').toLowerCase();
  if (/^(verified|valid|deliverable|safe)/.test(v)) return 'valid';
  if (/(invalid|undeliverable|bounce)/.test(v)) return 'invalid';
  if (/(catch|accept|risky|guessed|unverified|likely)/.test(v)) return 'risky';
  return 'unknown';
}

// Returns { headers, mapping, rows: [leadInput] }
function parseCsv(text, overrides = {}) {
  const records = parse(text, {
    columns: true, skip_empty_lines: true, trim: true, bom: true, relax_column_count: true, relax_quotes: true,
  });
  if (!records.length) return { headers: [], mapping: {}, rows: [] };
  const headers = Object.keys(records[0]);
  const mapping = { ...mapColumns(headers), ...overrides };
  const rows = records.map((rec) => {
    const lead = { custom: {} };
    for (const [header, value] of Object.entries(rec)) {
      const field = mapping[header];
      if (!value) continue;
      if (field === 'full_name') {
        const parts = String(value).trim().split(/\s+/);
        lead.first_name = lead.first_name || parts[0];
        lead.last_name = lead.last_name || parts.slice(1).join(' ');
      } else if (field === 'email_status') {
        lead.email_status = emailStatus(value);
      } else if (field) {
        lead[field] = value;
      } else {
        // "Pain Point" -> {{pain_point}} / {{custom.pain_point}}
        lead.custom[varName(header) || 'field'] = String(value).slice(0, 500);
      }
    }
    return lead;
  });
  return { headers, mapping, rows };
}

module.exports = { parseCsv, mapColumns, FIELDS: Object.keys(ALIASES) };
