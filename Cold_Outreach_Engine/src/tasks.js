// Long-running jobs started from the UI (imports, lead searches, enrichment) with progress.
const db = require('./db');
const { errMessage } = require('./util');

// Start fn(update) in the background; returns the task id immediately.
// fn receives update({ progress, total }) and returns a JSON-able result.
async function start(kind, label, fn) {
  const row = await db.one(`INSERT INTO tasks (kind, label) VALUES ($1, $2) RETURNING id`, [kind, label]);
  const id = row.id;
  let last = 0;
  const update = async ({ progress, total }) => {
    if (Date.now() - last < 1000 && progress !== total) return;
    last = Date.now();
    await db.query('UPDATE tasks SET progress = COALESCE($2, progress), total = COALESCE($3, total) WHERE id = $1', [
      id, progress ?? null, total ?? null,
    ]).catch(() => {});
  };
  setImmediate(async () => {
    try {
      const result = await fn(update);
      await db.query(
        `UPDATE tasks SET status = 'done', result = $2, finished_at = now(), progress = GREATEST(progress, total) WHERE id = $1`,
        [id, JSON.stringify(result ?? null)],
      );
    } catch (err) {
      console.error(`[task ${id} ${kind}]`, err);
      await db.query(`UPDATE tasks SET status = 'failed', error = $2, finished_at = now() WHERE id = $1`, [id, errMessage(err)]);
    }
  });
  return id;
}

module.exports = { start };
