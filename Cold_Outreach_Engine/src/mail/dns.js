// Domain health: MX, SPF, DKIM, DMARC and domain blacklists, with the exact fix for each.
const dns = require('dns').promises;

const TWO_LEVEL_SUFFIXES = new Set([
  'co.in', 'net.in', 'org.in', 'firm.in', 'gen.in', 'ind.in', 'co.uk', 'org.uk', 'ltd.uk', 'plc.uk',
  'com.au', 'net.au', 'org.au', 'co.nz', 'com.sg', 'com.my', 'co.za', 'com.br', 'com.mx', 'co.jp',
  'com.sa', 'com.ae', 'co.id', 'com.ph', 'com.pk', 'com.bd', 'com.ng', 'co.ke', 'com.tr', 'com.cn',
]);

// "mail.brand.co.in" -> "brand.co.in" (good enough for DMARC fallback without a full PSL).
function orgDomain(domain) {
  const parts = domain.split('.');
  const lastTwo = parts.slice(-2).join('.');
  const keep = TWO_LEVEL_SUFFIXES.has(lastTwo) ? 3 : 2;
  return parts.slice(-keep).join('.');
}

async function txt(name) {
  try {
    return (await dns.resolveTxt(name)).map((chunks) => chunks.join(''));
  } catch (err) {
    if (['ENOTFOUND', 'ENODATA', 'ESERVFAIL', 'NXDOMAIN'].includes(err.code)) return [];
    throw err;
  }
}

async function checkMx(domain) {
  let records = [];
  try {
    records = (await dns.resolveMx(domain)).sort((a, b) => a.priority - b.priority);
  } catch (err) {
    if (!['ENOTFOUND', 'ENODATA'].includes(err.code)) throw err;
  }
  const list = records.map((r) => `${r.priority} ${r.exchange}`);
  const zoho = records.some((r) => /zoho/i.test(r.exchange));
  if (!records.length) {
    return { ok: false, records: list, message: 'No MX records - replies and bounces cannot reach you.', fix: 'Add the 3 MX records Zoho shows in Admin Console > Domains > (your domain) > Email Configuration > MX (mx.zoho.*, mx2.zoho.*, mx3.zoho.*).' };
  }
  return {
    ok: zoho, records: list,
    message: zoho ? 'MX points to Zoho.' : 'MX does not point to Zoho - replies will not arrive in your Zoho mailbox.',
    fix: zoho ? '' : 'Replace the MX records with the ones from Zoho Admin Console > Domains > Email Configuration.',
  };
}

async function checkSpf(domain, spfInclude) {
  const records = (await txt(domain)).filter((r) => /^v=spf1\b/i.test(r));
  const suggested = `v=spf1 ${spfInclude || 'include:zohomail.com'} ~all`;
  if (!records.length) {
    return { ok: false, record: null, message: 'No SPF record.', fix: `Add a TXT record on ${domain} (host "@"): ${suggested}` };
  }
  if (records.length > 1) {
    return { ok: false, record: records.join(' | '), message: 'More than one SPF record - receivers treat this as a permanent error.', fix: `Merge them into a single TXT record, e.g. ${suggested}` };
  }
  const rec = records[0];
  const issues = [];
  if (!/include:[^\s]*zoho/i.test(rec)) issues.push('does not include Zoho');
  if (/\+all\b/i.test(rec)) issues.push('ends with +all (lets anyone send as you)');
  if (!/[~-]all\b/i.test(rec)) issues.push('should end with ~all or -all');
  const lookups = (rec.match(/\b(include:|a\b|a:|mx\b|mx:|ptr|exists:|redirect=)/gi) || []).length;
  if (lookups > 10) issues.push(`has ${lookups} DNS lookups (max 10)`);
  return {
    ok: issues.length === 0, record: rec,
    message: issues.length ? `SPF ${issues.join(', ')}.` : 'SPF authorises Zoho.',
    fix: issues.length ? `Use: ${suggested} (keep other includes you really send from).` : '',
  };
}

async function checkDkim(domain, selector) {
  const host = `${selector}._domainkey.${domain}`;
  const records = await txt(host);
  const rec = records.find((r) => /v=DKIM1|k=rsa|p=/i.test(r));
  if (!rec) {
    return {
      ok: false, selector, record: null,
      message: `No DKIM key at ${host}.`,
      fix: `Zoho Admin Console > Domains > ${domain} > Email Configuration > DKIM > Add selector "${selector}", copy the TXT value to DNS host "${selector}._domainkey", then click Verify in Zoho so it starts signing. (If you used a different selector, change it on the Domains page.)`,
    };
  }
  if (/p=\s*(;|$)/i.test(rec)) {
    return { ok: false, selector, record: rec, message: 'DKIM key is empty (revoked).', fix: 'Re-copy the public key from Zoho.' };
  }
  return { ok: true, selector, record: `${rec.slice(0, 60)}...`, message: 'DKIM key published. Make sure it shows "Verified" and enabled in Zoho.', fix: '' };
}

