import { api, esc, chip, n, modal, formData, dateOnly } from '../core.js';

export async function mount(root, params, ctx) {
  ctx.setTitle('Campaigns', 'Multi-step sequences sent from your warmed-up mailboxes');
  ctx.setActions('<button class="btn primary" id="new">New campaign</button>').querySelector('#new').onclick = () => {
    modal({
      title: 'New campaign',
      body: '<label class="field">Name<input type="text" name="name" placeholder="D2C founders - India - Oct"></label>',
      okText: 'Create',
      onOk: async (el) => {
        const c = await api('/campaigns', { method: 'POST', body: formData(el) });
        location.hash = `#/campaigns/${c.id}`;
      },
    });
  };
  const list = await api('/campaigns');
  root.innerHTML = list.length ? `
  <div class="card"><div class="card-b flush table-wrap"><table>
    <thead><tr><th>Campaign</th><th>Status</th><th class="right">Leads</th><th class="right">Active</th><th class="right">Sent</th><th class="right">Replies</th><th class="right">Reply rate</th><th class="right">Interested</th><th class="right">Bounced</th></tr></thead>
    <tbody>${list.map((c) => {
    const s = c.stats;
    const rate = s.contacted ? Math.round((1000 * s.replies) / s.contacted) / 10 : null;
    return `<tr class="click" data-id="${c.id}">
      <td><b>${esc(c.name)}</b><div class="sub">created ${dateOnly(c.created_at)} · ${n(s.contacted)} contacted</div></td>
      <td>${chip(c.status)}</td>
      <td class="right num">${n(s.leads)}</td><td class="right num">${n(s.active)}</td><td class="right num">${n(s.sent)}</td>
      <td class="right num">${n(s.replies)}</td><td class="right num">${rate === null ? '–' : `${rate}%`}</td>
      <td class="right num">${n(s.interested)}</td><td class="right num">${n(s.bounced)}</td></tr>`;
  }).join('')}</tbody></table></div></div>` : `
  <div class="card empty"><h3>No campaigns yet</h3>
    A campaign = the mailboxes to send from + a sequence of 2-4 short emails + the leads to send them to.<br>
    Replies stop the sequence automatically and land in the unified inbox.</div>`;
  root.querySelectorAll('tr[data-id]').forEach((tr) => { tr.onclick = () => { location.hash = `#/campaigns/${tr.dataset.id}`; }; });
}
