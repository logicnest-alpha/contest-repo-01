// Reply analysis: strip quoted text, spot auto-replies and bounces, categorise replies.
const ai = require('../ai');

// Keep only the new text of a reply (drop "On ... wrote:" and quoted lines).
function latestReply(text) {
  const lines = String(text || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*>/.test(line)) break;
    if (/^On .{5,200}(wrote|écrit|schrieb|escribió):?\s*$/i.test(line)) break;
    if (/^On .{5,200}$/i.test(line) && /wrote:?\s*$/i.test(lines[i + 1] || '')) break;
    if (/^-{2,}\s*(Original Message|Forwarded message)/i.test(line)) break;
    if (/^_{5,}\s*$/.test(line)) break;
    if (/^From:\s.+/i.test(line) && /^(Sent|Date|To):\s/i.test(lines[i + 1] || '')) break;
    out.push(line);
  }
  return out.join('\n').trim();
}

function header(headers, name) {
  if (!headers) return '';
  const v = headers.get(name.toLowerCase());
  if (!v) return '';
  if (typeof v === 'string') return v;
  if (v.value) return String(v.value);
  if (v.text) return String(v.text);
  return String(v);
}

function isAutoReply(headers, subject) {
  const auto = header(headers, 'auto-submitted').toLowerCase();
  if (auto && auto !== 'no') return true;
  if (header(headers, 'x-autoreply') || header(headers, 'x-autorespond')) return true;
  if (/auto_reply|autoreply/i.test(header(headers, 'precedence'))) return true;
  if (header(headers, 'x-auto-response-suppress') && /^(automatic reply|auto)/i.test(subject || '')) return true;
  return /^(auto(matic)?[ -]?(reply|response)|out of (the )?office|autoreply|away from (the )?office|on leave|ooo\b|abwesenheit|absence)/i.test(String(subject || '').trim());
}

// Delivery failure notices (bounces). Returns null or { recipient, status, hard, originalMessageId }.
function detectBounce(parsed) {
  const from = parsed.from && parsed.from.value && parsed.from.value[0] ? parsed.from.value[0] : {};
  const fromText = `${from.address || ''} ${from.name || ''}`;
  const subject = parsed.subject || '';
  const contentType = header(parsed.headers, 'content-type');
  const attachments = parsed.attachments || [];
  const dsnPart = attachments.find((a) => /message\/delivery-status/i.test(a.contentType));
  const isReport = /multipart\/report/i.test(contentType) || Boolean(dsnPart);
  const looksLikeBounce = /mailer-daemon|postmaster|mail delivery (subsystem|system)/i.test(fromText)
    && /undeliver|delivery (status|fail|incomplete|has failed)|failure notice|returned mail|could not be delivered|not delivered|delivery failure|rejected/i.test(subject);
  if (!isReport && !looksLikeBounce) return null;

  const dsnText = dsnPart ? dsnPart.content.toString('utf8') : '';
  const body = `${dsnText}\n${parsed.text || ''}`;
  if (isReport && !looksLikeBounce && /Action:\s*(delivered|relayed|expanded)/i.test(dsnText)) return null; // success DSN

  const rcpt = body.match(/Final-Recipient:\s*rfc822;\s*<?([^\s>;]+@[^\s>;]+)/i)
    || body.match(/Original-Recipient:\s*rfc822;\s*<?([^\s>;]+@[^\s>;]+)/i);
  const status = (body.match(/Status:\s*([245]\.\d{1,3}\.\d{1,3})/i) || [])[1] || null;
  const original = attachments.find((a) => /message\/rfc822|text\/rfc822-headers/i.test(a.contentType));
  const origText = original ? original.content.toString('utf8') : body;
  const originalMessageId = (origText.match(/^Message-ID:\s*(<[^>]+>)/im) || [])[1] || null;
  // Soft bounces (4.x.x: mailbox full, greylisting) are not treated as invalid addresses.
  return {
    recipient: rcpt ? rcpt[1].toLowerCase() : null,
    candidates: (body.match(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi) || []).map((e) => e.toLowerCase()),
    status,
    hard: !status || status.startsWith('5'),
    originalMessageId,
  };
}

function ruleCategory(text) {
  const t = String(text || '').toLowerCase();
  if (/\b(unsubscribe|remove me|take me off|stop (emailing|contacting|sending)|do not (contact|email)|don'?t (contact|email)|opt[ -]?out)\b/.test(t)) return 'unsubscribe';
  if (/^\s*(no|nope|no thanks?)[.!]?\s*$/.test(t)
    || /\b(not interested|no thanks|no thank you|not a (good )?fit|not relevant|we('| a)re (good|all set|covered)|not looking|pass on this|no need|not at this time|not right now)\b/.test(t)) return 'not_interested';
  if (/\b(not the right person|wrong person|not my (area|department)|no longer (with|at|work))\b/.test(t)) {
    return /@|reach out to|contact|speak (to|with)|talk to/.test(t) ? 'referral' : 'wrong_person';
  }
  if (/\b(interested|sounds (good|great|interesting)|let'?s (talk|chat|connect|do it)|book a|schedule|calendly|my calendar|a call|meeting|tell me more|send (me )?(more|details|info)|pricing|how much|what does it cost|available (on|this|next))\b/.test(t)) return 'interested';
  if (t.includes('?')) return 'question';
  return 'other';
}

// Category for a human (non auto) reply. Uses Claude when configured, rules otherwise.
async function categorize({ subject, text }) {
  const fresh = latestReply(text) || String(text || '').slice(0, 2000);
  const rule = ruleCategory(fresh);
  // Opt-outs are decided by rules first so they are never missed.
  if (rule === 'unsubscribe') return { category: 'unsubscribe', summary: '', source: 'rules' };
  if (await ai.enabled()) {
    try {
      const r = await ai.classifyReply({ subject, text: fresh });
      return { category: r.category, summary: r.summary, source: 'ai' };
    } catch (err) {
      console.warn('[classify] AI failed, using rules:', err.message);
    }
  }
  return { category: rule, summary: '', source: 'rules' };
}

// Lead status that follows from a reply category.
const LEAD_STATUS = {
  interested: 'interested',
  not_interested: 'not_interested',
  wrong_person: 'not_interested',
  unsubscribe: 'unsubscribed',
  question: 'replied',
  referral: 'replied',
  other: 'replied',
};

module.exports = { latestReply, isAutoReply, detectBounce, ruleCategory, categorize, header, LEAD_STATUS };
