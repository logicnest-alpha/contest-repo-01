import {
  api, state, esc, chip, tags, n, modal, toast, errorToast, formData, confirmBox, followTask, resultSummary, dateTime, label, ago,
} from '../core.js';

const STATUSES = ['new', 'contacted', 'replied', 'interested', 'meeting', 'not_interested', 'unsubscribed', 'bounced'];
const filters = { q: '', status: '', email_status: '', tag: '', has_email: '', min_score: '', sort: 'newest', page: 1 };
let selected = new Set();
let lastTotal = 0;

export async function mount(root, params, ctx) {
  ctx.setTitle('Leads', 'Everyone you can reach - import, verify, enrich, score and add to campaigns');
  const actions = ctx.setActions(`<button class="btn" id="export">Export CSV</button><button class="btn" id="add">Add lead</button>
    <button class="btn primary" id="import">Import CSV</button>`);
  actions.querySelector('#import').onclick = () => importCsv(() => draw(root));
  actions.querySelector('#add').onclick = () => addLead(() => draw(root));
  actions.querySelector('#export').onclick = () => { location.href = `/api/leads/export.csv?${qs()}`; };
  selected = new Set();
  root.innerHTML = '<div id="bar" class="mb"></div><div id="table"></div><div id="task" class="mt"></div>';
  await drawBar(root);
  await draw(root);
}

function qs(extra = {}) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...filters, ...extra })) if (v !== '' && v !== null && v !== undefined) p.set(k, v);
  return p.toString();
}

