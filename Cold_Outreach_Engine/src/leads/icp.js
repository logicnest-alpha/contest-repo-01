// ICP (ideal customer profile) fit score, 0-100.
// Weights: title 35, industry 20, location 15, company size 15, keywords 15. Any excluded keyword -> 0.

function norm(s) {
  return String(s || '').toLowerCase();
}

function anyMatch(haystack, needles) {
  const h = norm(haystack);
  return needles.some((n) => n && h.includes(norm(n).trim()));
}

function leadText(lead) {
  const e = lead.enrichment || {};
  return [lead.title, lead.company, lead.industry, lead.city, lead.country, e.title, e.description, (e.keywords || []).join(' '),
    (e.tech || []).join(' ')].filter(Boolean).join(' ');
}

function scoreLead(lead, icp) {
  if (!icp) return null;
  const text = leadText(lead);
  if ((icp.exclude_keywords || []).length && anyMatch(text, icp.exclude_keywords)) return 0;

  let total = 0;
  let max = 0;
  const part = (weight, applies, hit) => {
    if (!applies) return;
    max += weight;
    if (hit) total += weight;
  };
  part(35, icp.titles.length, anyMatch(lead.title, icp.titles));
  part(20, icp.industries.length, anyMatch(`${lead.industry || ''} ${(lead.enrichment || {}).description || ''}`, icp.industries));
  part(15, icp.locations.length, anyMatch(`${lead.city || ''} ${lead.country || ''}`, icp.locations));
  const sized = icp.min_employees != null || icp.max_employees != null;
  part(15, sized, lead.employees != null
    && (icp.min_employees == null || lead.employees >= icp.min_employees)
    && (icp.max_employees == null || lead.employees <= icp.max_employees));
  part(15, icp.keywords.length, anyMatch(text, icp.keywords));
  if (!max) return null;
  return Math.round((100 * total) / max);
}

module.exports = { scoreLead };
