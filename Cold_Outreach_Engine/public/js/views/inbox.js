import { api, state, esc, chip, toast, errorToast, ago, dateTime, label } from '../core.js';

const CATEGORIES = ['interested', 'question', 'referral', 'not_interested', 'wrong_person', 'ooo', 'unsubscribe', 'other'];
const LEAD_STATUSES = ['replied', 'interested', 'meeting', 'not_interested', 'unsubscribed'];
const filter = { view: 'leads', category: '', mailbox_id: '', unread: '', q: '' };
let activeKey = null;
let timer;

export async function mount(root, params, ctx) {
  ctx.setTitle('Unified inbox', 'Replies from every mailbox in one place');
  const actions = ctx.setActions('<button class="btn" id="sync">Check for new mail</button>');
  actions.querySelector('#sync').onclick = async (e) => {
    e.target.disabled = true;
    try { await api('/jobs/inbox-sync/run', { method: 'POST' }); toast('Inboxes synced', 'ok'); await drawList(root); } catch (err) { errorToast(err); }
    e.target.disabled = false;
  };
  const mailboxes = (await api('/mailboxes')).filter((m) => m.role === 'sender');
  root.innerHTML = `
  <div class="toolbar mb">
    <select data-f="view"><option value="leads">Lead replies</option><option value="">All mail</option><option value="other">Other mail</option><option value="bounces">Bounces</option></select>
    <select data-f="category"><option value="">Any category</option>${CATEGORIES.map((c) => `<option value="${c}">${label(c)}</option>`).join('')}</select>
    <select data-f="mailbox_id"><option value="">All mailboxes</option>${mailboxes.map((m) => `<option value="${m.id}">${esc(m.email)}</option>`).join('')}</select>
    <label class="check"><input type="checkbox" data-f="unread"> Unread only</label>
    <input type="search" data-f="q" placeholder="Search…">
  </div>
  <div class="card unibox"><div class="list" id="list"></div><div class="thread" id="thread"><div class="empty">Select a conversation</div></div></div>`;
  root.querySelectorAll('[data-f]').forEach((el) => {
    const k = el.dataset.f;
    if (el.type === 'checkbox') el.checked = filter[k] === '1'; else el.value = filter[k];
    el.addEventListener(el.type === 'search' ? 'input' : 'change', () => {
      filter[k] = el.type === 'checkbox' ? (el.checked ? '1' : '') : el.value;
      drawList(root);
    });
  });
  await drawList(root);
  if (activeKey) openThread(root, activeKey);
  timer = setInterval(() => drawList(root).catch(() => {}), 60000);
}

export function unmount() {
  clearInterval(timer);
}

async function drawList(root) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filter)) if (v) p.set(k, v);
  const d = await api(`/inbox?${p}`);
  const list = root.querySelector('#list');
  if (!list) return;
  list.innerHTML = d.rows.length ? d.rows.map((t) => `
    <div class="item ${Number(t.unread) ? 'unread' : ''} ${t.thread_key === activeKey ? 'active' : ''}" data-key="${esc(t.thread_key)}">
      <div class="who"><span class="ellipsis">${esc(t.first_name ? `${t.first_name} ${t.last_name || ''}` : (t.from_name || t.from_email))}${t.company ? ` <span class="muted">· ${esc(t.company)}</span>` : ''}</span>
        <span class="muted small nowrap">${ago(t.last_at)}</span></div>
      <div class="subj ellipsis">${esc(t.subject || '(no subject)')}</div>
      <div class="snip ellipsis">${t.last_direction === 'out' ? '<span class="muted">You: </span>' : ''}${esc(t.snippet)}</div>
      <div class="row" style="gap:4px">${chip(t.category)}${t.was_spam ? chip('warn', 'was in spam') : ''}<span class="muted small ellipsis">${esc(t.mailbox_email)}</span></div>
    </div>`).join('') : `<div class="empty small">${filter.view === 'leads' ? 'No replies from leads yet. Replies to your campaigns appear here automatically.' : 'Nothing here.'}</div>`;
  list.querySelectorAll('.item').forEach((el) => { el.onclick = () => openThread(root, el.dataset.key); });
}

