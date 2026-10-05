// Creates the schema, the demo data and the least-privilege application role.
// Usage:  ADMIN_DATABASE_URL=postgres://owner@host/db  APP_DB_PASSWORD=secret  npm run db:init
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

async function main() {
  const url = process.env.ADMIN_DATABASE_URL;
  const appPassword = process.env.APP_DB_PASSWORD;
  if (!url || !appPassword) {
    console.error('Set ADMIN_DATABASE_URL and APP_DB_PASSWORD');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();

  const run = async (file) => {
    const sql = fs.readFileSync(path.join(__dirname, '..', 'db', file), 'utf8');
    process.stdout.write(`running ${file} ... `);
    await client.query(sql);
    console.log('ok');
  };

  await run('01_schema.sql');
  await run('02_logic.sql');
  await run('03_seed.sql');

  const exists = await client.query("SELECT 1 FROM pg_roles WHERE rolname = 'rms_app'");
  const pw = client.escapeLiteral(appPassword);
  await client.query(exists.rowCount
    ? `ALTER ROLE rms_app WITH LOGIN PASSWORD ${pw}`
    : `CREATE ROLE rms_app WITH LOGIN PASSWORD ${pw}`);
  await run('04_grants.sql');
  await run('05_reset_demo.sql');    // optional "Reset demo data" feature

  await client.end();
  console.log('Database ready. The app connects as rms_app.');
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
