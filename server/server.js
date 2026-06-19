import { createApp } from './src/app.js';
import { config } from './src/config/index.js';
import { processDue } from './src/services/drip.service.js';
import { processJobs } from './src/services/job.service.js';
import { pool } from './src/db/pool.js';

const isCron = process.argv.includes('--cron');

if (isCron) {
  console.log('[cron] Starting drip & job processing...');
  Promise.all([
    processDue(config.dripBatchSize),
    processJobs(50)
  ]).then(([drip, jobs]) => {
    console.log(`[cron] Done — drip: processed=${drip.processed} errors=${drip.errors} skipped=${drip.skipped} | jobs: processed=${jobs.processed} errors=${jobs.errors}`);
    process.exit(0);
  }).catch((err) => {
    console.error('[cron] Error:', err);
    process.exit(1);
  });
} else {
  const app = createApp();
  app.listen(config.port, '0.0.0.0', async () => {
    // Check DB connection
    let dbStatus = '✓ Connected';
    try {
      await pool.query('SELECT 1');
    } catch (e) {
      dbStatus = `✗ ERROR: ${e.message}`;
    }

    const lines = [
      '',
      '╔══════════════════════════════════════════════╗',
      '║         Dot Domino CRM — Server Ready        ║',
      '╠══════════════════════════════════════════════╣',
      `║  Backend   →  http://localhost:${config.port}         ║`,
      `║  Frontend  →  http://localhost:5173           ║`,
      `║  MySQL     →  ${config.db?.host || '127.0.0.1'}:${config.db?.port || 3306}              ${dbStatus.startsWith('✓') ? '    ║' : '║'}`,
      `║  DB Status →  ${dbStatus.padEnd(30)}║`,
      `║  Mode      →  ${config.env.padEnd(30)}║`,
      `║  Delivery  →  ${config.deliveryMode.padEnd(30)}║`,
      '╠══════════════════════════════════════════════╣',
      '║  Drip Scheduler → runs every 1 min auto     ║',
      '╚══════════════════════════════════════════════╝',
      '',
    ];
    console.log(lines.join('\n'));
    startDripScheduler();
  });
}

function startDripScheduler() {
  const INTERVAL_MS = 60 * 1000; // every 1 minute
  let running = false;

  const tick = async () => {
    if (running) return; // skip if previous run still going
    running = true;
    try {
      const [drip, jobs] = await Promise.all([
        processDue(config.dripBatchSize),
        processJobs(50)
      ]);
      if (drip.processed > 0 || drip.errors > 0) {
        console.log(`[drip] processed=${drip.processed} errors=${drip.errors} skipped=${drip.skipped}`);
      }
    } catch (err) {
      console.error('[drip] scheduler error:', err.message);
    } finally {
      running = false;
    }
  };

  setInterval(tick, INTERVAL_MS);
  console.log('[drip] Scheduler started — runs every 1 minute automatically');
}