async function openThread(root, key) {
  activeKey = key;
  root.querySelectorAll('.item').forEach((el) => el.classList.toggle('active', el.dataset.key === key));
  const pane = root.querySelector('#thread');
  let t;
  try { t = await api(`/inbox/thread?key=${encodeURIComponent(key)}`); } catch (e) { pane.innerHTML = `<div class="empty">${esc(e.message)}</div>`; return; }
  const last = t.messages[t.messages.length - 1];
  const lastIn = [...t.messages].reverse().find((m) => m.direction === 'in');
  const lead = t.lead;
  pane.innerHTML = `
  <div class="thread-h">
    <div><h2>${esc(last.subject || '(no subject)')}</h2>
      <div class="small muted">${lead ? `<b>${esc([lead.first_name, lead.last_name].filter(Boolean).join(' ') || lead.email)}</b> · ${esc(lead.title || '')} ${lead.company ? `at ${esc(lead.company)}` : ''} · ` : ''}
        via ${esc(last.mailbox_email)}${t.campaign ? ` · campaign <a href="#/campaigns/${t.campaign.id}">${esc(t.campaign.name)}</a>` : ''}</div></div>
    <div class="toolbar">
      ${lastIn ? `<select id="cat" title="Reply category"><option value="">Category…</option>${CATEGORIES.map((c) => `<option value="${c}" ${lastIn.category === c ? 'selected' : ''}>${label(c)}</option>`).join('')}</select>` : ''}
      ${lead ? `<select id="lead-status" title="Lead status">${LEAD_STATUSES.concat(LEAD_STATUSES.includes(lead.status) ? [] : [lead.status]).map((s) => `<option value="${s}" ${lead.status === s ? 'selected' : ''}>Lead: ${label(s)}</option>`).join('')}</select>` : ''}
      <button class="btn small" id="unread">Mark unread</button>
    </div>
  </div>
  <div class="msgs">${t.messages.map((m) => {
    const body = esc(m.body_text || '').replace(/^(&gt;.*)$/gm, '<span class="quoted">$1</span>');
    return `<div class="msg ${m.direction}"><div class="meta"><span><b>${esc(m.direction === 'out' ? `You (${m.from_email})` : (m.from_name || m.from_email))}</b>
      ${m.direction === 'in' ? `&lt;${esc(m.from_email)}&gt;` : `→ ${esc(m.to_email || '')}`}</span>
      <span>${m.step_no && m.direction === 'out' ? `Email ${m.step_no} · ` : ''}${dateTime(m.sent_at)} ${chip(m.category)} ${m.was_spam ? chip('warn', 'rescued from spam') : ''}</span></div>
      <div class="body">${body}</div></div>`;
  }).join('')}</div>
  ${last.is_bounce && !lastIn ? '' : `
  <div class="composer">
    <textarea id="reply" placeholder="Write a reply… (sent from ${esc(last.mailbox_email)}, your signature is added automatically)"></textarea>
    <div class="row between mt">
      <button class="btn" id="suggest" ${state.meta.ai_enabled ? '' : 'disabled title="Add an Anthropic API key in Settings"'}>✨ Suggest reply</button>
      <button class="btn primary" id="send">Send reply</button>
    </div>
  </div>`}`;

  const cat = pane.querySelector('#cat');
  if (cat) cat.onchange = async () => { if (!cat.value) return; await api('/inbox/thread/category', { method: 'POST', body: { key, category: cat.value } }); toast('Updated', 'ok'); drawList(root); };
  const ls = pane.querySelector('#lead-status');
  if (ls) ls.onchange = async () => { await api(`/leads/${lead.id}`, { method: 'PATCH', body: { status: ls.value } }); toast(`Lead marked ${label(ls.value)}`, 'ok'); };
  pane.querySelector('#unread').onclick = async () => { await api('/inbox/thread/unread', { method: 'POST', body: { key } }); activeKey = null; drawList(root); };
  const send = pane.querySelector('#send');
  if (send) {
    send.onclick = async () => {
      const body = pane.querySelector('#reply').value.trim();
      if (!body) return toast('Write something first', 'error');
      send.disabled = true;
      try { await api('/inbox/reply', { method: 'POST', body: { key, body } }); toast('Reply sent', 'ok'); await openThread(root, key); drawList(root); } catch (e) { errorToast(e); send.disabled = false; }
      return null;
    };
    pane.querySelector('#suggest').onclick = async (e) => {
      e.target.disabled = true;
      e.target.textContent = 'Thinking…';
      try { const r = await api('/inbox/suggest', { method: 'POST', body: { key } }); pane.querySelector('#reply').value = r.body; } catch (err) { errorToast(err); }
      e.target.disabled = false;
      e.target.textContent = '✨ Suggest reply';
    };
  }
  drawList(root);
}
