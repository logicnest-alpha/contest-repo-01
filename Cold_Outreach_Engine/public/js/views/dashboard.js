import { api, esc, n, pct, ago, chip, bars, meter, scoreClass } from '../core.js';

let timer;

export async function mount(root, params, ctx) {
  ctx.setTitle('Dashboard', 'Sending, replies and deliverability at a glance');
  ctx.setActions('<a class="btn" href="#/inbox">Open inbox</a><a class="btn primary" href="#/campaigns">Campaigns</a>');
  await draw(root);
  timer = setInterval(() => draw(root).catch(() => {}), 60000);
}

export function unmount() {
  clearInterval(timer);
}

async function draw(root) {
  const d = await api('/dashboard');
  const r = d.rates;
  const setup = [];
  if (!d.mailboxes.length) setup.push('<a href="#/mailboxes">Connect your Zoho mailboxes</a> (Domains & mailboxes) - warmup starts automatically.');
  if (d.mailboxes.length && d.mailboxes.filter((m) => m.role === 'sender').length < 2) setup.push('Connect at least 2 mailboxes so they can warm each other up. Adding a free Gmail account as a <b>seed</b> makes warmup much more effective.');
  if (!d.totals.leads) setup.push('<a href="#/finder">Find leads</a> or <a href="#/leads">import a CSV</a>.');
  if (!d.totals.active_campaigns && d.totals.leads) setup.push('<a href="#/campaigns">Create a campaign</a> once your mailboxes have warmed up for ~2 weeks.');
  if (!d.scheduler.leader) setup.push('Background engines are not running in this process (ENGINES=off or another instance is the leader).');

  root.innerHTML = `
  ${setup.length ? `<div class="callout info mb"><b>Next steps</b><ul>${setup.map((s) => `<li>${s}</li>`).join('')}</ul></div>` : ''}
  <div class="grid k4">
    ${kpi('Sent today', n(d.today.sent), `${n(d.today.warmup)} warmup emails today`)}
    ${kpi('Replies (7 days)', n(d.week.replies), `Reply rate ${pct(r.reply_rate)}`)}
    ${kpi('Interested (7 days)', n(d.week.interested), `${n(d.totals.pipeline)} in pipeline`)}
    ${kpi('Inbox placement', pct(r.inbox_rate), `Bounce rate ${pct(r.bounce_rate)} (7 days)`, scoreClass(r.inbox_rate, 90, 75))}
  </div>
  <div class="grid main-side mt">
    <div class="card">
      <div class="card-h"><h2>Last 14 days</h2><span class="muted small">${n(d.week.sent)} campaign emails in 7 days</span></div>
      <div class="card-b">${bars(d.series, [
    { key: 'sent', color: 'var(--series-1)', label: 'Campaign emails' },
    { key: 'replies', color: 'var(--series-2)', label: 'Replies' },
    { key: 'warmup', color: 'var(--series-3)', label: 'Warmup' },
  ])}</div>
    </div>
    <div class="card">
      <div class="card-h"><h2>Pipeline</h2></div>
      <div class="card-b stack">
        ${line('Leads', n(d.totals.leads), '#/leads')}
        ${line('Verified emails', n(d.totals.verified), '#/leads')}
        ${line('Active campaigns', n(d.totals.active_campaigns), '#/campaigns')}
        ${line('Unread replies', n(d.totals.unread), '#/inbox')}
        ${line('Interested / meeting', n(d.totals.pipeline), '#/leads')}
      </div>
    </div>
  </div>
  <div class="grid main-side mt">
    <div class="card">
      <div class="card-h"><h2>Mailbox health</h2><a class="small" href="#/mailboxes">Manage</a></div>
      <div class="card-b flush table-wrap">
        ${d.mailboxes.length ? `<table><thead><tr><th>Mailbox</th><th>Status</th><th>Health</th><th>Inbox placement</th><th class="right">Bounce</th><th class="right">Sent 7d</th></tr></thead><tbody>
        ${d.mailboxes.map((m) => `<tr>
          <td>${esc(m.email)} ${m.role === 'seed' ? chip('seed') : ''}</td>
          <td>${chip(m.status)}</td>
          <td><span class="score ${scoreClass(m.health)}">${m.health}</span></td>
          <td style="min-width:140px">${meter(m.inbox_rate, { good: 90, warn: 75 })}</td>
          <td class="right num">${pct(m.bounce_rate)}</td>
          <td class="right num">${n(m.sent_7d)}</td></tr>`).join('')}
        </tbody></table>` : '<div class="empty">No mailboxes yet.</div>'}
      </div>
    </div>
    <div class="card">
      <div class="card-h"><h2>Activity</h2></div>
      <div class="card-b stack" style="max-height:420px;overflow-y:auto">
        ${d.events.length ? d.events.map((e) => `<div class="small"><span class="chip ${e.level === 'error' ? 'bad' : e.level === 'warn' ? 'warn' : ''}">${esc(e.kind)}</span>
          ${esc(e.message)} <span class="muted">· ${ago(e.ts)}</span></div>`).join('') : '<div class="muted small">Nothing yet.</div>'}
      </div>
    </div>
  </div>`;
}

function kpi(labelText, value, hint, cls = '') {
  return `<div class="card kpi"><div class="label">${esc(labelText)}</div><div class="value ${cls ? `score ${cls}` : ''}">${value}</div><div class="hint">${esc(hint)}</div></div>`;
}

function line(text, value, href) {
  return `<a class="row between" href="${href}" style="text-decoration:none;color:inherit"><span class="muted">${esc(text)}</span><b class="num">${value}</b></a>`;
}
