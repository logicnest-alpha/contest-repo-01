import { api, state, esc, chip, modal, toast, errorToast, formData, confirmBox, ago, pct, scoreClass, loadMeta } from '../core.js';

export async function mount(root, params, ctx) {
  ctx.setTitle('Domains & mailboxes', 'Connect Zoho mailboxes, check SPF / DKIM / DMARC, set sending limits');
  const actions = ctx.setActions('<button class="btn" id="add-domain">Add domain</button><button class="btn primary" id="add-mb">Connect mailbox</button>');
  actions.querySelector('#add-mb').onclick = () => mailboxForm(null, () => draw(root));
  actions.querySelector('#add-domain').onclick = () => domainForm(() => draw(root));
  await draw(root);
}

async function draw(root) {
  const [domains, mailboxes] = await Promise.all([api('/domains'), api('/mailboxes')]);
  const senders = mailboxes.filter((m) => m.role === 'sender');
  const seeds = mailboxes.filter((m) => m.role === 'seed');
  root.innerHTML = `
  <div class="callout info mb">
    <b>How this works:</b> each Zoho mailbox is connected over SMTP (sending) + IMAP (reading). In Zoho turn on
    <i>Settings › Mail Accounts › IMAP Access</i> (paid plans - the free plan has no IMAP) and, if you use 2-factor login,
    create an <i>application-specific password</i> to paste here. Warmup starts as soon as two mailboxes are connected.
  </div>
  <div class="card mb">
    <div class="card-h"><h2>Domains</h2><span class="muted small">Re-checked automatically every 12 hours</span></div>
    <div class="card-b ${domains.length ? 'stack' : ''}">
      ${domains.length ? domains.map(domainCard).join('') : '<div class="empty">Domains are added automatically when you connect a mailbox.</div>'}
    </div>
  </div>
  <div class="card mb">
    <div class="card-h"><h2>Sending mailboxes</h2><span class="muted small">${senders.length} connected</span></div>
    <div class="card-b flush table-wrap">${senders.length ? mailboxTable(senders) : '<div class="empty"><h3>No mailboxes yet</h3>Click <b>Connect mailbox</b> to add your first Zoho inbox.</div>'}</div>
  </div>
  <div class="card">
    <div class="card-h"><h2>Seed inboxes (warmup partners)</h2><span class="muted small">Gmail / other accounts you own. They only receive warmup mail, rescue it from spam and reply - never used for campaigns.</span></div>
    <div class="card-b flush table-wrap">${seeds.length ? mailboxTable(seeds) : '<div class="empty small">Optional but recommended: add 1-3 free Gmail accounts (with an app password) as seeds so warmup also builds reputation with Gmail, where most of your prospects are.</div>'}</div>
  </div>`;

  root.querySelectorAll('[data-check]').forEach((b) => { b.onclick = async () => {
    b.disabled = true;
    try { await api(`/domains/${b.dataset.check}/check`, { method: 'POST' }); await draw(root); } catch (e) { errorToast(e); b.disabled = false; }
  }; });
  root.querySelectorAll('[data-selector]').forEach((b) => { b.onclick = () => selectorForm(b.dataset.selector, b.dataset.value, () => draw(root)); });
  root.querySelectorAll('[data-del-domain]').forEach((b) => { b.onclick = async () => {
    if (!(await confirmBox('Remove this domain?'))) return;
    try { await api(`/domains/${b.dataset.delDomain}`, { method: 'DELETE' }); draw(root); } catch (e) { errorToast(e); }
  }; });
  root.querySelectorAll('[data-edit]').forEach((b) => { b.onclick = () => mailboxForm(mailboxes.find((m) => m.id === Number(b.dataset.edit)), () => draw(root)); });
  root.querySelectorAll('[data-test]').forEach((b) => { b.onclick = async () => {
    b.disabled = true; b.textContent = 'Testing…';
    try {
      const r = await api(`/mailboxes/${b.dataset.test}/test`, { method: 'POST' });
      if (r.ok) toast(`Connection OK${r.reactivated ? ' - mailbox reactivated' : ''}`, 'ok');
      else toast(`SMTP: ${r.smtp.ok ? 'OK' : r.smtp.error} | IMAP: ${r.imap.ok ? 'OK' : r.imap.error}`, 'error');
      draw(root);
    } catch (e) { errorToast(e); b.disabled = false; }
  }; });
  root.querySelectorAll('[data-status]').forEach((b) => { b.onclick = async () => {
    try { await api(`/mailboxes/${b.dataset.id}/status`, { method: 'POST', body: { status: b.dataset.status } }); draw(root); } catch (e) { errorToast(e); }
  }; });
  root.querySelectorAll('[data-sync]').forEach((b) => { b.onclick = async () => {
    b.disabled = true;
    try { const r = await api(`/mailboxes/${b.dataset.sync}/sync`, { method: 'POST' }); toast(`Synced - ${r.fetched} new message(s)`, 'ok'); draw(root); } catch (e) { errorToast(e); b.disabled = false; }
  }; });
  root.querySelectorAll('[data-del]').forEach((b) => { b.onclick = async () => {
    if (!(await confirmBox('Disconnect this mailbox? Its sent/received history in this app is deleted too (nothing is deleted in Zoho).'))) return;
    try { await api(`/mailboxes/${b.dataset.del}`, { method: 'DELETE' }); draw(root); } catch (e) { errorToast(e); }
  }; });
}

