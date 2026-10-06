import { api, state, esc, n, modal, toast, errorToast, formData, followTask, resultSummary, confirmBox } from '../core.js';

let tab = 'icp';

export async function mount(root, params, ctx) {
  ctx.setTitle('Lead finder', 'Define your ICP, then pull matching leads from Apollo, Hunter and Google Maps');
  root.innerHTML = `
    <div class="tabs">
      <button data-tab="icp">1. ICP profiles</button>
      <button data-tab="apollo">Apollo people search</button>
      <button data-tab="maps">Google Maps businesses</button>
      <button data-tab="hunter">Hunter domain search</button>
    </div>
    <div id="pane"></div>`;
  root.querySelectorAll('[data-tab]').forEach((b) => { b.onclick = () => { tab = b.dataset.tab; show(root); }; });
  await show(root);
}

async function show(root) {
  root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
  const pane = root.querySelector('#pane');
  const icps = await api('/icps');
  if (tab === 'icp') return icpPane(pane, icps, () => show(root));
  if (tab === 'apollo') return apolloPane(pane, icps);
  if (tab === 'maps') return mapsPane(pane, icps);
  if (tab === 'hunter') return hunterPane(pane, icps);
  return null;
}

function keyMissing(name, labelText) {
  return state.meta.integrations[name] ? '' : `<div class="callout warn mb">Add your ${labelText} API key in <a href="#/settings">Settings › Integrations</a> to use this.</div>`;
}

function icpOptions(icps) {
  return `<option value="">No ICP scoring</option>${icps.map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join('')}`;
}

async function runTask(box, path, body) {
  const r = await api(path, { method: 'POST', body });
  box.innerHTML = '<div class="card card-b"></div>';
  const inner = box.firstElementChild;
  const t = await followTask(r.task_id, inner);
  inner.insertAdjacentHTML('beforeend', `<div class="small mt">${t.status === 'failed' ? esc(t.error) : resultSummary(t.result)}</div>
    <div class="mt"><a class="btn small" href="#/leads">View leads</a></div>`);
}

// ---------------------------------------------------------------- ICP

function icpPane(pane, icps, refresh) {
  pane.innerHTML = `
  <div class="callout mb small">Your <b>ICP (ideal customer profile)</b> describes who you sell to. It pre-fills searches and gives every lead a 0-100 fit score
    (title 35%, industry 20%, location 15%, company size 15%, keywords 15%; any excluded keyword = 0) so you email the best-fit people first.</div>
  <div class="row mb"><button class="btn primary" id="new">New ICP profile</button></div>
  <div class="grid k2">${icps.length ? icps.map((i) => `<div class="card"><div class="card-h"><h2>${esc(i.name)}</h2>
      <div class="row"><button class="btn small" data-edit="${i.id}">Edit</button><button class="btn small danger" data-del="${i.id}">Delete</button></div></div>
      <div class="card-b small stack">
        ${row('Titles', i.titles)}${row('Industries', i.industries)}${row('Locations', i.locations)}
        ${row('Company size', i.min_employees != null || i.max_employees != null ? [`${i.min_employees ?? 1} – ${i.max_employees ?? '∞'} employees`] : [])}
        ${row('Keywords', i.keywords)}${row('Exclude', i.exclude_keywords)}
        ${i.notes ? `<div class="muted">${esc(i.notes)}</div>` : ''}
      </div></div>`).join('') : '<div class="card empty">No ICP yet. Example: "Founders and marketing heads of 10-200 person D2C brands in India".</div>'}</div>`;
  pane.querySelector('#new').onclick = () => icpForm(null, refresh);
  pane.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => icpForm(icps.find((i) => i.id === Number(b.dataset.edit)), refresh); });
  pane.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
    if (await confirmBox('Delete this ICP profile? Lead scores stay as they are.')) { await api(`/icps/${b.dataset.del}`, { method: 'DELETE' }); refresh(); }
  }; });
}

function row(name, list) {
  return list && list.length ? `<div><b>${name}:</b> ${list.map((x) => `<span class="tag">${esc(x)}</span>`).join('')}</div>` : '';
}

