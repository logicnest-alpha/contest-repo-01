// Content checker for cold emails. Scores 0-100 (higher is safer) with concrete fixes.
// These are heuristics that spam filters and recipients react to, not a guarantee.

const TRIGGERS = [
  // money / offers
  '100% free', 'free trial', 'free gift', 'free access', 'free consultation', 'act now', 'apply now',
  'best price', 'big savings', 'bonus', 'buy now', 'cash', 'cheap', 'clearance', 'deal', 'discount',
  'double your', 'earn money', 'extra income', 'fast cash', 'financial freedom', 'get paid', 'guarantee',
  'guaranteed', 'increase sales', 'increase traffic', 'lowest price', 'make money', 'million dollars',
  'money back', 'no cost', 'no fees', 'offer expires', 'order now', 'per month', 'prize', 'profits',
  'promise you', 'pure profit', 'risk-free', 'risk free', 'save big', 'special promotion', 'winner',
  'you have been selected', 'congratulations',
  // urgency
  'urgent', 'limited time', 'once in a lifetime', 'only today', 'expires today', "don't delete",
  'do not delete', 'immediately', 'last chance', 'now or never', 'hurry',
  // marketing-speak
  'click here', 'click below', 'visit our website', 'subscribe', 'unsubscribe here', 'opt in',
  'dear friend', 'dear sir', 'to whom it may concern', 'this is not spam', 'not spam', 'remove me',
  'amazing', 'incredible deal', 'miracle', 'revolutionary', '#1', 'number one', 'world class',
  // shady
  'no credit check', 'pre-approved', 'viagra', 'casino', 'crypto', 'bitcoin', 'investment opportunity',
  'work from home', 'mlm', 'weight loss',
];

// Whole-word matching so "deal" does not fire on "ideal" or "subscribe" on "unsubscribe".
const TRIGGER_RES = TRIGGERS.map((t) => {
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pre = /^\w/.test(t) ? '\\b' : '';
  const post = /\w$/.test(t) ? '\\b' : '';
  return { t, re: new RegExp(`${pre}${esc}${post}`, 'i') };
});

const SHORTENERS = /\b(bit\.ly|tinyurl\.com|goo\.gl|t\.co|ow\.ly|is\.gd|buff\.ly|rebrand\.ly|cutt\.ly|shorturl\.at)\b/i;

function words(text) {
  return String(text || '').split(/\s+/).filter(Boolean);
}

function check({ subject = '', body = '', stepNo = 1 }) {
  const issues = [];
  let score = 100;
  const add = (points, level, message) => {
    score -= points;
    issues.push({ level, message });
  };

  const fullText = `${subject}\n${body}`;
  const lower = fullText.toLowerCase();
  // Ignore {{variables}} and spintax braces when counting words / caps.
  const plain = fullText.replace(/\{\{[^}]*\}\}/g, 'X').replace(/[{}|]/g, ' ');
  const bodyWords = words(body.replace(/\{\{[^}]*\}\}/g, 'X').replace(/[{}|]/g, ' '));

  const hits = TRIGGER_RES.filter(({ re }) => re.test(lower)).map(({ t }) => t);
  if (hits.length) add(Math.min(30, hits.length * 6), hits.length > 2 ? 'high' : 'medium', `Spam trigger words: ${hits.slice(0, 8).join(', ')}`);

  const links = (body.match(/https?:\/\/[^\s)>\]]+|www\.[^\s)>\]]+/gi) || []);
  if (stepNo === 1 && links.length > 0) add(12, 'medium', 'Links in the first email hurt placement for new domains. Ask a question instead and share links after they reply.');
  else if (links.length > 2) add(10, 'medium', `${links.length} links - keep it to one at most.`);
  if (links.some((l) => SHORTENERS.test(l))) add(20, 'high', 'URL shorteners (bit.ly etc.) are a strong spam signal.');

  if (/<img|\.(png|jpe?g|gif)\b/i.test(body)) add(10, 'medium', 'Images / image links - cold email should be plain text.');
  if (/<[a-z][\s\S]*>/i.test(body)) add(5, 'low', 'Looks like HTML - write plain text.');

  const capsWords = words(plain).filter((w) => w.length > 3 && /^[A-Z0-9!?.,'-]+$/.test(w) && /[A-Z]/.test(w));
  if (capsWords.length >= 3) add(10, 'medium', `Too many ALL-CAPS words (${capsWords.slice(0, 5).join(', ')}).`);
  const exclaims = (fullText.match(/!/g) || []).length;
  if (exclaims > 2) add(8, 'low', `${exclaims} exclamation marks - one at most.`);
  if (/[$€£₹]\s?\d|\d+\s?%\s?off/i.test(fullText)) add(6, 'low', 'Prices / "% off" read like a promotion.');

  // subject
  const subj = subject.trim();
  if (stepNo === 1 && !subj) add(15, 'high', 'The first email needs a subject.');
  if (subj) {
    const sw = words(subj.replace(/\{\{[^}]*\}\}/g, 'X'));
    if (sw.length > 8) add(6, 'low', 'Subject is long - 2 to 6 words looks like a real 1:1 email.');
    if (/^(re|fwd?):/i.test(subj) && stepNo === 1) add(15, 'high', 'Fake "Re:"/"Fwd:" subjects get reported as spam.');
    if (/!|\?\?|\$/.test(subj)) add(5, 'low', 'Avoid !, ?? and $ in the subject.');
    if (subj === subj.toUpperCase() && /[A-Z]{4,}/.test(subj)) add(10, 'medium', 'All-caps subject.');
  }

  // length
  if (stepNo === 1 && bodyWords.length > 150) add(8, 'low', `${bodyWords.length} words - aim for 50 to 125 in the first email.`);
  if (bodyWords.length > 250) add(8, 'medium', `${bodyWords.length} words - too long for cold email.`);
  if (bodyWords.length < 15 && stepNo === 1) add(4, 'low', 'Very short - add one line on why you are reaching out to them specifically.');

  // personalisation + variety
  if (!/\{\{\s*(first_name|company|icebreaker)/i.test(fullText)) add(8, 'medium', 'No personalisation ({{first_name}}, {{company}} or {{icebreaker}}). Identical emails are easy for filters to cluster.');
  if (stepNo === 1 && !/\{[^{}]*\|[^{}]*\}/.test(fullText.replace(/\{\{[^}]*\}\}/g, ''))) {
    add(4, 'low', 'No spintax ({Hi|Hello|Hey}). Variation makes every email unique.');
  }
  if (/\{\{\s*unsubscribe/i.test(body) || /unsubscribe/i.test(body)) {
    add(4, 'low', 'The word "unsubscribe" in the body reads like a newsletter. The opt-out line + List-Unsubscribe header already cover this.');
  }
  if (/\b(attachment|attached)\b/i.test(body)) add(4, 'low', 'Mentions an attachment - never attach files to cold email.');

  score = Math.max(0, Math.min(100, score));
  const grade = score >= 85 ? 'great' : score >= 70 ? 'ok' : score >= 50 ? 'risky' : 'poor';
  return { score, grade, issues, words: bodyWords.length, links: links.length };
}

module.exports = { check, TRIGGERS };
