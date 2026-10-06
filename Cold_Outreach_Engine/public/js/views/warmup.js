import { api, esc, chip, n, pct, bars, meter, ago, toast, errorToast } from '../core.js';

export async function mount(root, params, ctx) {
  ctx.setTitle('Warmup', 'Mailboxes email each other, rescue mail from spam and reply - building sender reputation');
  const actions = ctx.setActions('<button class="btn" id="run-check">Check placement now</button><button class="btn" id="run-send">Send a round now</button>');
  actions.querySelector('#run-check').onclick = (e) => runJob(e.target, 'warmup-check', root);
  actions.querySelector('#run-send').onclick = (e) => runJob(e.target, 'warmup-send', root);
  await draw(root);
}

async function runJob(btn, name, root) {
  btn.disabled = true;
  try {
    const r = await api(`/jobs/${name}/run`, { method: 'POST' });
    toast(r.ran ? 'Done' : 'Already running', 'ok');
    await draw(root);
  } catch (e) { errorToast(e); }
  btn.disabled = false;
}

async function draw(root) {
  const [rows, recent] = await Promise.all([api('/warmup'), api('/warmup/recent')]);
  const senders = rows.filter((r) => r.role === 'sender');
  root.innerHTML = `
  <div class="callout mb small">
    <b>What happens:</b> every few minutes during the warmup window each mailbox sends a natural-looking email to another
    mailbox in the pool (half to seed inboxes when you have them). The receiving mailbox logs in, finds it, moves it out of
    <b>Spam</b> if needed, marks it read/important, files it into a <b>Warmup</b> folder and replies to ~40%. Volume grows
    every day up to the max you set. Inbox placement below = share of warmup emails that arrived in the inbox, not spam.
    ${rows.filter((r) => r.role === 'seed').length ? '' : '<br><b>Tip:</b> all your mailboxes are on Zoho, so warmup between them mostly teaches Zoho. Add a couple of Gmail accounts as <a href="#/mailboxes">seed inboxes</a> so Gmail learns to trust you too.'}
  </div>
  <div class="card mb">
    <div class="card-h"><h2>Mailboxes (last 14 days)</h2></div>
    <div class="card-b flush table-wrap">
      ${senders.length ? `<table><thead><tr><th>Mailbox</th><th>Day</th><th>Today</th><th class="right">Sent</th><th class="right">Inbox</th><th class="right">Spam</th><th class="right">Missing</th><th class="right">Replies</th><th style="min-width:160px">Inbox placement</th></tr></thead><tbody>
      ${senders.map((r) => `<tr class="click" data-id="${r.id}">
        <td><b>${esc(r.email)}</b> ${r.warmup_enabled ? '' : chip('paused', 'Warmup off')} ${r.status === 'error' ? chip('error') : ''}</td>
        <td class="num">${r.day}</td>
        <td class="num">${r.new_today} / ${r.target_today}<div class="sub">${r.replies_today} replies</div></td>
        <td class="right num">${n(r.sent)}</td><td class="right num">${n(r.inbox)}</td>
        <td class="right num">${r.spam ? `<b style="color:var(--bad)">${n(r.spam)}</b>` : 0}</td>
        <td class="right num">${n(r.missing)}</td><td class="right num">${n(r.replies)}</td>
        <td>${meter(r.inbox_rate, { good: 90, warn: 75 })}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty"><h3>No mailboxes yet</h3><a href="#/mailboxes">Connect at least two mailboxes</a> to start warming up.</div>'}
    </div>
  </div>
  <div id="detail"></div>
  <div class="card">
    <div class="card-h"><h2>Recent warmup emails</h2></div>
    <div class="card-b flush table-wrap">
      ${recent.length ? `<table><thead><tr><th>From</th><th>To</th><th>Subject</th><th>Result</th><th>Sent</th></tr></thead><tbody>
      ${recent.map((w) => `<tr><td>${esc(w.from_email)}</td><td>${esc(w.to_email)}</td>
        <td>${w.depth ? '<span class="muted">↩</span> ' : ''}${esc(w.subject)}</td>
        <td>${chip(w.status)}${w.error ? `<div class="sub">${esc(w.error).slice(0, 120)}</div>` : ''}</td>
        <td class="small">${ago(w.sent_at)}</td></tr>`).join('')}
      </tbody></table>` : '<div class="empty small">No warmup emails yet. They are sent inside the warmup window set in Settings.</div>'}
    </div>
  </div>`;

  root.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => detail(root, Number(tr.dataset.id), rows); });
  if (senders[0]) detail(root, senders[0].id, rows);
}

async function detail(root, id, rows) {
  const r = rows.find((x) => x.id === id);
  const daily = await api(`/warmup/${id}/daily`);
  root.querySelector('#detail').innerHTML = `
  <div class="card mb">
    <div class="card-h"><h2>${esc(r.email)}</h2><span class="muted small">Ramp: ${r.warmup_start_volume}/day + ${r.warmup_increment}/day, max ${r.warmup_max_daily} · reply rate ${r.warmup_reply_rate}% · inbox ${pct(r.inbox_rate)}</span></div>
    <div class="card-b">${bars(daily, [
    { key: 'inbox', color: 'var(--good)', label: 'Inbox' },
    { key: 'spam', color: 'var(--bad)', label: 'Spam (rescued)' },
    { key: 'other', color: 'var(--series-3)', label: 'Pending / missing' },
  ])}</div>
  </div>`;
}