function icpForm(icp, done) {
  const v = icp || {};
  const j = (a) => esc((a || []).join(', '));
  modal({
    title: icp ? 'Edit ICP' : 'New ICP profile',
    wide: true,
    body: `<div class="form-grid">
      <label class="field full">Name<input type="text" name="name" value="${esc(v.name || '')}" placeholder="D2C founders India"></label>
      <label class="field full">Job titles <span class="hint">comma separated - matched inside the lead's title</span><input type="text" name="titles" value="${j(v.titles)}" placeholder="founder, co-founder, ceo, head of marketing, cmo"></label>
      <label class="field">Industries<input type="text" name="industries" value="${j(v.industries)}" placeholder="ecommerce, retail, consumer goods"></label>
      <label class="field">Locations<input type="text" name="locations" value="${j(v.locations)}" placeholder="india, bengaluru, mumbai"></label>
      <label class="field">Min employees<input type="number" name="min_employees" value="${v.min_employees ?? ''}"></label>
      <label class="field">Max employees<input type="number" name="max_employees" value="${v.max_employees ?? ''}"></label>
      <label class="field">Keywords <span class="hint">company / website text</span><input type="text" name="keywords" value="${j(v.keywords)}" placeholder="shopify, d2c, skincare"></label>
      <label class="field">Exclude keywords<input type="text" name="exclude_keywords" value="${j(v.exclude_keywords)}" placeholder="agency, freelancer, student"></label>
      <label class="field full">Notes (pain points, offer, angle)<textarea name="notes" rows="3">${esc(v.notes || '')}</textarea></label></div>`,
    onOk: async (el) => {
      const body = formData(el);
      if (icp) await api(`/icps/${icp.id}`, { method: 'PUT', body });
      else await api('/icps', { method: 'POST', body });
      done();
    },
  });
}

// ---------------------------------------------------------------- Apollo

function apolloPane(pane, icps) {
  pane.innerHTML = `${keyMissing('apollo_api_key', 'Apollo')}
  <div class="card mb"><div class="card-b stack">
    <div class="form-grid k3">
      <label class="field">Start from ICP<select id="from-icp">${icpOptions(icps)}</select></label>
      <label class="field">Job titles<input type="text" name="titles" placeholder="founder, ceo, head of growth"></label>
      <label class="field">Seniority<input type="text" name="seniorities" placeholder="owner, founder, c_suite, vp, director, head"></label>
      <label class="field">Person locations<input type="text" name="locations" placeholder="India, Bengaluru"></label>
      <label class="field">Keywords<input type="text" name="keywords" placeholder="saas, shopify"></label>
      <label class="field">Company domains (optional)<input type="text" name="domains" placeholder="acme.com, globex.io"></label>
      <label class="field">Min employees<input type="number" name="min_employees"></label>
      <label class="field">Max employees<input type="number" name="max_employees"></label>
      <label class="field">Page<input type="number" name="page" value="1" min="1"></label>
    </div>
    <div class="row"><button class="btn primary" id="search">Search Apollo</button><span class="muted small">Search is free. Revealing emails uses Apollo credits (one per person).</span></div>
  </div></div>
  <div id="results"></div><div id="task" class="mt"></div>`;
  pane.querySelector('#from-icp').onchange = (e) => {
    const icp = icps.find((i) => i.id === Number(e.target.value));
    if (!icp) return;
    pane.querySelector('[name=titles]').value = icp.titles.join(', ');
    pane.querySelector('[name=locations]').value = icp.locations.join(', ');
    pane.querySelector('[name=keywords]').value = [...icp.keywords, ...icp.industries].join(', ');
    pane.querySelector('[name=min_employees]').value = icp.min_employees ?? '';
    pane.querySelector('[name=max_employees]').value = icp.max_employees ?? '';
  };
  pane.querySelector('#search').onclick = async (ev) => {
    ev.target.disabled = true;
    try {
      const f = formData(pane.querySelector('.card'));
      const r = await api('/sources/apollo/search', { method: 'POST', body: { ...f, per_page: 50 } });
      const box = pane.querySelector('#results');
      box.innerHTML = `<div class="card"><div class="card-h"><div><b>${n(r.total)}</b> people match · showing page ${r.page}</div>
        <div class="toolbar"><input type="text" id="tags" placeholder="tag, e.g. apollo-founders"><select id="icp">${icpOptions(icps)}</select>
        <button class="btn primary" id="reveal">Reveal emails & import selected</button></div></div>
        <div class="card-b flush table-wrap"><table><thead><tr><th><input type="checkbox" id="all" checked></th><th>Name</th><th>Title</th><th>Company</th><th>Location</th></tr></thead><tbody>
        ${r.people.map((p) => `<tr><td><input type="checkbox" class="pick" value="${esc(p.id)}" checked></td><td>${esc(p.first_name)} ${esc(p.last_name)}</td>
          <td>${esc(p.title || '')}</td><td>${esc(p.company || '')}<div class="sub">${esc(p.company_domain || '')}</div></td><td>${esc([p.city, p.country].filter(Boolean).join(', '))}</td></tr>`).join('')}
        </tbody></table></div></div>`;
      box.querySelector('#all').onchange = (e) => box.querySelectorAll('.pick').forEach((c) => { c.checked = e.target.checked; });
      box.querySelector('#reveal').onclick = async () => {
        const ids = [...box.querySelectorAll('.pick:checked')].map((c) => c.value);
        if (!ids.length) return toast('Select people first', 'error');
        try {
          await runTask(pane.querySelector('#task'), '/sources/apollo/import', { ids, tags: box.querySelector('#tags').value, icp_id: box.querySelector('#icp').value || null });
        } catch (e) { errorToast(e); }
        return null;
      };
    } catch (e) { errorToast(e); }
    ev.target.disabled = false;
  };
}

