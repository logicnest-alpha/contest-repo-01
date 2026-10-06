import { api, state, esc, chip, n, modal, toast, errorToast, formData, confirmBox, ago, dateTime, label, scoreClass } from '../core.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const VARS = ['first_name|there', 'company', 'icebreaker', 'title', 'city', 'sender_first_name', 'day', 'signature'];
let tab = 'sequence';
let data;
let ctxRef;

export async function mount(root, [id], ctx) {
  ctxRef = ctx;
  tab = 'sequence';
  await load(root, id);
}

async function load(root, id) {
  data = await api(`/campaigns/${id}`);
  const c = data.campaign;
  ctxRef.setTitle(c.name, `${label(c.status)} · ${n(data.stats.leads)} leads · ${n(data.stats.sent)} emails sent · ${n(data.stats.replies)} replies`);
  const actions = ctxRef.setActions(`<a class="btn" href="#/campaigns">All campaigns</a>
    ${c.status === 'active' ? '<button class="btn" id="pause">Pause</button>' : `<button class="btn primary" id="start">${c.status === 'draft' ? 'Launch' : 'Resume'}</button>`}
    <button class="btn danger" id="del">Delete</button>`);
  const setStatus = async (status) => {
    try { await api(`/campaigns/${c.id}/status`, { method: 'POST', body: { status } }); toast(status === 'active' ? 'Campaign is live' : 'Paused', 'ok'); load(root, c.id); } catch (e) { errorToast(e); }
  };
  if (actions.querySelector('#start')) actions.querySelector('#start').onclick = () => setStatus('active');
  if (actions.querySelector('#pause')) actions.querySelector('#pause').onclick = () => setStatus('paused');
  actions.querySelector('#del').onclick = async () => {
    if (!(await confirmBox('Delete this campaign? Sent emails stay in the inbox history.', 'Delete'))) return;
    await api(`/campaigns/${c.id}`, { method: 'DELETE' });
    location.hash = '#/campaigns';
  };
  root.innerHTML = `
    <div class="tabs">
      <button data-tab="sequence">Sequence</button><button data-tab="settings">Settings & mailboxes</button>
      <button data-tab="leads">Leads (${n(data.stats.leads)})</button><button data-tab="overview">Overview</button>
    </div><div id="pane"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; show(root); }; });
  show(root);
}

function show(root) {
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const pane = root.querySelector('#pane');
  if (tab === 'sequence') return sequence(pane);
  if (tab === 'settings') return settingsPane(pane, root);
  if (tab === 'leads') return leadsPane(pane, root);
  return overview(pane);
}

// ---------------------------------------------------------------- sequence editor

function sequence(pane) {
  let steps = data.steps.map((s) => ({ ...s }));
  const draw = () => {
    pane.innerHTML = `
    <div class="callout small mb"><b>Write like a person, not a brand.</b> Plain text, 50-125 words, one clear question, no links or images in the first email.
      Use <code>{{variable|fallback}}</code> for personalisation and <code>{Hi|Hello|Hey}</code> spintax so no two emails are identical.
      Follow-ups with an empty subject are sent as replies in the same thread. Your opt-out line and signature are added automatically.</div>
    <div class="stack" id="steps">${steps.map((s, i) => `
      ${i ? `<div class="wait">wait <input type="number" min="0" max="60" data-i="${i}" data-k="delay_days" value="${s.delay_days}"> days, then if no reply:</div>` : ''}
      <div class="step">
        <div class="step-h"><b>Email ${i + 1}</b>${i ? '<span class="muted small">follow-up</span>' : ''}
          <span class="grow"></span><span class="step-check" id="check-${i}"></span>
          <button class="btn small" data-preview="${i}">Preview</button>
          ${steps.length > 1 ? `<button class="btn small danger" data-remove="${i}">Remove</button>` : ''}</div>
        <div class="step-b">
          <input type="text" data-i="${i}" data-k="subject" value="${esc(s.subject)}" placeholder="${i ? 'Leave empty to reply in the same thread (recommended)' : 'Subject - short, lowercase-ish, like a colleague would write'}">
          <textarea data-i="${i}" data-k="body" spellcheck="true">${esc(s.body)}</textarea>
          <div class="vars">${VARS.map((v) => `<button type="button" data-ins="${i}" data-v="{{${v}}}">{{${esc(v)}}}</button>`).join('')}
            <button type="button" data-ins="${i}" data-v="{Hi|Hello|Hey}">{Hi|Hello|Hey}</button></div>
          <div class="small" id="issues-${i}"></div>
        </div>
      </div>`).join('')}
    </div>
    <div class="row mt"><button class="btn" id="add-step" ${steps.length >= 10 ? 'disabled' : ''}>+ Add follow-up</button><span class="grow"></span>
      <button class="btn" id="test">Send test to me</button><button class="btn primary" id="save">Save sequence</button></div>`;

    pane.querySelectorAll('[data-k]').forEach((el) => {
      el.addEventListener('input', () => {
        const i = Number(el.dataset.i);
        steps[i][el.dataset.k] = el.dataset.k === 'delay_days' ? Number(el.value) : el.value;
        if (el.dataset.k !== 'delay_days') check(i);
      });
    });
    pane.querySelectorAll('[data-ins]').forEach((b) => {
      b.onclick = () => {
        const i = Number(b.dataset.ins);
        const ta = pane.querySelector(`textarea[data-i="${i}"]`);
        const pos = ta.selectionStart ?? ta.value.length;
        ta.value = ta.value.slice(0, pos) + b.dataset.v + ta.value.slice(ta.selectionEnd ?? pos);
        ta.focus();
        ta.selectionStart = ta.selectionEnd = pos + b.dataset.v.length;
        ta.dispatchEvent(new Event('input'));
      };
    });
    pane.querySelectorAll('[data-remove]').forEach((b) => { b.onclick = () => { steps.splice(Number(b.dataset.remove), 1); draw(); }; });
    pane.querySelector('#add-step').onclick = () => { steps.push({ delay_days: 3, subject: '', body: '{Hi|Hey} {{first_name|there}},\n\n' }); draw(); };
    pane.querySelector('#save').onclick = () => save();
    pane.querySelector('#test').onclick = () => testSend();
    pane.querySelectorAll('[data-preview]').forEach((b) => { b.onclick = async () => { if (await save(true)) preview(Number(b.dataset.preview) + 1); }; });
    steps.forEach((_, i) => check(i));
  };

  const timers = {};
  const check = (i) => {
    clearTimeout(timers[i]);
    timers[i] = setTimeout(async () => {
      try {
        const r = await api('/content/check', { method: 'POST', body: { subject: steps[i].subject, body: steps[i].body, step_no: i + 1 } });
        const head = pane.querySelector(`#check-${i}`);
        const list = pane.querySelector(`#issues-${i}`);
        if (!head) return;
        head.innerHTML = `Deliverability <span class="score ${scoreClass(r.score, 85, 70)}">${r.score}/100</span> · ${r.words} words`;
        list.innerHTML = r.issues.map((x) => `<div>${chip(x.level === 'high' ? 'bad' : x.level === 'medium' ? 'warn' : 'info', x.level)} ${esc(x.message)}</div>`).join('');
      } catch { /* ignore */ }
    }, 350);
  };

  const save = async (quiet = false) => {
    try {
      await api(`/campaigns/${data.campaign.id}/steps`, { method: 'PUT', body: { steps } });
      data = await api(`/campaigns/${data.campaign.id}`);
      steps = data.steps.map((s) => ({ ...s }));
      if (!quiet) toast('Sequence saved', 'ok');
      return true;
    } catch (e) { errorToast(e); return false; }
  };

  const testSend = async () => {
    if (!(await save(true))) return;
    modal({
      title: 'Send a test email',
      body: `<div class="stack"><label class="field">Send to<input type="email" name="to" value="${esc(state.meta.admin_email)}"></label>
        <label class="field">Which email<select name="step_no">${steps.map((s, i) => `<option value="${i + 1}">Email ${i + 1}</option>`).join('')}</select></label>
        <div class="callout small">Sent from the campaign's first mailbox with a random lead's details. Check it lands in the inbox (not spam / promotions) on Gmail and Outlook.</div></div>`,
      okText: 'Send',
      onOk: async (el) => { const r = await api(`/campaigns/${data.campaign.id}/test`, { method: 'POST', body: formData(el) }); toast(`Sent from ${r.from} to ${r.to}`, 'ok'); },
    });
  };
  draw();
}

