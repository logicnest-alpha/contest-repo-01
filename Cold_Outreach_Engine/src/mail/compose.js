// Personalisation: {{variables}} with fallbacks, {spin|tax}, signatures, opt-out line, headers.
const config = require('../config');
const { pick, sign, newMessageId, zoned } = require('../util');

const LEGAL_SUFFIX = /[,\s]+(private limited|pvt\.? ?ltd\.?|pvt|ltd\.?|limited|llc|l\.l\.c\.|inc\.?|incorporated|corp\.?|corporation|gmbh|s\.a\.|plc|co\.?|llp)$/i;
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// Find "{{ ... }}" segments, allowing nested ones inside a fallback:
// {{icebreaker|I came across {{company}} recently.}}
function scanVars(text, onVar) {
  const s = String(text || '');
  let out = '';
  let i = 0;
  while (i < s.length) {
    const start = s.indexOf('{{', i);
    if (start === -1) { out += s.slice(i); break; }
    out += s.slice(i, start);
    let depth = 0;
    let j = start;
    let end = -1;
    while (j < s.length) {
      if (s.startsWith('{{', j)) { depth += 1; j += 2; continue; }
      if (s.startsWith('}}', j)) { depth -= 1; j += 2; if (depth === 0) { end = j; break; } continue; }
      j += 1;
    }
    if (end === -1) { out += s.slice(start); break; }
    out += onVar(s.slice(start, end), s.slice(start + 2, end - 2));
    i = end;
  }
  return out;
}

// {Hi|Hello|Hey} -> one option at random. {{variables}} are left alone. Nesting works.
function spin(text) {
  const saved = [];
  let s = scanVars(text, (whole) => {
    saved.push(whole);
    return `\u0000${saved.length - 1}\u0000`;
  });
  const inner = /\{([^{}]*)\}/;
  for (let guard = 0; inner.test(s) && guard < 2000; guard++) {
    s = s.replace(inner, (_, options) => pick(options.split('|')));
  }
  return s.replace(/\u0000(\d+)\u0000/g, (_, i) => saved[Number(i)]);
}

function nameCase(value) {
  const s = String(value || '').trim();
  if (!s) return '';
  // Only fix names that are all upper or all lower case ("JOHN", "john"); keep "McDonald".
  if (s !== s.toUpperCase() && s !== s.toLowerCase()) return s;
  return s.toLowerCase().replace(/(^|[\s'-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}

function cleanCompany(value) {
  let s = String(value || '').trim();
  for (let i = 0; i < 2; i++) s = s.replace(LEGAL_SUFFIX, '').trim();
  return s;
}

function leadVars(lead = {}, mailbox = {}, tz = 'UTC') {
  const first = nameCase(lead.first_name);
  const last = nameCase(lead.last_name);
  const sender = String(mailbox.from_name || '').trim();
  const vars = {
    first_name: first,
    last_name: last,
    full_name: [first, last].filter(Boolean).join(' '),
    email: lead.email || '',
    company: cleanCompany(lead.company),
    company_full: lead.company || '',
    title: lead.title || '',
    city: lead.city || '',
    country: lead.country || '',
    industry: lead.industry || '',
    website: lead.website || '',
    domain: lead.company_domain || '',
    icebreaker: lead.icebreaker || '',
    sender_name: sender,
    sender_first_name: sender.split(/\s+/)[0] || '',
    sender_email: mailbox.email || '',
    signature: mailbox.signature || '',
    day: DAYS[zoned(tz).weekday % 7],
  };
  const custom = lead.custom && typeof lead.custom === 'object' ? lead.custom : {};
  for (const [k, v] of Object.entries(custom)) {
    if (v === null || v === undefined || typeof v === 'object') continue;
    const key = String(k).toLowerCase().replace(/[^a-z0-9_]/g, '_');
    if (!(key in vars)) vars[key] = String(v);
    vars[`custom.${key}`] = String(v);
  }
  return vars;
}

// Replace {{var}} / {{var|fallback}} (fallbacks may contain variables). Reports variables
// that had no value and no fallback, so we never send "Hi ," to anyone.
function fill(template, vars) {
  const missing = [];
  const evaluate = (text) => scanVars(text, (whole, inner) => {
    const bar = inner.indexOf('|');
    const key = (bar === -1 ? inner : inner.slice(0, bar)).trim().toLowerCase();
    if (!/^[a-z0-9_.]+$/.test(key)) return whole; // not a variable, leave as written
    const value = vars[key];
    if (value !== undefined && value !== null && String(value).trim() !== '') return String(value).trim();
    if (bar !== -1) return evaluate(inner.slice(bar + 1)).trim();
    missing.push(key);
    return '';
  });
  return { text: evaluate(template), missing: [...new Set(missing)] };
}

function tidy(text) {
  return String(text || '')
    .replace(/\r\n?/g, '\n')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function render(template, vars) {
  return fill(spin(template), vars);
}

function replySubject(subject) {
  const s = String(subject || '').trim();
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function unsubscribeUrl(leadId) {
  if (!config.publicUrl || !leadId) return '';
  return `${config.publicUrl}/u/${sign({ l: Number(leadId) })}`;
}

// Build one campaign email for a lead.
// Returns { subject, text, missing, threadSubject, messageId, inReplyTo, references, headers }.
function buildCampaignEmail({ campaign, step, lead, mailbox, campaignLead, settings }) {
  const vars = leadVars(lead, mailbox, campaign.timezone);
  const missing = new Set();

  const isFollowUp = step.step_no > 1 && campaignLead && campaignLead.thread_message_id;
  const newThread = !isFollowUp || String(step.subject || '').trim() !== '';

  let subject;
  if (newThread) {
    const s = render(step.subject || '', vars);
    s.missing.forEach((m) => missing.add(m));
    subject = tidy(s.text).replace(/\n/g, ' ');
  } else {
    subject = replySubject(campaignLead.thread_subject);
  }

  const usesSignature = /\{\{\s*signature\s*(\|[^}]*)?\}\}/.test(step.body);
  const b = render(step.body, vars);
  b.missing.forEach((m) => missing.add(m));
  const parts = [b.text];
  if (!usesSignature && mailbox.signature) parts.push(mailbox.signature);
  if (settings.optout_line) parts.push(settings.optout_line);
  if (settings.physical_address) parts.push(settings.physical_address);
  const text = tidy(parts.filter((p) => String(p || '').trim()).join('\n\n'));

  const headers = {};
  if (campaign.unsubscribe_header) {
    const links = [`<mailto:${mailbox.email}?subject=unsubscribe>`];
    const url = unsubscribeUrl(lead.id);
    if (url) {
      links.unshift(`<${url}>`);
      headers['List-Unsubscribe-Post'] = 'List-Unsubscribe=One-Click';
    }
    headers['List-Unsubscribe'] = links.join(', ');
  }

  return {
    subject,
    text,
    missing: [...missing],
    threadSubject: newThread ? subject : campaignLead.thread_subject,
    messageId: newMessageId(mailbox.email),
    inReplyTo: newThread ? null : campaignLead.last_message_id,
    references: newThread ? null : [campaignLead.references_hdr, campaignLead.last_message_id].filter(Boolean).join(' '),
    headers,
    newThread,
  };
}

module.exports = { spin, fill, render, tidy, leadVars, nameCase, cleanCompany, replySubject, buildCampaignEmail, unsubscribeUrl };