// ---------------------------------------------------------------- Google Maps

function mapsPane(pane, icps) {
  pane.innerHTML = `${keyMissing('google_places_api_key', 'Google Places')}
  <div class="callout mb small">Best for local / SMB ICPs: clinics, restaurants, agencies, real estate, schools… Google returns up to 60 businesses per search
    (with website + phone). Tick <b>find emails</b> to visit each website and pick up the contact email automatically.
    Tip: run several narrow searches ("dentists in Kukatpally Hyderabad", "dentists in Gachibowli Hyderabad") instead of one broad one.</div>
  <div class="card mb"><div class="card-b form-grid">
    <label class="field full">Search<input type="text" name="query" placeholder="digital marketing agencies in Hyderabad"></label>
    <label class="field">Max results<input type="number" name="max" value="60" min="1" max="60"></label>
    <label class="field">Tag<input type="text" name="tags" placeholder="maps-agencies-hyd"></label>
    <label class="field">Score against ICP<select name="icp_id">${icpOptions(icps)}</select></label>
    <label class="check" style="align-self:end"><input type="checkbox" name="enrich" checked> Find emails on their websites</label>
    <div class="full row"><button class="btn" id="preview">Preview</button><button class="btn primary" id="import">Import</button></div>
  </div></div>
  <div id="results"></div><div id="task" class="mt"></div>`;
  const form = pane.querySelector('.card');
  pane.querySelector('#preview').onclick = async (ev) => {
    ev.target.disabled = true;
    try {
      const f = formData(form);
      const rows = await api('/sources/places/search', { method: 'POST', body: { query: f.query, max: Math.min(20, Number(f.max) || 20) } });
      pane.querySelector('#results').innerHTML = `<div class="card"><div class="card-h"><b>${rows.length} businesses (first page)</b></div>
        <div class="card-b flush table-wrap"><table><thead><tr><th>Business</th><th>Website</th><th>Phone</th><th>City</th><th>Rating</th></tr></thead><tbody>
        ${rows.map((r) => `<tr><td>${esc(r.company)}<div class="sub">${esc(r.industry || '')}</div></td><td>${esc(r.company_domain || '')}</td><td>${esc(r.phone || '')}</td>
          <td>${esc(r.city || '')}</td><td>${esc(r.custom.google_rating || '')} <span class="muted">(${esc(r.custom.google_reviews || 0)})</span></td></tr>`).join('')}</tbody></table></div></div>`;
    } catch (e) { errorToast(e); }
    ev.target.disabled = false;
  };
  pane.querySelector('#import').onclick = async () => {
    try { await runTask(pane.querySelector('#task'), '/sources/places/import', formData(form)); } catch (e) { errorToast(e); }
  };
}

// ---------------------------------------------------------------- Hunter

function hunterPane(pane, icps) {
  pane.innerHTML = `${keyMissing('hunter_api_key', 'Hunter')}
  <div class="callout mb small">Paste company domains (one per line) - for example your target-account list. Hunter returns the people it knows at each
    company with verified emails. Uses one Hunter search credit per domain.</div>
  <div class="card mb"><div class="card-b form-grid">
    <label class="field full">Company domains<textarea name="domains" rows="6" placeholder="acme.com&#10;globex.io"></textarea></label>
    <label class="field">People per domain<input type="number" name="limit" value="5" min="1" max="100"></label>
    <label class="field">Seniority<select name="seniority"><option value="">Any</option><option value="executive">Executive</option><option value="senior,executive">Senior + executive</option></select></label>
    <label class="field">Department<select name="department"><option value="">Any</option><option value="executive">Executive / founders</option><option value="marketing">Marketing</option><option value="sales">Sales</option><option value="it">IT / engineering</option><option value="management">Management</option></select></label>
    <label class="field">Tag<input type="text" name="tags" placeholder="hunter-target-accounts"></label>
    <label class="field">Score against ICP<select name="icp_id">${icpOptions(icps)}</select></label>
    <div class="full"><button class="btn primary" id="go">Find people</button></div>
  </div></div><div id="task"></div>`;
  pane.querySelector('#go').onclick = async () => {
    try { await runTask(pane.querySelector('#task'), '/sources/hunter/domains', formData(pane.querySelector('.card'))); } catch (e) { errorToast(e); }
  };
}