function checkRow(name, c) {
  if (!c) return '';
  return `<div class="check-row"><span class="ico ${c.ok ? 'ok' : 'no'}">${c.ok ? '✓' : '✕'}</span><b>${name}</b>
    <div>${esc(c.message || '')}${c.record ? `<div class="muted small mono" style="word-break:break-all">${esc(c.record)}</div>` : ''}
    ${c.fix ? `<div class="fix">${esc(c.fix)}</div>` : ''}</div></div>`;
}

function domainCard(d) {
  const r = d.dns_report;
  const bl = r && r.blocklists ? r.blocklists.map((b) => `${esc(b.list)}: ${b.listed === true ? '<b style="color:var(--bad)">LISTED</b>' : b.listed === false ? 'clean' : '<span class="muted">n/a</span>'}`).join(' · ') : '';
  return `<div class="card" style="box-shadow:none">
    <div class="card-h"><div class="row"><h3>${esc(d.name)}</h3>${r ? `<span class="score ${scoreClass(r.score, 100, 70)}">${r.score}/100</span>` : chip('unknown', 'Not checked')}
      <span class="muted small">${d.mailboxes} mailbox(es) · checked ${ago(d.dns_checked_at)}</span></div>
      <div class="row"><button class="btn small" data-selector="${d.id}" data-value="${esc(d.dkim_selector)}">DKIM selector: ${esc(d.dkim_selector)}</button>
      <button class="btn small" data-check="${d.id}">Re-check DNS</button>
      ${d.mailboxes ? '' : `<button class="btn small danger" data-del-domain="${d.id}">Remove</button>`}</div></div>
    ${r ? `<div class="card-b checks">${checkRow('MX', r.mx)}${checkRow('SPF', r.spf)}${checkRow('DKIM', r.dkim)}${checkRow('DMARC', r.dmarc)}
      <div class="check-row"><span class="ico ${r.listed ? 'no' : 'ok'}">${r.listed ? '✕' : '✓'}</span><b>Blocklists</b><div class="small">${bl}</div></div></div>` : ''}
  </div>`;
}

