// Website enrichment: visits a company's public site (home, contact, about, team pages),
// respects robots.txt, and extracts emails, phones, social links, tech stack and a text
// summary that can feed an AI-written first line.
const dns = require('dns').promises;
const net = require('net');
const db = require('../db');
const ai = require('../ai');
const { basicCheck } = require('./verify');
const { normalizeDomain, normalizeEmail, domainOf } = require('../util');

const UA = 'Mozilla/5.0 (compatible; OutreachEngineBot/1.0; company-research)';
const MAX_BYTES = 1500000;
const FREE_MAIL = /@(gmail|googlemail|yahoo|hotmail|outlook|live|icloud|aol|proton|rediffmail)\./i;
const JUNK_EMAIL = /(\.(png|jpe?g|gif|svg|webp|css|js)$)|example\.|sentry|wixpress|domain\.com|email\.com|yourname|@2x|u00|godaddy|cloudflare/i;

const TECH = [
  ['WordPress', /wp-content|wp-includes/i], ['Shopify', /cdn\.shopify\.com|myshopify/i], ['Wix', /wixstatic|wix\.com/i],
  ['Squarespace', /squarespace/i], ['Webflow', /webflow/i], ['Framer', /framerusercontent|framer\.com/i],
  ['Next.js', /\/_next\//i], ['HubSpot', /js\.hs-scripts|hs-analytics|hubspot/i], ['Google Analytics', /gtag\(|google-analytics\.com/i],
  ['Google Tag Manager', /googletagmanager\.com/i], ['Meta Pixel', /connect\.facebook\.net|fbq\(/i], ['Intercom', /intercom/i],
  ['Drift', /drift\.com|js\.driftt/i], ['Zendesk', /zendesk|zdassets/i], ['Freshworks', /freshchat|freshdesk|freshworks/i],
  ['Zoho SalesIQ', /salesiq\.zoho/i], ['Calendly', /calendly\.com/i], ['Stripe', /js\.stripe\.com/i], ['Razorpay', /razorpay/i],
  ['Hotjar', /hotjar/i], ['Klaviyo', /klaviyo/i], ['Mailchimp', /mailchimp|list-manage\.com/i], ['WooCommerce', /woocommerce/i],
  ['Magento', /mage\/|magento/i], ['Tawk.to', /tawk\.to/i], ['Crisp', /crisp\.chat/i], ['LinkedIn Insight', /snap\.licdn\.com/i],
];

const robotsCache = new Map();

async function readLimited(res) {
  const reader = res.body.getReader();
  const chunks = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.length;
    chunks.push(value);
    if (size > MAX_BYTES) { await reader.cancel().catch(() => {}); break; }
  }
  return Buffer.concat(chunks).toString('utf8');
}

// Only crawl public internet hosts (never localhost / private networks / cloud metadata).
function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split('.').map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31)
      || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === '::1' || v === '::' || v.startsWith('fc') || v.startsWith('fd') || v.startsWith('fe80') || v.startsWith('::ffff:');
}

async function assertPublic(url) {
  const u = new URL(url);
  if (!/^https?:$/.test(u.protocol)) throw new Error('Only http(s) URLs');
  const addrs = await dns.lookup(u.hostname, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) throw new Error(`Refusing to crawl non-public host ${u.hostname}`);
}

async function get(url, timeout = 12000) {
  let current = url;
  for (let hop = 0; hop < 5; hop++) {
    await assertPublic(current);
    const res = await fetch(current, {
      redirect: 'manual',
      headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(timeout),
    });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      current = new URL(res.headers.get('location'), current).toString();
      continue;
    }
    const type = res.headers.get('content-type') || '';
    if (!res.ok || !/text\/html|xhtml|text\/plain/i.test(type)) return { url: current, status: res.status, html: '' };
    return { url: current, status: res.status, html: await readLimited(res) };
  }
  throw new Error('Too many redirects');
}

async function allowedByRobots(url) {
  const u = new URL(url);
  const key = u.origin;
  if (!robotsCache.has(key)) {
    let rules = [];
    try {
      await assertPublic(key);
      const res = await fetch(`${key}/robots.txt`, { headers: { 'User-Agent': UA }, redirect: 'manual', signal: AbortSignal.timeout(6000) });
      if (res.ok) {
        const lines = (await res.text()).split(/\r?\n/);
        let applies = false;
        for (const raw of lines) {
          const line = raw.split('#')[0].trim();
          const [k, ...rest] = line.split(':');
          const v = rest.join(':').trim();
          if (/^user-agent$/i.test(k)) applies = v === '*' || /outreachengine/i.test(v);
          else if (applies && /^disallow$/i.test(k) && v) rules.push(v);
        }
      }
    } catch {
      rules = [];
    }
    robotsCache.set(key, rules);
  }
  return !robotsCache.get(key).some((rule) => u.pathname.startsWith(rule.replace(/\*.*$/, '')));
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/&#64;|&commat;/g, '@')
    .replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n)));
}