async function drawBar(root) {
  const tagList = await api('/leads/tags');
  const bar = root.querySelector('#bar');
  bar.innerHTML = `<div class="toolbar">
    <input type="search" name="q" placeholder="Search name, email, company…" value="${esc(filters.q)}">
    <select name="status"><option value="">Any status</option>${STATUSES.map((s) => `<option value="${s}" ${filters.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>
    <select name="email_status"><option value="">Any email</option>${['valid', 'risky', 'unknown', 'invalid'].map((s) => `<option value="${s}" ${filters.email_status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select>
    <select name="has_email"><option value="">With & without email</option><option value="yes" ${filters.has_email === 'yes' ? 'selected' : ''}>Has email</option><option value="no" ${filters.has_email === 'no' ? 'selected' : ''}>No email yet</option></select>
    <select name="tag"><option value="">Any tag / list</option>${tagList.map((t) => `<option value="${esc(t.tag)}" ${filters.tag === t.tag ? 'selected' : ''}>${esc(t.tag)} (${t.n})</option>`).join('')}</select>
    <select name="min_score"><option value="">Any ICP score</option>${[50, 70, 85].map((s) => `<option value="${s}" ${String(filters.min_score) === String(s) ? 'selected' : ''}>ICP ≥ ${s}</option>`).join('')}</select>
    <select name="sort">${[['newest', 'Newest'], ['score', 'Best ICP fit'], ['company', 'Company A-Z'], ['updated', 'Recently updated']].map(([v, t]) => `<option value="${v}" ${filters.sort === v ? 'selected' : ''}>${t}</option>`).join('')}</select>
  </div>`;
  let debounce;
  bar.querySelectorAll('select, input').forEach((el) => {
    el.addEventListener(el.tagName === 'INPUT' ? 'input' : 'change', () => {
      clearTimeout(debounce);
      debounce = setTimeout(() => { filters[el.name] = el.value; filters.page = 1; selected.clear(); draw(root); }, el.tagName === 'INPUT' ? 300 : 0);
    });
  });
}

async function draw(root) {
  const d = await api(`/leads?${qs()}`);
  lastTotal = d.total;
  const pages = Math.max(1, Math.ceil(d.total / d.per_page));
  const el = root.querySelector('#table');
  el.innerHTML = `
  <div class="card">
    <div class="card-h">
      <div class="row"><b>${n(d.total)}</b> <span class="muted">leads</span><span id="sel-count" class="muted small"></span></div>
      <div class="toolbar" id="bulk">
        <select id="bulk-scope"><option value="selected">Selected</option><option value="all">All ${n(d.total)} matching</option></select>
        <button class="btn small" data-act="verify">Verify emails</button>
        <button class="btn small" data-act="enrich">Enrich from website</button>
        <button class="btn small" data-act="find_email">Find email (Hunter)</button>
        <button class="btn small" data-act="score">ICP score</button>
        <button class="btn small" data-act="tag">Tag</button>
        <button class="btn small primary" data-act="campaign">Add to campaign</button>
        <button class="btn small" data-act="more">More…</button>
      </div>
    </div>
    <div class="card-b flush table-wrap">
      ${d.rows.length ? `<table><thead><tr><th><input type="checkbox" id="all"></th><th>Name</th><th>Company</th><th>Email</th><th>ICP</th><th>Status</th><th>Tags</th><th>Added</th></tr></thead><tbody>
      ${d.rows.map((l) => `<tr class="click" data-id="${l.id}">
        <td><input type="checkbox" class="sel" value="${l.id}" ${selected.has(l.id) ? 'checked' : ''}></td>
        <td><b>${esc([l.first_name, l.last_name].filter(Boolean).join(' ') || '–')}</b><div class="sub">${esc(l.title || '')}</div></td>
        <td>${esc(l.company || '')}<div class="sub">${esc(l.company_domain || '')}${l.enriched ? ' · enriched' : ''}</div></td>
        <td>${l.email ? esc(l.email) : '<span class="muted">no email yet</span>'}<div>${l.email ? chip(l.email_status) : ''}</div></td>
        <td class="num">${l.icp_score ?? '–'}</td>
        <td>${chip(l.status)}</td>
        <td>${tags(l.tags)}</td>
        <td class="small muted">${ago(l.created_at)}<div>${esc(label(l.source))}</div></td></tr>`).join('')}
      </tbody></table>` : `<div class="empty"><h3>No leads here yet</h3>Import a CSV, or use the <a href="#/finder">Lead finder</a> (Apollo, Hunter, Google Maps).</div>`}
    </div>
    ${pages > 1 ? `<div class="card-h" style="border-top:1px solid var(--border);border-bottom:0"><span class="muted small">Page ${d.page} of ${pages}</span>
      <div class="row"><button class="btn small" id="prev" ${d.page <= 1 ? 'disabled' : ''}>Previous</button><button class="btn small" id="next" ${d.page >= pages ? 'disabled' : ''}>Next</button></div></div>` : ''}
  </div>`;

  const updateCount = () => { el.querySelector('#sel-count').textContent = selected.size ? ` · ${selected.size} selected` : ''; };
  updateCount();
  el.querySelectorAll('.sel').forEach((cb) => {
    cb.addEventListener('click', (e) => e.stopPropagation());
    cb.addEventListener('change', () => { cb.checked ? selected.add(Number(cb.value)) : selected.delete(Number(cb.value)); updateCount(); });
  });
  const all = el.querySelector('#all');
  if (all) all.onchange = () => { el.querySelectorAll('.sel').forEach((cb) => { cb.checked = all.checked; cb.dispatchEvent(new Event('change')); }); };
  el.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => leadDetail(Number(tr.dataset.id), () => draw(root)); });
  const prev = el.querySelector('#prev');
  const next = el.querySelector('#next');
  if (prev) prev.onclick = () => { filters.page -= 1; draw(root); };
  if (next) next.onclick = () => { filters.page += 1; draw(root); };
  el.querySelectorAll('#bulk [data-act]').forEach((b) => { b.onclick = () => bulk(root, b.dataset.act, el.querySelector('#bulk-scope').value); });
}

function target(scope) {
  if (scope === 'all') {
    const f = { ...filters };
    delete f.page; delete f.sort;
    return { filter: f };
  }
  if (!selected.size) throw new Error('Tick some leads first, or choose "All matching"');
  return { ids: [...selected] };
}

async function runTask(root, body) {
  const r = await api('/leads/bulk', { method: 'POST', body });
  if (!r.task_id) { toast('Done', 'ok'); return draw(root); }
  const box = root.querySelector('#task');
  box.innerHTML = '<div class="card card-b" id="taskbox"></div>';
  const t = await followTask(r.task_id, box.querySelector('#taskbox'));
  box.querySelector('#taskbox').insertAdjacentHTML('beforeend', `<div class="small mt">${t.status === 'failed' ? esc(t.error) : resultSummary(t.result)}</div>`);
  draw(root);
}

async function bulk(root, act, scope) {
  let tgt;
  try { tgt = target(scope); } catch (e) { return errorToast(e); }
  const count = tgt.ids ? tgt.ids.length : lastTotal;
  try {
    if (act === 'verify') return runTask(root, { ...tgt, action: 'verify' });
    if (act === 'find_email') return runTask(root, { ...tgt, action: 'find_email' });
    if (act === 'enrich') {
      return modal({
        title: `Enrich ${count} lead(s)`,
        body: `<div class="stack"><p class="small">Visits each company's website (home, contact, about, team) and saves emails, phone, social links, tech stack and a summary.
          Leads without an email get the best address found on the site.</p>
          <label class="check"><input type="checkbox" name="icebreaker" ${state.meta.ai_enabled ? 'checked' : 'disabled'}> Write a personalised first line with AI (saved as {{icebreaker}}) ${state.meta.ai_enabled ? '' : '<span class="muted">- add an Anthropic API key in Settings</span>'}</label>
          <label class="field">What you offer (helps the AI write a relevant line)<input type="text" name="offer" value="${esc(state.meta.settings.company_name || '')}" placeholder="e.g. We build Shopify stores for D2C brands"></label></div>`,
        okText: 'Start',
        onOk: async (el) => { const f = formData(el); runTask(root, { ...tgt, action: 'enrich', icebreaker: f.icebreaker, offer: f.offer }); },
      });
    }
    if (act === 'score') {
      const icps = await api('/icps');
      if (!icps.length) return toast('Create an ICP profile in Lead finder › ICP profiles first', 'error');
      return modal({
        title: 'Score against an ICP',
        body: `<label class="field">ICP profile<select name="value">${icps.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}</select></label>`,
        onOk: async (el) => { await runTask(root, { ...tgt, action: 'score', value: formData(el).value }); },
      });
    }
    if (act === 'tag') {
      return modal({
        title: `Tag ${count} lead(s)`,
        body: `<div class="stack"><label class="field">Tag / list name<input type="text" name="value" placeholder="e.g. saas-founders-india"></label>
          <label class="check"><input type="checkbox" name="remove"> Remove this tag instead</label></div>`,
        onOk: async (el) => { const f = formData(el); await runTask(root, { ...tgt, action: f.remove ? 'untag' : 'tag', value: f.value }); },
      });
    }
    if (act === 'campaign') return addToCampaign(tgt, count);
    if (act === 'more') {
      return modal({
        title: `${count} lead(s)`,
        body: `<div class="stack">
          <label class="field">Set status<select name="status"><option value="">–</option>${STATUSES.map((s) => `<option value="${s}">${label(s)}</option>`).join('')}</select></label>
          <label class="check"><input type="checkbox" name="suppress"> Add to do-not-contact list</label>
          <label class="check"><input type="checkbox" name="delete"> Delete permanently</label></div>`,
        okText: 'Apply',
        onOk: async (el) => {
          const f = formData(el);
          if (f.delete) {
            if (!(await confirmBox(`Delete ${count} lead(s) and their history?`, 'Delete'))) return false;
            await runTask(root, { ...tgt, action: 'delete' });
          } else if (f.suppress) await runTask(root, { ...tgt, action: 'suppress' });
          else if (f.status) await runTask(root, { ...tgt, action: 'status', value: f.status });
          selected.clear();
        },
      });
    }
  } catch (e) { errorToast(e); }
  return null;
}

async function addToCampaign(tgt, count) {
  const campaigns = (await api('/campaigns')).filter((c) => c.status !== 'completed');
  if (!campaigns.length) return toast('Create a campaign first', 'error');
  return modal({
    title: `Add ${count} lead(s) to a campaign`,
    body: `<div class="stack"><label class="field">Campaign<select name="campaign">${campaigns.map((c) => `<option value="${c.id}">${esc(c.name)} (${label(c.status)})</option>`).join('')}</select></label>
      <div class="callout small">Leads without an email, unsubscribed / bounced leads, anyone on the do-not-contact list and leads already active in another campaign are skipped automatically.</div></div>`,
    okText: 'Add',
    onOk: async (el) => {
      const id = formData(el).campaign;
      const r = await api(`/campaigns/${id}/leads`, { method: 'POST', body: tgt });
      toast(`${r.added} lead(s) added`, 'ok');
    },
  });
}

function importCsv(done) {
  const m = modal({
    title: 'Import leads from CSV',
    wide: true,
    body: `<div class="stack">
      <div class="callout small">Works with exports from Apollo, Sales Navigator tools, Clay, Hunter, Google Sheets… Columns are matched automatically
        (email, first name, last name, company, website, title, phone, city, country, industry, employees, email status).
        Any other column becomes a custom variable you can use in emails, e.g. <code>{{custom.seniority}}</code>.</div>
      <input type="file" id="file" accept=".csv,text/csv">
      <div id="mapping"></div>
      <div class="form-grid">
        <label class="field">Tag these leads (list name)<input type="text" name="tags" placeholder="e.g. apollo-oct-agencies"></label>
        <label class="field">Score against ICP<select name="icp_id" id="icp"><option value="">–</option></select></label>
      </div>
      <div id="import-task"></div>
    </div>`,
    okText: 'Import',
    onOk: async (el) => {
      if (!csvText) throw new Error('Choose a CSV file');
      const f = formData(el);
      const mapping = {};
      el.querySelectorAll('[data-map]').forEach((s) => { mapping[s.dataset.map] = s.value || null; });
      const r = await api('/leads/import', { method: 'POST', body: { csv: csvText, tags: f.tags, icp_id: f.icp_id || null, mapping } });
      const t = await followTask(r.task_id, el.querySelector('#import-task'));
      el.querySelector('#import-task').insertAdjacentHTML('beforeend', `<div class="small mt">${t.status === 'failed' ? esc(t.error) : resultSummary(t.result)}</div>`);
      done();
      return false;
    },
  });
  let csvText = '';
  api('/icps').then((icps) => {
    m.el.querySelector('#icp').insertAdjacentHTML('beforeend', icps.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join(''));
  }).catch(() => {});
  m.el.querySelector('#file').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    csvText = await file.text();
    try {
      const p = await api('/leads/import/preview', { method: 'POST', body: { csv: csvText } });
      const fields = ['', 'email', 'first_name', 'last_name', 'full_name', 'title', 'company', 'website', 'company_domain', 'linkedin_url', 'phone', 'city', 'country', 'industry', 'employees', 'email_status', 'icebreaker'];
      m.el.querySelector('#mapping').innerHTML = `<p class="small"><b>${n(p.count)}</b> rows. Check the column mapping (empty = custom variable):</p>
        <div class="form-grid k3">${p.headers.map((h) => `<label class="field small">${esc(h)}<select data-map="${esc(h)}">
          ${fields.map((f) => `<option value="${f}" ${p.mapping[h] === f || (!p.mapping[h] && !f) ? 'selected' : ''}>${f ? label(f) : '(custom variable)'}</option>`).join('')}</select></label>`).join('')}</div>`;
    } catch (err) { errorToast(err); }
  };
}

