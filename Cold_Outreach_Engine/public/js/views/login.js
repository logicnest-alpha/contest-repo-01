import { api, state, esc, loadMeta } from '../core.js';

export async function mount(root) {
  root.innerHTML = `
  <div class="login-wrap">
    <form class="login-card" id="login-form">
      <div class="brand" style="padding:0;color:inherit"><div class="brand-mark" style="color:#fff">CO</div>
        <div><div class="brand-name">Cold Outreach Engine</div><div class="muted small">Sign in to your workspace</div></div></div>
      <label class="field">Email<input type="email" name="email" autocomplete="username" required></label>
      <label class="field">Password<input type="password" name="password" autocomplete="current-password" required></label>
      <div id="login-error" class="callout bad hidden"></div>
      <button class="btn primary" type="submit">Sign in</button>
      <div class="muted small">The owner login comes from ADMIN_EMAIL / ADMIN_PASSWORD on the server.</div>
    </form>
  </div>`;
  const form = root.querySelector('#login-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = root.querySelector('#login-error');
    err.classList.add('hidden');
    try {
      const r = await api('/auth/login', { method: 'POST', body: { email: form.email.value, password: form.password.value } });
      state.user = r.email;
      await loadMeta();
      location.hash = '#/dashboard';
    } catch (ex) {
      err.innerHTML = esc(ex.message);
      err.classList.remove('hidden');
    }
  });
}