function htmlToText(html) {
  return decodeEntities(String(html)
    .replace(/<(script|style|noscript|svg|iframe)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>|<\/(p|div|li|h[1-6]|section|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, ' '))
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();
}

function meta(html, name) {
  const re = new RegExp(`<meta[^>]+(?:name|property)=["']${name}["'][^>]*>`, 'i');
  const tag = (html.match(re) || [])[0];
  if (!tag) return '';
  return decodeEntities((tag.match(/content=["']([^"']*)["']/i) || [])[1] || '').trim();
}

function extract(html, pageUrl) {
  const text = htmlToText(html);
  const emails = new Set();
  for (const m of html.matchAll(/mailto:([^"'?>\s]+)/gi)) {
    const e = normalizeEmail(decodeURIComponent(m[1]));
    if (e && !JUNK_EMAIL.test(e)) emails.add(e);
  }
  const deobfuscated = decodeEntities(html).replace(/\s*[[(]\s*at\s*[\])]\s*/gi, '@').replace(/\s*[[(]\s*dot\s*[\])]\s*/gi, '.');
  for (const m of deobfuscated.matchAll(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi)) {
    const e = normalizeEmail(m[0]);
    if (e && !JUNK_EMAIL.test(e)) emails.add(e);
  }
  const phones = new Set();
  for (const m of html.matchAll(/href=["']tel:([^"']+)["']/gi)) phones.add(decodeURIComponent(m[1]).replace(/[^\d+]/g, ''));
  const socials = {};
  const socialRes = {
    linkedin: /https?:\/\/(?:[a-z]{2,3}\.)?linkedin\.com\/(company|in|school)\/[^"'\s<>?#]+/i,
    twitter: /https?:\/\/(?:www\.)?(?:twitter|x)\.com\/(?!share|intent|home)[A-Za-z0-9_]{2,}/i,
    facebook: /https?:\/\/(?:www\.)?facebook\.com\/(?!sharer|share|plugins|tr\b)[^"'\s<>?#]+/i,
    instagram: /https?:\/\/(?:www\.)?instagram\.com\/[^"'\s<>?#]+/i,
    youtube: /https?:\/\/(?:www\.)?youtube\.com\/(?:c\/|channel\/|@)[^"'\s<>?#]+/i,
  };
  for (const [k, re] of Object.entries(socialRes)) {
    const m = html.match(re);
    if (m) socials[k] = m[0].replace(/\/+$/, '');
  }
  const tech = TECH.filter(([, re]) => re.test(html)).map(([name]) => name);
  const origin = new URL(pageUrl).origin;
  const links = new Set();
  for (const m of html.matchAll(/href=["']([^"'#]+)["']/gi)) {
    try {
      const u = new URL(m[1], pageUrl);
      if (u.origin === origin && /\/(contact|about|team|company|who-we-are|our-team|people|leadership)/i.test(u.pathname)) {
        links.add(u.origin + u.pathname);
      }
    } catch { /* ignore bad hrefs */ }
  }
  return {
    title: decodeEntities((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || '').replace(/\s+/g, ' ').trim(),
    description: meta(html, 'description') || meta(html, 'og:description'),
    siteName: meta(html, 'og:site_name'),
    emails: [...emails], phones: [...phones].filter((p) => p.length >= 7), socials, tech, links: [...links], text,
  };
}

// Crawl up to 4 pages of a site. Returns merged findings.
async function crawl(domainOrUrl) {
  const domain = normalizeDomain(domainOrUrl);
  if (!domain) throw new Error('No valid website / domain');
  let home;
  for (const candidate of [`https://${domain}`, `https://www.${domain}`, `http://${domain}`]) {
    try {
      if (!(await allowedByRobots(candidate))) return { domain, blocked: true, emails: [], pages: [] };
      home = await get(candidate);
      if (home.html) break;
    } catch { /* try next */ }
  }
  if (!home || !home.html) throw new Error(`Could not load ${domain}`);
  const first = extract(home.html, home.url);
  const result = {
    domain, url: home.url, title: first.title, description: first.description, siteName: first.siteName,
    emails: new Set(first.emails), phones: new Set(first.phones), socials: { ...first.socials }, tech: new Set(first.tech),
    pages: [home.url], text: first.text.slice(0, 5000),
  };
  const fallbacks = ['/contact', '/contact-us', '/about', '/about-us'].map((p) => new URL(p, home.url).toString());
  const next = [...new Set([...first.links, ...fallbacks])].slice(0, 6);
  for (const url of next) {
    if (result.pages.length >= 4) break;
    try {
      if (!(await allowedByRobots(url))) continue;
      const page = await get(url, 8000);
      if (!page.html) continue;
      const x = extract(page.html, page.url);
      result.pages.push(page.url);
      x.emails.forEach((e) => result.emails.add(e));
      x.phones.forEach((p) => result.phones.add(p));
      x.tech.forEach((t) => result.tech.add(t));
      for (const [k, v] of Object.entries(x.socials)) if (!result.socials[k]) result.socials[k] = v;
      if (/about|team|company|who-we-are/i.test(page.url) && result.text.length < 9000) {
        result.text += `\n\n${x.text.slice(0, 4000)}`;
      }
    } catch { /* skip page */ }
  }
  // Emails on the company's own domain first.
  const own = [...result.emails].filter((e) => domainOf(e).endsWith(domain));
  const other = [...result.emails].filter((e) => !own.includes(e) && !FREE_MAIL.test(e));
  return {
    ...result,
    emails: [...own, ...other].slice(0, 15),
    phones: [...result.phones].slice(0, 5),
    tech: [...result.tech],
  };
}

function bestEmail(emails, lead) {
  if (!emails.length) return null;
  const first = String(lead.first_name || '').toLowerCase();
  const last = String(lead.last_name || '').toLowerCase();
  if (first) {
    const personal = emails.find((e) => {
      const local = e.split('@')[0];
      return local.includes(first) || (last && local.includes(last));
    });
    if (personal) return personal;
  }
  const preference = ['founder', 'ceo', 'hello', 'contact', 'info', 'sales', 'office'];
  for (const p of preference) {
    const hit = emails.find((e) => e.split('@')[0] === p);
    if (hit) return hit;
  }
  return emails[0];
}

// Enrich one lead in place. options: { icebreaker: bool, offer: string }
async function enrichLead(lead, options = {}) {
  const domain = normalizeDomain(lead.company_domain || lead.website || (lead.email && !FREE_MAIL.test(lead.email) ? domainOf(lead.email) : ''));
  if (!domain) throw new Error('Lead has no website or company domain');
  const site = await crawl(domain);
  const enrichment = {
    url: site.url, title: site.title, description: site.description, emails: site.emails, phones: site.phones,
    socials: site.socials, tech: site.tech, pages: site.pages, blocked: site.blocked || false,
    text: (site.text || '').slice(0, 3000),
  };
  const patch = { enrichment, company_domain: lead.company_domain || domain };
  if (!lead.website && site.url) patch.website = site.url;
  if (!lead.phone && site.phones && site.phones[0]) patch.phone = site.phones[0];
  if (!lead.company && (site.siteName || site.title)) patch.company = (site.siteName || site.title.split(/[|\-–]/)[0]).trim().slice(0, 120);

  if (!lead.email && site.emails && site.emails.length) {
    const email = bestEmail(site.emails, lead);
    const taken = await db.one('SELECT id FROM leads WHERE email = $1', [email]);
    if (!taken) {
      const check = await basicCheck(email);
      patch.email = email;
      patch.email_status = check.status === 'unknown' && check.basicOk ? 'unknown' : check.status;
      patch.email_check = check;
    }
  }

  if (options.icebreaker && site.text && (await ai.enabled())) {
    try {
      const r = await ai.icebreaker({ lead: { ...lead, ...patch }, websiteText: site.text, offer: options.offer });
      if (r && r.line) patch.icebreaker = r.line.trim();
    } catch (err) {
      enrichment.icebreaker_error = err.message;
    }
  }

  const cols = Object.keys(patch);
  const sets = cols.map((c, i) => `${c} = $${i + 2}`).join(', ');
  const values = cols.map((c) => (c === 'enrichment' || c === 'email_check' ? JSON.stringify(patch[c]) : patch[c]));
  return db.one(`UPDATE leads SET ${sets}, enriched_at = now(), updated_at = now() WHERE id = $1 RETURNING *`, [lead.id, ...values]);
}

module.exports = { crawl, enrichLead, extract, htmlToText };