async function preview(stepNo) {
  const show = async (m) => {
    const p = await api(`/campaigns/${data.campaign.id}/preview`, { method: 'POST', body: { step_no: stepNo } });
    m.el.querySelector('.modal-b').innerHTML = `<div class="stack">
      <div class="small"><b>From:</b> ${esc(p.from)}<br><b>To:</b> ${esc(p.to || '')} (${esc(p.lead.name || '')}${p.lead.company ? `, ${esc(p.lead.company)}` : ''})<br><b>Subject:</b> ${esc(p.subject)}</div>
      ${p.missing.length ? `<div class="callout bad small">Missing values for <b>${p.missing.map(esc).join(', ')}</b> - this lead would be skipped. Add a fallback, e.g. <code>{{${esc(p.missing[0])}|…}}</code>.</div>` : ''}
      <div class="preview">${esc(p.text)}</div>
      <div class="small muted">Headers: ${Object.entries(p.headers).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>') || 'none'}</div></div>`;
  };
  const m = modal({ title: `Preview - email ${stepNo}`, body: 'Loading…', wide: true, okText: 'Another random lead', onOk: async (el) => { await show({ el }); return false; } });
  show(m).catch((e) => { m.close(); errorToast(e); });
}

// ---------------------------------------------------------------- settings

