import { createApp } from './src/app.js';
import { config } from './src/config/index.js';
import { processDue } from './src/services/drip.service.js';
import { processJobs } from './src/services/job.service.js';
import { processDueReportSchedules } from './src/services/customReport.service.js';
import { processDueBroadcasts } from './src/services/broadcast.service.js';
import { pollEmailReplies } from './src/services/emailInbox.service.js';
import { pollAllSalesforceCompanies } from './src/services/salesforce.service.js';
import { pollAllLinkedinCompanies } from './src/services/linkedin.service.js';
import { pool } from './src/db/pool.js';
import { runAutoMigrations } from './src/db/autoMigrate.js';

const isCron = process.argv.includes('--cron');

if (isCron) {
  console.log('[cron] Starting drip & job processing...');
  Promise.all([
    processDue(config.dripBatchSize),
    processJobs(50),
    processDueReportSchedules(),
    processDueBroadcasts(),
    pollEmailReplies(),
    pollAllSalesforceCompanies(),
    pollAllLinkedinCompanies()
  ]).then(([drip, jobs, reports, broadcasts, inbox, salesforce, linkedin]) => {
    console.log(`[cron] Done — drip: processed=${drip.processed} errors=${drip.errors} skipped=${drip.skipped} | jobs: processed=${jobs.processed} errors=${jobs.errors} | reports: sent=${reports.sent} failed=${reports.failed} | broadcasts: sent=${broadcasts.sent} failed=${broadcasts.failed} | inbox: processed=${inbox.processed} recorded=${inbox.recorded} errors=${inbox.errors} | salesforce: processed=${salesforce.processed} imported=${salesforce.imported} errors=${salesforce.errors} | linkedin: processed=${linkedin.processed} imported=${linkedin.imported} errors=${linkedin.errors}`);
    process.exit(0);
  }).catch((err) => {
    console.error('[cron] Error:', err);
    process.exit(1);
  });
} else {
  const app = createApp();
  await runAutoMigrations();
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
      `║  App URL   →  ${config.appUrl.padEnd(30)}║`,
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
    if (config.env === 'production' && config.appUrl.includes('localhost')) {
      console.warn(
        '⚠️  APP_URL is still set to localhost in production. ' +
        'Invite/reset-password emails will contain broken links. ' +
        'Set APP_URL in server/.env to your live domain (e.g. https://panel.thepitchpoint.com) and restart.'
      );
    }
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
      const [drip, jobs, reports, broadcasts, inbox, salesforce, linkedin] = await Promise.all([
        processDue(config.dripBatchSize),
        processJobs(50),
        processDueReportSchedules(),
        processDueBroadcasts(),
        pollEmailReplies(),
        pollAllSalesforceCompanies(),
        pollAllLinkedinCompanies()
      ]);
      if (drip.processed > 0 || drip.errors > 0) {
        console.log(`[drip] processed=${drip.processed} errors=${drip.errors} skipped=${drip.skipped}`);
      }
      if (reports.sent > 0 || reports.failed > 0) {
        console.log(`[report-schedule] sent=${reports.sent} failed=${reports.failed}`);
      }
      if (broadcasts.sent > 0 || broadcasts.failed > 0) {
        console.log(`[broadcast] sent=${broadcasts.sent} failed=${broadcasts.failed}`);
      }
      if (inbox.processed > 0 || inbox.errors > 0) {
        console.log(`[imap] processed=${inbox.processed} recorded=${inbox.recorded} errors=${inbox.errors}`);
      }
      if (salesforce.processed > 0 || salesforce.errors > 0) {
        console.log(`[salesforce] processed=${salesforce.processed} imported=${salesforce.imported} errors=${salesforce.errors}`);
      }
      if (linkedin.processed > 0 || linkedin.errors > 0) {
        console.log(`[linkedin] processed=${linkedin.processed} imported=${linkedin.imported} errors=${linkedin.errors}`);
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
