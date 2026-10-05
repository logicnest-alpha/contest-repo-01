import { api, saveSession, esc, toast } from '../core.js';

const DEMO = [
  ['manager', 'manager123', 'Anil Kumar', 'Manager'],
  ['waiter', 'waiter123', 'Ravi Teja', 'Waiter'],
  ['chef', 'chef123', 'Chef Raju', 'Kitchen'],
  ['cashier', 'cashier123', 'Lakshmi Devi', 'Cashier'],
];

export async function render({ root, onLogin }) {
  root.innerHTML = `
    <div class="login-page">
      <div class="card login-card">
        <div class="brand"><div class="brand-mark" style="color:#fff">R</div>
          <div><div class="brand-name">Spice Route</div>
          <div class="brand-sub">Restaurant Order Management System</div></div></div>
        <form id="login-form" class="stack" autocomplete="on">
          <div><label for="u">Username</label><input id="u" type="text" autocomplete="username" required></div>
          <div><label for="p">Password</label><input id="p" type="password" autocomplete="current-password" required></div>
          <button class="btn btn-primary btn-lg btn-block" type="submit">Log in</button>
        </form>
        <p class="small muted" style="margin:18px 0 0">Demo accounts (click to sign in):</p>
        <div class="demo-grid">
          ${DEMO.map(([u, p, n, r]) => `<button class="btn" data-u="${u}" data-p="${p}">
            <span>${esc(n)}<span class="role">${r} · ${u} / ${p}</span></span></button>`).join('')}
        </div>
      </div>
    </div>`;

  const form = root.querySelector('#login-form');
  const submit = async (username, password) => {
    const btn = form.querySelector('button');
    btn.disabled = true;
    try {
      const { token, user } = await api('/auth/login', { method: 'POST', body: { username, password } });
      saveSession(token, user);
      toast(`Welcome, ${user.full_name}`, 'ok');
      onLogin();
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      btn.disabled = false;
    }
  };
  form.onsubmit = (e) => {
    e.preventDefault();
    submit(form.querySelector('#u').value, form.querySelector('#p').value);
  };
  root.querySelectorAll('[data-u]').forEach((b) => {
    b.onclick = () => {
      form.querySelector('#u').value = b.dataset.u;
      form.querySelector('#p').value = b.dataset.p;
      submit(b.dataset.u, b.dataset.p);
    };
  });
}