function mailboxTable(list) {
  return `<table><thead><tr><th>Mailbox</th><th>Status</th><th>Warmup</th><th>Health</th><th>Today</th><th>Last sync</th><th></th></tr></thead><tbody>
  ${list.map((m) => {
    const met = m.metrics || {};
    return `<tr>
      <td><b>${esc(m.email)}</b><div class="sub">${esc(m.from_name)} · ${esc(m.smtp_host)}</div></td>
      <td>${chip(m.status)}${m.status_reason ? `<div class="sub" style="max-width:260px">${esc(m.status_reason)}</div>` : ''}
          ${m.not_ready && m.status === 'active' ? `<div class="sub">${esc(m.not_ready)}</div>` : ''}</td>
      <td>${m.warmup_enabled ? `Day ${m.warmup_day}<div class="sub">${m.warmup_target_today}/day target</div>` : chip('paused', 'Off')}</td>
      <td>${met.health !== undefined ? `<span class="score ${scoreClass(met.health)}">${met.health}</span><div class="sub">inbox ${pct(met.inbox_rate)} · bounce ${pct(met.bounce_rate)}</div>` : '–'}</td>
      <td>${m.role === 'sender' ? `limit ${m.campaign_limit_today}/day<div class="sub">gap ≥ ${m.min_gap_minutes} min</div>` : '–'}</td>
      <td class="small">${ago(m.last_synced_at)}${m.last_error ? `<div class="sub ellipsis" title="${esc(m.last_error)}" style="max-width:200px">⚠ ${esc(m.last_error).slice(0, 80)}</div>` : ''}</td>
      <td class="right nowrap">
        <button class="btn small" data-test="${m.id}">Test</button>
        ${m.role === 'sender' ? `<button class="btn small" data-sync="${m.id}">Sync</button>` : ''}
        ${m.status === 'active' ? `<button class="btn small" data-status="paused" data-id="${m.id}">Pause</button>` : `<button class="btn small" data-status="active" data-id="${m.id}">Resume</button>`}
        <button class="btn small" data-edit="${m.id}">Edit</button>
        <button class="btn small danger" data-del="${m.id}">×</button>
      </td></tr>`;
  }).join('')}</tbody></table>`;
}

function domainForm(done) {
  modal({
    title: 'Add a domain',
    body: `<div class="stack"><label class="field">Domain<input type="text" name="name" placeholder="mail.yourbrand.com"></label>
      <label class="field">DKIM selector<input type="text" name="dkim_selector" value="zmail"><span class="hint">The selector name you chose in Zoho Admin › Domains › DKIM.</span></label></div>`,
    okText: 'Add & check DNS',
    onOk: async (el) => { await api('/domains', { method: 'POST', body: formData(el) }); done(); },
  });
}

function selectorForm(id, value, done) {
  modal({
    title: 'DKIM selector',
    body: `<label class="field">Selector<input type="text" name="dkim_selector" value="${esc(value)}"><span class="hint">Zoho Admin Console › Domains › your domain › Email Configuration › DKIM shows it (e.g. "zmail").</span></label>`,
    onOk: async (el) => {
      await api(`/domains/${id}`, { method: 'PATCH', body: formData(el) });
      await api(`/domains/${id}/check`, { method: 'POST' });
      done();
    },
  });
}