async function checkDmarc(domain) {
  const own = (await txt(`_dmarc.${domain}`)).find((r) => /^v=DMARC1/i.test(r));
  const parent = orgDomain(domain);
  let rec = own;
  let inheritedFrom = null;
  if (!rec && parent !== domain) {
    rec = (await txt(`_dmarc.${parent}`)).find((r) => /^v=DMARC1/i.test(r));
    if (rec) inheritedFrom = parent;
  }
  const suggested = `v=DMARC1; p=none; rua=mailto:dmarc@${domain}; fo=1`;
  if (!rec) {
    return { ok: false, record: null, policy: null, message: 'No DMARC record. Gmail and Yahoo expect one from every sender.', fix: `Add a TXT record on host "_dmarc" of ${domain}: ${suggested}  (move to p=quarantine after a few clean weeks).` };
  }
  const tag = (name) => {
    const m = rec.match(new RegExp(`(?:^|;)\\s*${name}\\s*=\\s*([^;]+)`, 'i'));
    return m ? m[1].trim().toLowerCase() : null;
  };
  const policy = inheritedFrom ? (tag('sp') || tag('p')) : tag('p');
  return {
    ok: true, record: rec, policy, inherited_from: inheritedFrom,
    message: `DMARC found${inheritedFrom ? ` (inherited from ${inheritedFrom})` : ''}, policy "${policy}".`,
    fix: '',
  };
}

const DOMAIN_BLOCKLISTS = [
  { zone: 'dbl.spamhaus.org', name: 'Spamhaus DBL', listed: (ip) => /^127\.0\.1\./.test(ip), error: (ip) => /^127\.255\.255\./.test(ip) },
  { zone: 'multi.surbl.org', name: 'SURBL', listed: (ip) => /^127\.0\.0\./.test(ip) && ip !== '127.0.0.1', error: (ip) => ip === '127.0.0.1' },
  { zone: 'multi.uribl.com', name: 'URIBL', listed: (ip) => /^127\.0\.0\.(2|4|8|14)$/.test(ip), error: (ip) => ip === '127.0.0.1' || ip === '127.0.0.255' },
];

async function checkBlocklists(domain) {
  const target = orgDomain(domain);
  return Promise.all(DOMAIN_BLOCKLISTS.map(async (bl) => {
    try {
      const ips = await dns.resolve4(`${target}.${bl.zone}`);
      if (ips.some(bl.error)) return { list: bl.name, listed: null, message: 'Could not check (the list refuses queries from this DNS resolver).' };
      const listed = ips.some(bl.listed);
      return { list: bl.name, listed, message: listed ? `${target} is LISTED - stop sending from it and request delisting.` : 'Not listed' };
    } catch (err) {
      if (['ENOTFOUND', 'ENODATA'].includes(err.code)) return { list: bl.name, listed: false, message: 'Not listed' };
      return { list: bl.name, listed: null, message: `Could not check (${err.code || err.message})` };
    }
  }));
}

async function checkDomain(domain, { selector = 'zmail', spfInclude } = {}) {
  const [mx, spf, dkim, dmarc, blocklists] = await Promise.all([
    checkMx(domain).catch((e) => ({ ok: false, message: `Lookup failed: ${e.message}` })),
    checkSpf(domain, spfInclude).catch((e) => ({ ok: false, message: `Lookup failed: ${e.message}` })),
    checkDkim(domain, selector).catch((e) => ({ ok: false, message: `Lookup failed: ${e.message}` })),
    checkDmarc(domain).catch((e) => ({ ok: false, message: `Lookup failed: ${e.message}` })),
    checkBlocklists(domain).catch(() => []),
  ]);
  const listed = blocklists.some((b) => b.listed);
  const score = (mx.ok ? 20 : 0) + (spf.ok ? 25 : 0) + (dkim.ok ? 25 : 0) + (dmarc.ok ? 20 : 0) + (listed ? 0 : 10);
  return { domain, checked_at: new Date().toISOString(), score, mx, spf, dkim, dmarc, blocklists, listed };
}

module.exports = { checkDomain, orgDomain };
