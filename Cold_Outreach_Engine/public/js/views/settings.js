import { api, state, esc, toast, errorToast, formData, confirmBox, ago, loadMeta } from '../core.js';

export async function mount(root, params, ctx) {
  ctx.setTitle('Settings', 'Sender details, compliance, warmup window, safety limits, integrations');
  const { settings: s, integrations } = await api('/settings');
  const models = state.meta.ai_models;
  root.innerHTML = `
  <div class="grid k2">
    <div class="stack">
      <div class="card" id="general"><div class="card-h"><h2>General & compliance</h2></div><div class="card-b form-grid">
        <label class="field">Your time zone<input type="text" name="timezone" value="${esc(s.timezone)}"><span class="hint">Used for daily limits and the warmup window.</span></label>
        <label class="field">Company / offer (one line)<input type="text" name="company_name" value="${esc(s.company_name)}" placeholder="YourBrand - Shopify stores for D2C brands"><span class="hint">Helps the AI write relevant first lines and replies.</span></label>
        <label class="field full">Opt-out line (added to every campaign email)<textarea name="optout_line" rows="2">${esc(s.optout_line)}</textarea>
          <span class="hint">A plain-text way to opt out keeps you compliant and lowers spam complaints. Replies like "no" / "unsubscribe" are detected and the person is never emailed again.</span></label>
        <label class="field full">Postal address (optional, added under the opt-out line)<input type="text" name="physical_address" value="${esc(s.physical_address)}" placeholder="Required by CAN-SPAM if you email US prospects"></label>
      </div></div>
      <div class="card" id="safety"><div class="card-h"><h2>Warmup & safety limits</h2></div><div class="card-b form-grid">
        <label class="field">Warmup window start<input type="time" name="warmup_window_start" value="${esc(s.warmup_window_start)}"></label>
        <label class="field">Warmup window end<input type="time" name="warmup_window_end" value="${esc(s.warmup_window_end)}"></label>
        <label class="check full"><input type="checkbox" name="warmup_weekends" ${s.warmup_weekends ? 'checked' : ''}> Warm up on weekends too</label>
        <label class="field">Warmup days before campaigns<input type="number" name="min_warmup_days" value="${s.min_warmup_days}" min="0" max="60"><span class="hint">14-21 for new domains.</span></label>
        <label class="field">AI model<select name="ai_model">${models.map((m) => `<option ${m === s.ai_model ? 'selected' : ''}>${m}</option>`).join('')}</select></label>
        <label class="field">Auto-pause above bounce rate (%)<input type="number" name="max_bounce_rate" value="${s.max_bounce_rate}" min="1" max="50"></label>
        <label class="field">Auto-pause above warmup spam rate (%)<input type="number" name="max_spam_rate" value="${s.max_spam_rate}" min="1" max="100"></label>
      </div></div>
      <div class="row"><button class="btn primary" id="save">Save settings</button></div>
    </div>
    <div class="stack">
      <div class="card" id="keys"><div class="card-h"><h2>Integrations</h2><span class="muted small">Stored encrypted. Leave a field empty to keep it.</span></div><div class="card-b stack">
        ${key('anthropic_api_key', 'Anthropic (Claude) API key', 'AI reply categories, website-based first lines, suggested replies.', integrations)}
        ${key('apollo_api_key', 'Apollo.io API key', 'People search by title / location / company size + email reveal.', integrations)}
        ${key('hunter_api_key', 'Hunter.io API key', 'Email verification, people at a domain, email finder.', integrations)}
        ${key('google_places_api_key', 'Google Places API key', 'Local businesses from Google Maps (enable "Places API (New)").', integrations)}
        <div class="row"><button class="btn primary" id="save-keys">Save keys</button></div>
      </div></div>
      <div class="card"><div class="card-h"><h2>Do-not-contact list</h2></div><div class="card-b stack">
        <label class="field">Add emails or whole domains (one per line)<textarea id="supp" rows="3" placeholder="ceo@competitor.com&#10;competitor.com"></textarea></label>
        <div class="row"><button class="btn" id="add-supp">Add</button><input type="search" id="supp-q" placeholder="Search list…"></div>
        <div id="supp-list" class="small"></div>
      </div></div>
      <div class="card"><div class="card-h"><h2>Background engines</h2></div><div class="card-b small" id="jobs"></div></div>
    </div>
  </div>`;

  root.querySelector('#save').onclick = async () => {
    const body = { ...formData(root.querySelector('#general')), ...formData(root.querySelector('#safety')) };
    try { await api('/settings', { method: 'PUT', body }); await loadMeta(); toast('Settings saved', 'ok'); } catch (e) { errorToast(e); }
  };
  root.querySelector('#save-keys').onclick = async () => {
    const body = {};
    root.querySelectorAll('#keys input[type=password]').forEach((el) => { if (el.value.trim()) body[el.name] = el.value.trim(); });
    root.querySelectorAll('#keys [data-clear]:checked').forEach((el) => { body[el.dataset.clear] = ''; });
    try { await api('/settings/secrets', { method: 'PUT', body }); await loadMeta(); toast('Keys saved', 'ok'); mount(root, params, ctx); } catch (e) { errorToast(e); }
  };
  const drawSupp = async () => {
    const rows = await api(`/suppressions?q=${encodeURIComponent(root.querySelector('#supp-q').value)}`);
    root.querySelector('#supp-list').innerHTML = rows.length ? rows.slice(0, 100).map((r) => `<div class="row between"><span><b>${esc(r.value)}</b> <span class="muted">${esc(r.reason)} · ${ago(r.created_at)}</span></span>
      <button class="btn small ghost" data-del="${esc(r.value)}">remove</button></div>`).join('') : '<span class="muted">Empty</span>';
    root.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
      if (!(await confirmBox(`Allow emailing ${b.dataset.del} again?`))) return;
      await api(`/suppressions/${encodeURIComponent(b.dataset.del)}`, { method: 'DELETE' }); drawSupp();
    }; });
  };
  root.querySelector('#supp-q').oninput = drawSupp;
  root.querySelector('#add-supp').onclick = async () => {
    try { const r = await api('/suppressions', { method: 'POST', body: { values: root.querySelector('#supp').value } }); toast(`${r.added} added`, 'ok'); root.querySelector('#supp').value = ''; drawSupp(); } catch (e) { errorToast(e); }
  };
  drawSupp();
  const sched = state.meta.scheduler;
  root.querySelector('#jobs').innerHTML = sched.leader
    ? Object.entries(sched.jobs).map(([name, j]) => `<div class="row between"><span><b>${esc(name)}</b> every ${Math.round(j.every / 60000)} min</span>
        <span class="muted">${j.running ? 'running' : `last run ${ago(j.lastRun)}`}${j.lastError ? ` · ⚠ ${esc(j.lastError)}` : ''}</span></div>`).join('')
    : '<div class="callout warn">The engines (warmup, sending, inbox sync) are not running in this server process. Check that ENGINES is not "off" and that only one copy of the app is running.</div>';
}

function key(name, title, hint, integrations) {
  return `<div class="field"><label for="k-${name}">${esc(title)} ${integrations[name] ? '<span class="chip good">connected</span>' : '<span class="chip">not set</span>'}</label>
    <input type="password" id="k-${name}" name="${name}" autocomplete="off" placeholder="${integrations[name] ? '•••••••• (saved)' : 'paste key'}"><span class="hint">${esc(hint)}</span>
    ${integrations[name] ? `<label class="check small"><input type="checkbox" data-clear="${name}"> remove this key</label>` : ''}</div>`;
}