async function settingsPane(pane, root) {
  const c = data.campaign;
  const mailboxes = (await api('/mailboxes')).filter((m) => m.role === 'sender');
  pane.innerHTML = `
  <div class="grid k2">
    <div class="card"><div class="card-h"><h2>Send from</h2><span class="muted small">Emails rotate across these; each lead's follow-ups come from the same mailbox</span></div>
      <div class="card-b stack">${mailboxes.length ? mailboxes.map((m) => `
        <label class="check"><input type="checkbox" name="mailbox_ids" data-multi value="${m.id}" ${data.mailbox_ids.includes(m.id) ? 'checked' : ''}>
          <span><b>${esc(m.email)}</b> ${chip(m.status)}<br><span class="small muted">${m.not_ready ? esc(m.not_ready) : `ready · ${m.campaign_limit_today}/day today`}</span></span></label>`).join('')
    : '<div class="muted">No mailboxes. <a href="#/mailboxes">Connect one</a>.</div>'}</div></div>
    <div class="card"><div class="card-h"><h2>Schedule & rules</h2></div>
      <div class="card-b form-grid">
        <label class="field full">Name<input type="text" name="name" value="${esc(c.name)}"></label>
        <label class="field">Time zone of your prospects<input type="text" name="timezone" value="${esc(c.timezone)}" list="tz-list">
          <datalist id="tz-list">${['Asia/Kolkata', 'Asia/Dubai', 'Asia/Singapore', 'Europe/London', 'Europe/Berlin', 'America/New_York', 'America/Chicago', 'America/Los_Angeles', 'Australia/Sydney'].map((t) => `<option value="${t}">`).join('')}</datalist></label>
        <label class="field">Max emails / day (whole campaign)<input type="number" name="daily_limit" value="${c.daily_limit}" min="0"></label>
        <label class="field">Send from<input type="time" name="window_start" value="${String(c.window_start).slice(0, 5)}"></label>
        <label class="field">until<input type="time" name="window_end" value="${String(c.window_end).slice(0, 5)}"></label>
        <div class="field full">Days<div class="days">${DAY_NAMES.map((d, i) => `<label><input type="checkbox" name="send_days" data-multi value="${i + 1}" ${c.send_days.includes(i + 1) ? 'checked' : ''}>${d}</label>`).join('')}</div></div>
        <label class="check full"><input type="checkbox" name="stop_on_reply" ${c.stop_on_reply ? 'checked' : ''}> Stop the sequence when the lead replies</label>
        <label class="check full"><input type="checkbox" name="stop_on_company_reply" ${c.stop_on_company_reply ? 'checked' : ''}> Also stop colleagues at the same company when someone there replies</label>
        <label class="check full"><input type="checkbox" name="allow_risky" ${c.allow_risky ? 'checked' : ''}> Also send to <b>risky</b> emails (catch-all domains, info@ style addresses)</label>
        <label class="check full"><input type="checkbox" name="allow_unverified" ${c.allow_unverified ? 'checked' : ''}> Also send to <b>unverified</b> emails <span class="muted">(not recommended - verify first to keep bounces under 2%)</span></label>
        <label class="check full"><input type="checkbox" name="unsubscribe_header" ${c.unsubscribe_header ? 'checked' : ''}> Add a List-Unsubscribe header (invisible one-click opt-out; good for deliverability)</label>
        <div class="full"><button class="btn primary" id="save">Save settings</button></div>
      </div></div>
  </div>`;
  pane.querySelector('#save').onclick = async () => {
    const f = formData(pane);
    f.send_days = (f.send_days || []).map(Number);
    f.mailbox_ids = (f.mailbox_ids || []).map(Number);
    try { await api(`/campaigns/${c.id}`, { method: 'PATCH', body: f }); toast('Saved', 'ok'); load(root, c.id); } catch (e) { errorToast(e); }
  };
}