function addLead(done) {
  modal({
    title: 'Add a lead',
    body: `<div class="form-grid">
      <label class="field">Email<input type="email" name="email"></label>
      <label class="field">Company website<input type="text" name="website" placeholder="acme.com"></label>
      <label class="field">First name<input type="text" name="first_name"></label>
      <label class="field">Last name<input type="text" name="last_name"></label>
      <label class="field">Title<input type="text" name="title"></label>
      <label class="field">Company<input type="text" name="company"></label>
      <label class="field">City<input type="text" name="city"></label>
      <label class="field">Country<input type="text" name="country"></label>
      <label class="field full">Tags<input type="text" name="tags" placeholder="comma separated"></label></div>`,
    onOk: async (el) => { await api('/leads', { method: 'POST', body: formData(el) }); toast('Lead saved', 'ok'); done(); },
  });
}

async function leadDetail(id, done) {
  const { lead: l, campaigns, messages } = await api(`/leads/${id}`);
  const e = l.enrichment || {};
  modal({
    title: [l.first_name, l.last_name].filter(Boolean).join(' ') || l.company || l.email || 'Lead',
    wide: true,
    okText: 'Save',
    body: `<div class="grid k2">
      <div class="stack">
        <div class="form-grid">
          <label class="field">Email<input type="email" name="email" value="${esc(l.email || '')}"></label>
          <label class="field">Status<select name="status">${STATUSES.map((s) => `<option value="${s}" ${l.status === s ? 'selected' : ''}>${label(s)}</option>`).join('')}</select></label>
          <label class="field">First name<input type="text" name="first_name" value="${esc(l.first_name || '')}"></label>
          <label class="field">Last name<input type="text" name="last_name" value="${esc(l.last_name || '')}"></label>
          <label class="field">Title<input type="text" name="title" value="${esc(l.title || '')}"></label>
          <label class="field">Company<input type="text" name="company" value="${esc(l.company || '')}"></label>
          <label class="field">Website<input type="text" name="website" value="${esc(l.website || '')}"></label>
          <label class="field">LinkedIn<input type="text" name="linkedin_url" value="${esc(l.linkedin_url || '')}"></label>
          <label class="field">Phone<input type="text" name="phone" value="${esc(l.phone || '')}"></label>
          <label class="field">City<input type="text" name="city" value="${esc(l.city || '')}"></label>
          <label class="field full">Icebreaker / first line <span class="hint">used as {{icebreaker}}</span><textarea name="icebreaker" rows="2">${esc(l.icebreaker || '')}</textarea></label>
          <label class="field full">Tags<input type="text" name="tags" value="${esc((l.tags || []).join(', '))}"></label>
          <label class="field full">Notes<textarea name="notes" rows="3">${esc(l.notes || '')}</textarea></label>
        </div>
      </div>
      <div class="stack small">
        <div><b>Email check:</b> ${chip(l.email_status)} ${l.email_check ? esc(l.email_check.reason || '') : ''}</div>
        <div><b>ICP score:</b> ${l.icp_score ?? '–'} · <b>Source:</b> ${esc(label(l.source))}</div>
        ${l.enrichment ? `<div class="callout"><b>Website</b> ${e.title ? `- ${esc(e.title)}` : ''}<div class="muted">${esc(e.description || '')}</div>
          ${e.tech && e.tech.length ? `<div class="mt"><b>Tech:</b> ${e.tech.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
          ${e.emails && e.emails.length ? `<div class="mt"><b>Emails found:</b> ${e.emails.map(esc).join(', ')}</div>` : ''}
          ${e.socials ? `<div class="mt">${Object.entries(e.socials).map(([k, v]) => `<a href="${esc(v)}" target="_blank" rel="noopener">${esc(k)}</a>`).join(' · ')}</div>` : ''}</div>` : ''}
        ${Object.keys(l.custom || {}).length ? `<div><b>Custom fields</b><div class="mono">${Object.entries(l.custom).map(([k, v]) => `${esc(k)}: ${esc(v)}`).join('<br>')}</div></div>` : ''}
        <div><b>Campaigns</b>${campaigns.length ? campaigns.map((c) => `<div><a href="#/campaigns/${c.campaign_id}">${esc(c.campaign_name)}</a> ${chip(c.status)} step ${c.steps_sent}${c.stop_reason ? ` · ${esc(c.stop_reason)}` : ''}</div>`).join('') : '<div class="muted">Not in a campaign</div>'}</div>
        <div><b>Emails</b>${messages.length ? messages.map((m) => `<div>${m.direction === 'in' ? '⬅' : '➡'} ${esc(m.subject)} ${chip(m.category)} <span class="muted">${dateTime(m.sent_at)}</span></div>`).join('') : '<div class="muted">None yet</div>'}</div>
      </div></div>`,
    onOk: async (el) => { await api(`/leads/${id}`, { method: 'PATCH', body: formData(el) }); toast('Saved', 'ok'); done(); },
  });
}