function mailboxForm(mb, done) {
  const providers = state.meta.providers;
  const isNew = !mb;
  const v = mb || {
    provider: 'zoho-in', role: 'sender', warmup_enabled: true, warmup_start_volume: 3, warmup_increment: 2, warmup_max_daily: 35,
    warmup_reply_rate: 40, daily_campaign_limit: 30, campaign_ramp: true, min_gap_minutes: 8, smtp_port: 465, imap_port: 993, smtp_secure: true,
  };
  const body = `
  <div class="stack">
    <div class="form-grid">
      <label class="field">Type<select name="role">
        <option value="sender" ${v.role === 'sender' ? 'selected' : ''}>Sending mailbox (Zoho)</option>
        <option value="seed" ${v.role === 'seed' ? 'selected' : ''}>Seed inbox (warmup partner only)</option></select></label>
      <label class="field">Provider / region<select name="provider" id="provider">
        ${providers.map((p) => `<option value="${p.id}" ${p.id === v.provider ? 'selected' : ''}>${esc(p.label)}</option>`).join('')}</select>
        <span class="hint">The Zoho region is the site you log in at (zoho.in, zoho.com …).</span></label>
      <label class="field">Email address<input type="email" name="email" value="${esc(v.email || '')}" ${isNew ? '' : 'disabled'} placeholder="vishal@mail.yourbrand.com"></label>
      <label class="field">Sender name<input type="text" name="from_name" value="${esc(v.from_name || '')}" placeholder="Vishal Chepyala"></label>
      <label class="field">Password / app password<input type="password" name="password" autocomplete="new-password" placeholder="${isNew ? '' : 'leave empty to keep the current one'}"></label>
      <label class="field">Login username <span class="hint">Usually the email address</span><input type="text" name="username" value="${esc(v.username || '')}"></label>
    </div>
    <details ${v.provider === 'custom' ? 'open' : ''} id="servers"><summary class="small">Server settings</summary>
      <div class="form-grid mt">
        <label class="field">SMTP host<input type="text" name="smtp_host" value="${esc(v.smtp_host || '')}"></label>
        <label class="field">SMTP port<input type="number" name="smtp_port" value="${v.smtp_port}"></label>
        <label class="field">IMAP host<input type="text" name="imap_host" value="${esc(v.imap_host || '')}"></label>
        <label class="field">IMAP port<input type="number" name="imap_port" value="${v.imap_port}"></label>
        <label class="check"><input type="checkbox" name="smtp_secure" ${v.smtp_secure ? 'checked' : ''}> SMTP uses SSL (port 465). Untick for STARTTLS (587).</label>
      </div></details>
    <label class="field">Signature (plain text)<textarea name="signature" rows="3" placeholder="Vishal Chepyala&#10;Founder, YourBrand">${esc(v.signature || '')}</textarea></label>
    <h3>Warmup</h3>
    <div class="form-grid k3">
      <label class="check full"><input type="checkbox" name="warmup_enabled" ${v.warmup_enabled ? 'checked' : ''}> Warmup on (keep it on, even while running campaigns)</label>
      <label class="field">Start with (emails/day)<input type="number" name="warmup_start_volume" value="${v.warmup_start_volume}" min="1" max="50"></label>
      <label class="field">Increase per day<input type="number" name="warmup_increment" value="${v.warmup_increment}" min="0" max="20"></label>
      <label class="field">Max warmup / day<input type="number" name="warmup_max_daily" value="${v.warmup_max_daily}" min="1" max="150"></label>
      <label class="field">Reply rate %<input type="number" name="warmup_reply_rate" value="${v.warmup_reply_rate}" min="0" max="100"></label>
      ${isNew ? '' : `<label class="field">Warmup started on<input type="date" name="warmup_started_on" value="${String(v.warmup_started_on || '').slice(0, 10)}"><span class="hint">Set earlier if this mailbox was already warmed elsewhere.</span></label>`}
    </div>
    <h3>Campaign sending</h3>
    <div class="form-grid k3">
      <label class="field">Max cold emails / day<input type="number" name="daily_campaign_limit" value="${v.daily_campaign_limit}" min="0" max="500"><span class="hint">25-40 per mailbox is the safe zone.</span></label>
      <label class="field">Min minutes between emails<input type="number" name="min_gap_minutes" value="${v.min_gap_minutes}" min="1" max="240"><span class="hint">A random 75-165% of this is used.</span></label>
      <label class="check"><input type="checkbox" name="campaign_ramp" ${v.campaign_ramp ? 'checked' : ''}> Ramp up slowly (5/day, +3 each day)</label>
    </div>
    ${isNew ? '<label class="check"><input type="checkbox" name="skip_test"> Save without testing the connection</label>' : ''}
  </div>`;
  const m = modal({
    title: isNew ? 'Connect a mailbox' : `Edit ${mb.email}`,
    body,
    wide: true,
    okText: isNew ? 'Test & connect' : 'Save',
    onOk: async (el) => {
      const data = formData(el);
      if (!isNew) delete data.email;
      try {
        if (isNew) await api('/mailboxes', { method: 'POST', body: data });
        else await api(`/mailboxes/${mb.id}`, { method: 'PATCH', body: data });
      } catch (e) {
        const t = e.data && e.data.test;
        if (t) throw new Error(`SMTP: ${t.smtp.ok ? 'OK' : t.smtp.error} | IMAP: ${t.imap.ok ? 'OK' : t.imap.error}`);
        throw e;
      }
      toast(isNew ? 'Mailbox connected - warmup will start automatically' : 'Saved', 'ok');
      await loadMeta();
      done();
    },
  });
  const sel = m.el.querySelector('#provider');
  const apply = () => {
    const p = providers.find((x) => x.id === sel.value);
    if (!p || p.id === 'custom') { m.el.querySelector('#servers').open = true; return; }
    m.el.querySelector('[name=smtp_host]').value = p.smtp_host;
    m.el.querySelector('[name=smtp_port]').value = p.smtp_port;
    m.el.querySelector('[name=imap_host]').value = p.imap_host;
    m.el.querySelector('[name=imap_port]').value = p.imap_port;
    m.el.querySelector('[name=smtp_secure]').checked = p.smtp_secure;
  };
  sel.addEventListener('change', apply);
  if (isNew) apply();
}