// ---------------------------------------------------------------- leads

async function leadsPane(pane, root, status = '') {
  const rows = await api(`/campaigns/${data.campaign.id}/leads${status ? `?status=${status}` : ''}`);
  const tagList = await api('/leads/tags');
  pane.innerHTML = `
  <div class="row between mb">
    <div class="toolbar"><select id="st"><option value="">All</option>${['active', 'completed', 'replied', 'bounced', 'unsubscribed', 'stopped', 'failed'].map((s) => `<option value="${s}" ${status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>
      <span class="muted small">showing up to 500</span></div>
    <button class="btn primary" id="add">Add leads</button>
  </div>
  <div class="card"><div class="card-b flush table-wrap">${rows.length ? `<table><thead><tr><th>Lead</th><th>Status</th><th>Step</th><th>Mailbox</th><th>Next email</th><th>Last sent</th><th></th></tr></thead><tbody>
    ${rows.map((r) => `<tr><td><b>${esc([r.first_name, r.last_name].filter(Boolean).join(' ') || r.email)}</b><div class="sub">${esc(r.email)} · ${esc(r.company || '')}</div></td>
      <td>${chip(r.status)}${r.stop_reason ? `<div class="sub">${esc(r.stop_reason)}</div>` : ''}</td>
      <td class="num">${r.steps_sent} / ${data.steps.length}</td><td class="small">${esc(r.mailbox_email || 'next free mailbox')}</td>
      <td class="small">${r.status === 'active' && r.next_send_at ? (new Date(r.next_send_at) < new Date() ? 'due now' : ago(r.next_send_at)) : '–'}</td>
      <td class="small">${r.last_sent_at ? dateTime(r.last_sent_at) : '–'}</td>
      <td class="right">${r.status === 'active' ? `<button class="btn small" data-rm="${r.id}">Remove</button>` : ''}</td></tr>`).join('')}
    </tbody></table>` : '<div class="empty">No leads in this campaign yet.</div>'}</div></div>`;
  pane.querySelector('#st').onchange = (e) => leadsPane(pane, root, e.target.value);
  pane.querySelectorAll('[data-rm]').forEach((b) => { b.onclick = async () => {
    await api(`/campaigns/${data.campaign.id}/leads/${b.dataset.rm}`, { method: 'DELETE' });
    leadsPane(pane, root, status);
  }; });
  pane.querySelector('#add').onclick = () => modal({
    title: 'Add leads to this campaign',
    body: `<div class="stack">
      <div class="callout small">Pick leads by list/tag and filters. You can also tick individual leads on the <a href="#/leads">Leads</a> page and use <b>Add to campaign</b>.</div>
      <div class="form-grid">
        <label class="field">Tag / list<select name="tag"><option value="">Any</option>${tagList.map((t) => `<option value="${esc(t.tag)}">${esc(t.tag)} (${t.n})</option>`).join('')}</select></label>
        <label class="field">Lead status<select name="status"><option value="new">New (never contacted)</option><option value="">Any</option></select></label>
        <label class="field">Email check<select name="email_status"><option value="valid">Valid only (recommended)</option><option value="">Any</option><option value="risky">Risky</option><option value="unknown">Unverified</option></select></label>
        <label class="field">Minimum ICP score<input type="number" name="min_score" min="0" max="100" placeholder="e.g. 60"></label>
      </div></div>`,
    okText: 'Add matching leads',
    onOk: async (el) => {
      const f = formData(el);
      const filter = { has_email: 'yes', not_in_campaign: data.campaign.id };
      for (const k of ['tag', 'status', 'email_status', 'min_score']) if (f[k]) filter[k] = f[k];
      const r = await api(`/campaigns/${data.campaign.id}/leads`, { method: 'POST', body: { filter } });
      toast(`${r.added} lead(s) added`, 'ok');
      load(root, data.campaign.id).then(() => { tab = 'leads'; show(root); });
    },
  });
}

// ---------------------------------------------------------------- overview

function overview(pane) {
  const s = data.stats;
  const d = data.diagnose;
  const stepRows = data.steps.map((st) => {
    const x = data.step_stats.find((r) => r.step_no === st.step_no) || { sent: 0, replies: 0 };
    return `<tr><td>Email ${st.step_no}</td><td>${esc(st.subject || '(same thread)')}</td><td class="right num">${n(x.sent)}</td>
      <td class="right num">${n(x.replies)}</td><td class="right num">${x.sent ? `${Math.round((1000 * x.replies) / x.sent) / 10}%` : '–'}</td></tr>`;
  }).join('');
  pane.innerHTML = `
  <div class="grid k4 mb">
    ${[['Contacted', s.contacted], ['Replied', s.replies], ['Interested', s.interested], ['Bounced', s.bounced]].map(([k, v]) => `<div class="card kpi"><div class="label">${k}</div><div class="value">${n(v)}</div></div>`).join('')}
  </div>
  <div class="grid k2">
    <div class="card"><div class="card-h"><h2>Is it sending right now?</h2></div><div class="card-b stack small">
      <div>Campaign status: ${chip(data.campaign.status)} · Sending window: ${d.window_open ? chip('good', 'open') : chip('warn', 'closed')}
        (${esc(String(data.campaign.window_start).slice(0, 5))}-${esc(String(data.campaign.window_end).slice(0, 5))} ${esc(data.campaign.timezone)})</div>
      <div>Sent today: <b>${n(d.campaign_sent_today)}</b> / ${n(d.daily_limit)} · Leads due now: <b>${n(d.due_now)}</b></div>
      ${d.mailboxes.length ? d.mailboxes.map((m) => `<div>${esc(m.email)}: ${m.reason ? chip('warn', m.reason) : chip('good', 'ready')} · ${m.sent_today}/${m.limit_today} today
        ${m.next_send_at && new Date(m.next_send_at) > new Date() ? `· next in ${ago(m.next_send_at).replace('in ', '')}` : ''}</div>`).join('') : '<div class="callout warn">No mailboxes selected.</div>'}
    </div></div>
    <div class="card"><div class="card-h"><h2>By step</h2></div><div class="card-b flush table-wrap">
      <table><thead><tr><th>Step</th><th>Subject</th><th class="right">Sent</th><th class="right">Replies</th><th class="right">Rate</th></tr></thead><tbody>${stepRows}</tbody></table>
    </div></div>
  </div>`;
}
