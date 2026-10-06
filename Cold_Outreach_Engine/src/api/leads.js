// Leads, ICP profiles, lead sources (CSV, Apollo, Hunter, Google Maps), enrichment,
// verification, do-not-contact list and background tasks.
const express = require('express');
const db = require('../db');
const tasks = require('../tasks');
const store = require('../leads/store');
const { verifyEmail } = require('../leads/verify');
const { enrichLead } = require('../leads/enrich');
const { scoreLead } = require('../leads/icp');
const { suppress, stopLead } = require('../leads/suppress');
const { parseCsv } = require('../leads/sources/csv');
const apollo = require('../leads/sources/apollo');
const hunter = require('../leads/sources/hunter');
const places = require('../leads/sources/places');
const { normalizeDomain, normalizeEmail } = require('../util');
const { ah, bad, notFound, int, str, list } = require('./helpers');

const router = express.Router();

const LEAD_STATUSES = ['new', 'contacted', 'replied', 'interested', 'meeting', 'not_interested', 'unsubscribed', 'bounced'];
const SORTS = {
  newest: 'l.created_at DESC', oldest: 'l.created_at ASC', score: 'l.icp_score DESC NULLS LAST, l.created_at DESC',
  company: 'l.company ASC NULLS LAST', updated: 'l.updated_at DESC',
};

