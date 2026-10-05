// Read-only smoke test: logs in as every role and calls the main endpoints.
// Usage:  node scripts/smoke-test.js http://localhost:3000
// The server also runs it against itself after start-up when SMOKE_TEST=true.

const ACCOUNTS = [
  ['manager', 'manager123', ['/tables', '/menu', '/kitchen', '/orders?scope=open', '/inventory', '/reports/summary?days=7']],
  ['waiter', 'waiter123', ['/tables', '/menu', '/orders?scope=today']],
  ['chef', 'chef123', ['/kitchen', '/inventory']],
  ['cashier', 'cashier123', ['/orders?scope=billing']],
];

async function smokeTest(base) {
  const results = [];
  const call = async (path, opts = {}) => {
    const res = await fetch(`${base}/api${path}`, opts);
    const body = await res.json().catch(() => null);
    return { status: res.status, body };
  };

  const health = await call('/health');
  results.push(['GET /health', health.status === 200]);

  for (const [user, pass, paths] of ACCOUNTS) {
    const login = await call('/auth/login', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: user, password: pass }),
    });
    results.push([`login ${user}`, login.status === 200]);
    if (login.status !== 200) continue;
    const auth = { headers: { authorization: `Bearer ${login.body.token}` } };
    for (const path of paths) {
      const r = await call(path, auth);
      const size = Array.isArray(r.body) ? `${r.body.length} rows`
        : r.body && r.body.items ? `${r.body.items.length} dishes`
          : r.body && r.body.kpi ? `${r.body.kpi.orders} orders, revenue ${r.body.kpi.revenue}` : '';
      results.push([`${user} GET ${path} ${size}`.trim(), r.status === 200]);
    }
  }
  // role check must refuse a cashier on the manager-only report
  const login = await call('/auth/login', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ username: 'cashier', password: 'cashier123' }),
  });
  const denied = await call('/reports/summary', { headers: { authorization: `Bearer ${login.body.token}` } });
  results.push(['cashier refused on /reports (403)', denied.status === 403]);

  const failed = results.filter(([, ok]) => !ok).length;
  results.forEach(([name, ok]) => console.log(`[smoke] ${ok ? 'PASS' : 'FAIL'}  ${name}`));
  console.log(`[smoke] ${results.length - failed}/${results.length} checks passed`);
  return failed === 0;
}

module.exports = { smokeTest };

if (require.main === module) {
  smokeTest(process.argv[2] || 'http://localhost:3000')
    .then((ok) => process.exit(ok ? 0 : 1))
    .catch((err) => { console.error(err); process.exit(1); });
}
