// Background job loop. Only one process (the one holding the Postgres advisory lock) runs it.
const db = require('../db');
const sender = require('./sender');
const warmup = require('./warmup');
const sync = require('./sync');
const health = require('./health');

const JOBS = [
  { name: 'campaigns', every: 60 * 1000, fn: sender.tick },
  { name: 'warmup-send', every: 60 * 1000, fn: warmup.sendTick },
  { name: 'warmup-check', every: 3 * 60 * 1000, fn: warmup.checkTick },
  { name: 'inbox-sync', every: 4 * 60 * 1000, fn: sync.syncAll },
  { name: 'health', every: 15 * 60 * 1000, fn: health.run },
  { name: 'dns', every: 60 * 60 * 1000, fn: health.dnsAll },
  { name: 'cleanup', every: 24 * 60 * 60 * 1000, fn: health.cleanup },
];

const state = { leader: false, lockClient: null, jobs: {} };
let stopped = false;

function schedule(job, delay) {
  setTimeout(async () => {
    if (stopped) return;
    const js = state.jobs[job.name];
    js.running = true;
    const started = Date.now();
    try {
      await job.fn();
      js.lastError = null;
    } catch (err) {
      js.lastError = err.message;
      console.error(`[job ${job.name}]`, err);
    } finally {
      js.running = false;
      js.lastRun = new Date().toISOString();
      js.lastMs = Date.now() - started;
      schedule(job, job.every);
    }
  }, delay).unref();
}

async function becomeLeader() {
  if (stopped) return;
  try {
    const client = await db.tryLeaderLock();
    if (client) {
      state.leader = true;
      state.lockClient = client;
      client.on('error', () => {
        // Lost the lock connection: stop and try again.
        console.error('[scheduler] lost the leader connection, restarting engines');
        process.exit(1);
      });
      console.log('[scheduler] background engines started');
      JOBS.forEach((job, i) => {
        state.jobs[job.name] = { running: false, lastRun: null, lastError: null, every: job.every };
        schedule(job, 5000 + i * 3000);
      });
      return;
    }
  } catch (err) {
    console.error('[scheduler] lock error:', err.message);
  }
  console.log('[scheduler] another instance runs the engines; retrying in 60s');
  setTimeout(becomeLeader, 60000).unref();
}

function start() {
  becomeLeader();
}

function stop() {
  stopped = true;
  if (state.lockClient) state.lockClient.release();
}

// Run a job immediately (from the UI), unless it is already running.
async function runNow(name) {
  const job = JOBS.find((j) => j.name === name);
  if (!job) throw new Error('Unknown job');
  const js = state.jobs[name];
  if (js && js.running) return false;
  if (js) js.running = true;
  try {
    await job.fn();
  } finally {
    if (js) {
      js.running = false;
      js.lastRun = new Date().toISOString();
    }
  }
  return true;
}

function status() {
  return { leader: state.leader, jobs: state.jobs };
}

module.exports = { start, stop, runNow, status };