// Build a WHERE clause from list filters (shared by list, export, bulk and "add to campaign").
function leadFilter(q, params) {
  const where = [];
  const add = (sql, value) => {
    params.push(value);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (q.q) add(`(l.email ILIKE ? OR l.first_name ILIKE $${params.length + 1} OR l.last_name ILIKE $${params.length + 1}
                 OR l.company ILIKE $${params.length + 1} OR l.title ILIKE $${params.length + 1})`, `%${q.q}%`);
  if (q.status) add('l.status = ?', q.status);
  if (q.email_status) add('l.email_status = ?', q.email_status);
  if (q.tag) add('? = ANY(l.tags)', String(q.tag).toLowerCase());
  if (q.source) add('l.source = ?', q.source);
  if (q.min_score) add('l.icp_score >= ?', Number(q.min_score));
  if (q.has_email === 'yes') where.push('l.email IS NOT NULL');
  if (q.has_email === 'no') where.push('l.email IS NULL');
  if (q.not_in_campaign) add('NOT EXISTS (SELECT 1 FROM campaign_leads x WHERE x.lead_id = l.id AND x.campaign_id = ?)', Number(q.not_in_campaign));
  return where.length ? `WHERE ${where.join(' AND ')}` : '';
}

router.get('/leads', ah(async (req, res) => {
  const params = [];
  const where = leadFilter(req.query, params);
  const perPage = int(req.query.per_page, { min: 1, max: 500, def: 50 });
  const page = int(req.query.page, { min: 1, def: 1 });
  const order = SORTS[req.query.sort] || SORTS.newest;
  const total = await db.one(`SELECT count(*)::int AS n FROM leads l ${where}`, params);
  const rows = await db.many(
    `SELECT l.id, l.email, l.first_name, l.last_name, l.title, l.company, l.company_domain, l.website, l.city, l.country,
            l.industry, l.employees, l.source, l.email_status, l.icp_score, l.status, l.tags, l.icebreaker,
            l.enriched_at IS NOT NULL AS enriched, l.created_at
     FROM leads l ${where} ORDER BY ${order} LIMIT ${perPage} OFFSET ${(page - 1) * perPage}`,
    params,
  );
  res.json({ total: total.n, page, per_page: perPage, rows });
}));

router.get('/leads/export.csv', ah(async (req, res) => {
  const params = [];
  const rows = await db.many(`SELECT l.* FROM leads l ${leadFilter(req.query, params)} ORDER BY l.id`, params);
  const cols = ['email', 'first_name', 'last_name', 'title', 'company', 'company_domain', 'website', 'linkedin_url', 'phone',
    'city', 'country', 'industry', 'employees', 'source', 'email_status', 'icp_score', 'status', 'icebreaker', 'tags'];
  const cell = (v) => {
    const s = Array.isArray(v) ? v.join(';') : v === null || v === undefined ? '' : String(v);
    // Neutralise spreadsheet formulas.
    const safe = /^[=+\-@]/.test(s) ? `'${s}` : s;
    return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="leads.csv"');
  res.send([cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n'));
}));

router.get('/leads/tags', ah(async (req, res) => {
  res.json(await db.many(`SELECT t AS tag, count(*)::int AS n FROM leads, unnest(tags) t GROUP BY t ORDER BY t`));
}));

router.get('/leads/:id', ah(async (req, res) => {
  const lead = await db.one('SELECT * FROM leads WHERE id = $1', [req.params.id]);
  if (!lead) throw notFound();
  const campaigns = await db.many(
    `SELECT cl.*, c.name AS campaign_name, m.email AS mailbox_email FROM campaign_leads cl
     JOIN campaigns c ON c.id = cl.campaign_id LEFT JOIN mailboxes m ON m.id = cl.mailbox_id
     WHERE cl.lead_id = $1 ORDER BY cl.created_at DESC`,
    [lead.id],
  );
  const messages = await db.many(
    `SELECT id, direction, subject, snippet, category, sent_at, thread_key, is_bounce FROM messages WHERE lead_id = $1 ORDER BY sent_at DESC LIMIT 50`,
    [lead.id],
  );
  res.json({ lead, campaigns, messages });
}));

router.post('/leads', ah(async (req, res) => {
  const result = await store.upsert(req.body, { source: 'manual', tags: list(req.body.tags) });
  if (result.startsWith('skipped')) throw bad(`Not added: ${result.split(':')[1]}`);
  res.status(201).json({ result });
}));

const EDITABLE = ['first_name', 'last_name', 'title', 'company', 'company_domain', 'website', 'linkedin_url', 'phone', 'city',
  'country', 'industry', 'icebreaker', 'notes'];

router.patch('/leads/:id', ah(async (req, res) => {
  const lead = await db.one('SELECT * FROM leads WHERE id = $1', [req.params.id]);
  if (!lead) throw notFound();
  const sets = [];
  const values = [lead.id];
  for (const f of EDITABLE) {
    if (req.body[f] === undefined) continue;
    values.push(str(req.body[f], { max: f === 'notes' ? 5000 : 600 }) || null);
    sets.push(`${f} = $${values.length}`);
  }
  if (req.body.email !== undefined) {
    const email = normalizeEmail(req.body.email);
    if (req.body.email && !email) throw bad('Invalid email');
    values.push(email || null);
    sets.push(`email = $${values.length}`);
    if (email !== lead.email) sets.push(`email_status = 'unknown'`);
  }
  if (req.body.status !== undefined) {
    if (!LEAD_STATUSES.includes(req.body.status)) throw bad('Unknown status');
    values.push(req.body.status);
    sets.push(`status = $${values.length}`);
    if (['unsubscribed', 'not_interested', 'meeting', 'interested'].includes(req.body.status)) {
      await stopLead(lead.id, 'stopped', `Marked ${req.body.status}`);
    }
    if (req.body.status === 'unsubscribed' && lead.email) await suppress(lead.email, 'Marked unsubscribed');
  }
  if (req.body.tags !== undefined) {
    values.push(list(req.body.tags).map((t) => t.toLowerCase()));
    sets.push(`tags = $${values.length}`);
  }
  if (!sets.length) return res.json(lead);
  res.json(await db.one(`UPDATE leads SET ${sets.join(', ')}, updated_at = now() WHERE id = $1 RETURNING *`, values));
}));

// Resolve the set of lead ids for a bulk action: explicit ids, or "everything matching the filter".
async function resolveIds(body) {
  if (Array.isArray(body.ids) && body.ids.length) return body.ids.map(Number).filter(Number.isInteger);
  if (body.filter) {
    const params = [];
    const rows = await db.many(`SELECT l.id FROM leads l ${leadFilter(body.filter, params)} ORDER BY l.id LIMIT 20000`, params);
    return rows.map((r) => r.id);
  }
  throw bad('Select leads first');
}

router.post('/leads/bulk', ah(async (req, res) => {
  const ids = await resolveIds(req.body);
  const action = req.body.action;
  if (!ids.length) throw bad('No leads match');
  switch (action) {
    case 'tag':
    case 'untag': {
      const tags = list(req.body.value).map((t) => t.toLowerCase());
      if (!tags.length) throw bad('Enter a tag');
      const sql = action === 'tag'
        ? 'UPDATE leads SET tags = ARRAY(SELECT DISTINCT unnest(tags || $2::text[])), updated_at = now() WHERE id = ANY($1)'
        : 'UPDATE leads SET tags = ARRAY(SELECT unnest(tags) EXCEPT SELECT unnest($2::text[])), updated_at = now() WHERE id = ANY($1)';
      await db.query(sql, [ids, tags]);
      return res.json({ updated: ids.length });
    }
    case 'delete':
      await db.query('DELETE FROM leads WHERE id = ANY($1)', [ids]);
      return res.json({ deleted: ids.length });
    case 'suppress': {
      const rows = await db.many('SELECT id, email FROM leads WHERE id = ANY($1) AND email IS NOT NULL', [ids]);
      for (const r of rows) {
        await suppress(r.email, 'Added from leads');
        await stopLead(r.id, 'stopped', 'Added to do-not-contact');
      }
      await db.query(`UPDATE leads SET status = 'unsubscribed', updated_at = now() WHERE id = ANY($1) AND email IS NOT NULL`, [ids]);
      return res.json({ updated: rows.length });
    }
    case 'status': {
      if (!LEAD_STATUSES.includes(req.body.value)) throw bad('Unknown status');
      await db.query('UPDATE leads SET status = $2, updated_at = now() WHERE id = ANY($1)', [ids, req.body.value]);
      return res.json({ updated: ids.length });
    }
    case 'score': {
      const icp = await db.one('SELECT * FROM icp_profiles WHERE id = $1', [req.body.value]);
      if (!icp) throw bad('Choose an ICP profile');
      const leads = await db.many('SELECT * FROM leads WHERE id = ANY($1)', [ids]);
      for (const l of leads) await db.query('UPDATE leads SET icp_score = $2 WHERE id = $1', [l.id, scoreLead(l, icp)]);
      return res.json({ updated: leads.length });
    }
    case 'verify': {
      const taskId = await tasks.start('verify', `Verify ${ids.length} emails`, async (update) => {
        const counts = { valid: 0, risky: 0, invalid: 0, unknown: 0, skipped: 0 };
        for (let i = 0; i < ids.length; i++) {
          const l = await db.one('SELECT id, email FROM leads WHERE id = $1', [ids[i]]);
          if (!l || !l.email) { counts.skipped += 1; continue; }
          const r = await verifyEmail(l.email);
          counts[r.status] += 1;
          await db.query(
            'UPDATE leads SET email_status = $2, email_check = $3, email_checked_at = now(), updated_at = now() WHERE id = $1',
            [l.id, r.status, JSON.stringify(r)],
          );
          await update({ progress: i + 1, total: ids.length });
        }
        return counts;
      });
      return res.json({ task_id: taskId });
    }
    case 'enrich': {
      const icebreaker = Boolean(req.body.icebreaker);
      const offer = str(req.body.offer, { max: 500 });
      const taskId = await tasks.start('enrich', `Enrich ${ids.length} leads from their websites`, async (update) => {
        const counts = { enriched: 0, emails_found: 0, icebreakers: 0, failed: 0, errors: [] };
        for (let i = 0; i < ids.length; i++) {
          const l = await db.one('SELECT * FROM leads WHERE id = $1', [ids[i]]);
          try {
            const after = await enrichLead(l, { icebreaker, offer });
            counts.enriched += 1;
            if (!l.email && after.email) counts.emails_found += 1;
            if (after.icebreaker && after.icebreaker !== l.icebreaker) counts.icebreakers += 1;
          } catch (err) {
            counts.failed += 1;
            if (counts.errors.length < 10) counts.errors.push(`${l.company || l.email || l.id}: ${err.message}`);
          }
          await update({ progress: i + 1, total: ids.length });
        }
        return counts;
      });
      return res.json({ task_id: taskId });
    }
    case 'find_email': {
      const taskId = await tasks.start('find_email', `Find emails for ${ids.length} leads (Hunter)`, async (update) => {
        const counts = { found: 0, not_found: 0, skipped: 0 };
        for (let i = 0; i < ids.length; i++) {
          const l = await db.one('SELECT * FROM leads WHERE id = $1', [ids[i]]);
          const domain = normalizeDomain(l.company_domain || l.website);
          if (l.email || !domain || !l.first_name || !l.last_name) { counts.skipped += 1; continue; }
          const r = await hunter.emailFinder({ domain, first_name: l.first_name, last_name: l.last_name });
          const taken = r ? await db.one('SELECT id FROM leads WHERE email = $1', [r.email]) : null;
          if (r && !taken) {
            await db.query('UPDATE leads SET email = $2, email_status = $3, updated_at = now() WHERE id = $1', [l.id, r.email, r.email_status]);
            counts.found += 1;
          } else counts.not_found += 1;
          await update({ progress: i + 1, total: ids.length });
        }
        return counts;
      });
      return res.json({ task_id: taskId });
    }
    default:
      throw bad('Unknown action');
  }
}));

// ---------------------------------------------------------------- CSV import

// Both routes receive { csv: "<file contents>" } (server.js allows 25 MB bodies on /api/leads/import*).
router.post('/leads/import/preview', ah(async (req, res) => {
  const parsed = parseCsv(String(req.body.csv || ''));
  res.json({ headers: parsed.headers, mapping: parsed.mapping, count: parsed.rows.length, sample: parsed.rows.slice(0, 5) });
}));

router.post('/leads/import', ah(async (req, res) => {
  const csv = String(req.body.csv || '');
  if (!csv.trim()) throw bad('The CSV file is empty');
  const parsed = parseCsv(csv, req.body.mapping || {});
  if (!parsed.rows.length) throw bad('No rows found in the CSV');
  const icp = req.body.icp_id ? await db.one('SELECT * FROM icp_profiles WHERE id = $1', [req.body.icp_id]) : null;
  const tags = list(req.body.tags);
  const taskId = await tasks.start('import', `Import ${parsed.rows.length} leads from CSV`, (update) =>
    store.upsertMany(parsed.rows, { source: 'csv', tags, icp }, update));
  res.json({ task_id: taskId });
}));

// ---------------------------------------------------------------- ICP profiles

function readIcp(body) {
  return {
    name: str(body.name, { max: 120, required: true, name: 'Name' }),
    titles: list(body.titles),
    industries: list(body.industries),
    locations: list(body.locations),
    keywords: list(body.keywords),
    exclude_keywords: list(body.exclude_keywords),
    min_employees: int(body.min_employees, { min: 0 }),
    max_employees: int(body.max_employees, { min: 0 }),
    notes: str(body.notes, { max: 4000 }),
  };
}

router.get('/icps', ah(async (req, res) => res.json(await db.many('SELECT * FROM icp_profiles ORDER BY name'))));

router.post('/icps', ah(async (req, res) => {
  const d = readIcp(req.body);
  res.status(201).json(await db.one(
    `INSERT INTO icp_profiles (name, titles, industries, locations, keywords, exclude_keywords, min_employees, max_employees, notes)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
    [d.name, d.titles, d.industries, d.locations, d.keywords, d.exclude_keywords, d.min_employees, d.max_employees, d.notes],
  ));
}));

router.put('/icps/:id', ah(async (req, res) => {
  const d = readIcp(req.body);
  const row = await db.one(
    `UPDATE icp_profiles SET name=$2, titles=$3, industries=$4, locations=$5, keywords=$6, exclude_keywords=$7,
       min_employees=$8, max_employees=$9, notes=$10 WHERE id = $1 RETURNING *`,
    [req.params.id, d.name, d.titles, d.industries, d.locations, d.keywords, d.exclude_keywords, d.min_employees, d.max_employees, d.notes],
  );
  if (!row) throw notFound();
  res.json(row);
}));

router.delete('/icps/:id', ah(async (req, res) => {
  await db.query('DELETE FROM icp_profiles WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
}));

// ---------------------------------------------------------------- lead sources

async function icpFor(body) {
  return body.icp_id ? db.one('SELECT * FROM icp_profiles WHERE id = $1', [body.icp_id]) : null;
}

router.post('/sources/apollo/search', ah(async (req, res) => {
  res.json(await apollo.searchPeople(req.body || {}));
}));

router.post('/sources/apollo/import', ah(async (req, res) => {
  const ids = list(req.body.ids);
  if (!ids.length) throw bad('Select people to import');
  if (ids.length > 500) throw bad('Import at most 500 people at a time');
  const icp = await icpFor(req.body);
  const tags = list(req.body.tags);
  const taskId = await tasks.start('apollo', `Apollo: reveal emails for ${ids.length} people`, async (update) => {
    const { leads, missing } = await apollo.enrichPeople(ids, update);
    const counts = await store.upsertMany(leads, { source: 'apollo', tags, icp });
    return { ...counts, no_email: missing };
  });
  res.json({ task_id: taskId });
}));

router.post('/sources/hunter/domains', ah(async (req, res) => {
  const domains = list(req.body.domains).map(normalizeDomain).filter(Boolean);
  if (!domains.length) throw bad('Enter at least one company domain');
  if (domains.length > 200) throw bad('At most 200 domains at a time');
  const icp = await icpFor(req.body);
  const tags = list(req.body.tags);
  const options = { limit: req.body.limit || 5, seniority: req.body.seniority || '', department: req.body.department || '' };
  const taskId = await tasks.start('hunter', `Hunter: search ${domains.length} domains`, async (update) => {
    const totals = { inserted: 0, updated: 0, skipped: 0, domains_without_results: 0, errors: [] };
    for (let i = 0; i < domains.length; i++) {
      try {
        const found = await hunter.domainSearch(domains[i], options);
        if (!found.length) totals.domains_without_results += 1;
        const c = await store.upsertMany(found, { source: 'hunter', tags, icp });
        totals.inserted += c.inserted; totals.updated += c.updated; totals.skipped += c.skipped;
      } catch (err) {
        if (totals.errors.length < 10) totals.errors.push(`${domains[i]}: ${err.message}`);
        if (/40[13]|429/.test(err.message)) break; // key / quota problem: stop early
      }
      await update({ progress: i + 1, total: domains.length });
    }
    return totals;
  });
  res.json({ task_id: taskId });
}));

router.post('/sources/places/search', ah(async (req, res) => {
  const query = str(req.body.query, { max: 200, required: true, name: 'Search' });
  res.json(await places.textSearch(query, { max: int(req.body.max, { min: 1, max: 60, def: 20 }) }));
}));

router.post('/sources/places/import', ah(async (req, res) => {
  const query = str(req.body.query, { max: 200, required: true, name: 'Search' });
  const max = int(req.body.max, { min: 1, max: 60, def: 60 });
  const icp = await icpFor(req.body);
  const tags = list(req.body.tags);
  const enrich = Boolean(req.body.enrich);
  const taskId = await tasks.start('places', `Google Maps: "${query}"`, async (update) => {
    const found = await places.textSearch(query, { max });
    const counts = await store.upsertMany(found, { source: 'google_maps', tags, icp });
    if (!enrich) return { ...counts, found: found.length };
    // Visit each website to find an email address.
    const domains = found.map((f) => f.company_domain).filter(Boolean);
    const leads = await db.many('SELECT * FROM leads WHERE company_domain = ANY($1) AND email IS NULL', [domains]);
    let emails = 0;
    for (let i = 0; i < leads.length; i++) {
      try {
        const after = await enrichLead(leads[i], {});
        if (after.email) emails += 1;
      } catch { /* site unreachable */ }
      await update({ progress: i + 1, total: leads.length });
    }
    return { ...counts, found: found.length, emails_found: emails };
  });
  res.json({ task_id: taskId });
}));

// ---------------------------------------------------------------- tasks

router.get('/tasks', ah(async (req, res) => {
  res.json(await db.many('SELECT * FROM tasks ORDER BY id DESC LIMIT $1', [int(req.query.limit, { min: 1, max: 100, def: 20 })]));
}));

router.get('/tasks/:id', ah(async (req, res) => {
  const t = await db.one('SELECT * FROM tasks WHERE id = $1', [req.params.id]);
  if (!t) throw notFound();
  res.json(t);
}));

// ---------------------------------------------------------------- do-not-contact list

router.get('/suppressions', ah(async (req, res) => {
  const q = str(req.query.q, { max: 200 });
  res.json(await db.many(
    `SELECT * FROM suppressions WHERE ($1 = '' OR value ILIKE '%' || $1 || '%') ORDER BY created_at DESC LIMIT 500`, [q],
  ));
}));

router.post('/suppressions', ah(async (req, res) => {
  const values = list(req.body.values).map((v) => v.toLowerCase());
  let added = 0;
  for (const v of values) {
    const email = normalizeEmail(v);
    const domain = email ? null : normalizeDomain(v);
    if (!email && !domain) continue;
    await suppress(email || domain, str(req.body.reason, { max: 200 }) || 'Added manually');
    const leads = email
      ? await db.many('SELECT id FROM leads WHERE email = $1', [email])
      : await db.many(`SELECT id FROM leads WHERE email LIKE '%@' || $1`, [domain]);
    for (const l of leads) await stopLead(l.id, 'stopped', 'Added to do-not-contact');
    added += 1;
  }
  res.json({ added });
}));

router.delete('/suppressions/:value', ah(async (req, res) => {
  await db.query('DELETE FROM suppressions WHERE value = $1', [String(req.params.value).toLowerCase()]);
  res.json({ ok: true });
}));

module.exports = { router, leadFilter };
