import { pool, q, run } from './pool.js';
import { isSensitive } from '../services/settings.service.js';

// Runs once at server startup and brings the DB schema up to date with
// database/migrations/001..008, without relying on "ADD COLUMN IF NOT EXISTS"
// (older MySQL — anything before 8.0.29 — rejects that syntax with ERROR 1064).
// Every check below queries INFORMATION_SCHEMA first and only runs the ALTER
// if the column/index/constraint is actually missing, so this is safe to run
// on every restart regardless of how far along the DB already is.

async function columnExists(table, column) {
  const row = await q(
    'SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND COLUMN_NAME=? LIMIT 1',
    [table, column]
  );
  return row.length > 0;
}

async function indexExists(table, indexName) {
  const row = await q(
    'SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND INDEX_NAME=? LIMIT 1',
    [table, indexName]
  );
  return row.length > 0;
}

async function constraintExists(table, constraintName) {
  const row = await q(
    'SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME=? AND CONSTRAINT_NAME=? LIMIT 1',
    [table, constraintName]
  );
  return row.length > 0;
}

// DDL (ALTER TABLE) goes through pool.query() rather than the app's run()/q()
// helpers — those use MySQL's prepared-statement protocol (COM_STMT_PREPARE),
// which some MySQL builds refuse for DDL. pool.query() uses the plain text
// protocol, the same thing running the statement in the mysql CLI does.
async function ensureColumn(table, column, ddl, indexName, indexDdl) {
  if (!(await columnExists(table, column))) {
    await pool.query(`ALTER TABLE \`${table}\` ADD COLUMN ${ddl}`);
    console.log(`[auto-migrate] added ${table}.${column}`);
  }
  if (indexName && !(await indexExists(table, indexName))) {
    await pool.query(`ALTER TABLE \`${table}\` ${indexDdl}`);
    console.log(`[auto-migrate] added index ${indexName} on ${table}`);
  }
}

async function ensureForeignKey(table, constraintName, ddl) {
  if (!(await constraintExists(table, constraintName))) {
    try {
      await pool.query(`ALTER TABLE \`${table}\` ADD CONSTRAINT \`${constraintName}\` ${ddl}`);
      console.log(`[auto-migrate] added FK ${constraintName} on ${table}`);
    } catch (err) {
      // Non-fatal: e.g. orphaned rows that violate the FK on a DB that was
      // hand-patched out of order. Log it, don't block server startup over it.
      console.error(`[auto-migrate] FK ${constraintName} on ${table} skipped:`, err.message);
    }
  }
}

export async function runAutoMigrations() {
  try {
    // 001_multicompany
    await ensureColumn('leads', 'company_id', '`company_id` INT UNSIGNED DEFAULT NULL', 'idx_leads_company', 'ADD INDEX `idx_leads_company` (`company_id`)');
    await ensureColumn('campaigns', 'company_id', '`company_id` INT UNSIGNED DEFAULT NULL', 'idx_campaigns_company', 'ADD INDEX `idx_campaigns_company` (`company_id`)');
    await ensureColumn('templates', 'company_id', '`company_id` INT UNSIGNED DEFAULT NULL', 'idx_templates_company', 'ADD INDEX `idx_templates_company` (`company_id`)');
    await ensureColumn('deals', 'company_id', '`company_id` INT UNSIGNED DEFAULT NULL', 'idx_deals_company', 'ADD INDEX `idx_deals_company` (`company_id`)');
    await ensureColumn('tasks', 'company_id', '`company_id` INT UNSIGNED DEFAULT NULL', 'idx_tasks_company', 'ADD INDEX `idx_tasks_company` (`company_id`)');
    await ensureColumn('integrations', 'company_id', '`company_id` INT UNSIGNED DEFAULT NULL', 'idx_integrations_company', 'ADD INDEX `idx_integrations_company` (`company_id`)');
    await ensureColumn('segments', 'company_id', '`company_id` INT UNSIGNED DEFAULT NULL', 'idx_segments_company', 'ADD INDEX `idx_segments_company` (`company_id`)');
    await ensureColumn('campaigns', 'template_id', '`template_id` INT UNSIGNED DEFAULT NULL');
    await ensureColumn('campaigns', 'audience_filter', '`audience_filter` JSON DEFAULT NULL');
    await ensureColumn('campaigns', 'sent_count', '`sent_count` INT UNSIGNED NOT NULL DEFAULT 0');
    await ensureColumn('users', 'timezone', '`timezone` VARCHAR(60) DEFAULT NULL');
    await ensureColumn('users', 'status', "`status` ENUM('invited','active') NOT NULL DEFAULT 'active'");
    await ensureColumn('leads', 'lead_type', "`lead_type` ENUM('direct_client','partner_client') DEFAULT NULL");

    // Backfill so pre-existing rows aren't invisible to company_id filters
    const [company] = await q('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
    if (!company) {
      await run("INSERT INTO companies (name, slug) VALUES ('Default Workspace','default-workspace')");
    }
    const [{ id: defaultCompanyId }] = await q('SELECT id FROM companies ORDER BY id ASC LIMIT 1');
    for (const table of ['leads', 'campaigns', 'templates', 'deals', 'tasks', 'integrations', 'segments']) {
      await run(`UPDATE \`${table}\` SET company_id=? WHERE company_id IS NULL`, [defaultCompanyId]);
    }
    await run(
      'INSERT IGNORE INTO company_users (company_id, user_id) SELECT ?, id FROM users WHERE is_active=1',
      [defaultCompanyId]
    );

    // SECURITY: credentials (API keys/passwords/tokens) that predate multi-tenancy
    // were saved to the global `settings` table — getSetting()/companySettings()
    // used to fall back to that table for ANY company with no override of its own,
    // meaning every newly-created company saw the original admin's live credentials.
    // One-time move: copy each sensitive global row into the original (oldest)
    // company's own company_settings if it doesn't already have that key, then
    // delete it from the global table so it can never leak to another company
    // again. Already-migrated installs have nothing left here — this becomes a
    // fast no-op query on every subsequent boot.
    const sensitiveGlobalRows = await q('SELECT `key`,`value`,`group` FROM settings');
    for (const row of sensitiveGlobalRows) {
      if (!isSensitive(row.key)) continue;
      const [existing] = await q('SELECT 1 FROM company_settings WHERE company_id=? AND `key`=? LIMIT 1', [defaultCompanyId, row.key]);
      if (!existing) {
        await run(
          'INSERT INTO company_settings (company_id,`key`,`value`,`group`) VALUES (?,?,?,?)',
          [defaultCompanyId, row.key, row.value, row.group]
        );
        console.log(`[auto-migrate] moved credential ${row.key} from global settings to company #${defaultCompanyId}`);
      }
      await run('DELETE FROM settings WHERE `key`=?', [row.key]);
    }

    // 002_integration_routing
    await ensureColumn('communications', 'integration_account_id', '`integration_account_id` INT UNSIGNED DEFAULT NULL', 'idx_communications_integration_account', 'ADD INDEX `idx_communications_integration_account` (`integration_account_id`)');
    await ensureForeignKey('communications', 'fk_communications_integration_account', 'FOREIGN KEY (`integration_account_id`) REFERENCES `integration_accounts`(`id`) ON DELETE SET NULL');

    // 005_conversation_rcs_channel (MODIFY COLUMN is always safe to re-run, no guard needed)
    await pool.query("ALTER TABLE `conversations` MODIFY COLUMN `channel` ENUM('email','whatsapp','sms','call','rcs') NOT NULL DEFAULT 'email'");
    await pool.query("ALTER TABLE `conversation_messages` MODIFY COLUMN `channel` ENUM('email','whatsapp','sms','call','rcs') NOT NULL");

    // workflow_steps.type ENUM never grew to cover step types added after the
    // original 11 (multi_send, tag_lead, and the short-form aliases the Simple
    // Builder saves — email/whatsapp/rcs/sms/task) — saving a Tag/Multi-Send
    // step (or any step using a short alias) hit "Data truncated for column
    // 'type'", surfaced to the user as a generic save error.
    await pool.query(`ALTER TABLE \`workflow_steps\` MODIFY COLUMN \`type\` ENUM(
      'email','whatsapp','rcs','sms',
      'send_email','send_whatsapp','send_rcs','send_sms','multi_send',
      'wait','condition','assign_agent','task','create_task',
      'update_score','move_pipeline','tag_lead','exit'
    ) NOT NULL`);

    // 006_email_module
    await ensureColumn('templates', 'design_json', '`design_json` JSON DEFAULT NULL');
    await ensureColumn('integration_accounts', 'daily_send_limit', '`daily_send_limit` INT UNSIGNED DEFAULT NULL');
    await ensureColumn('integration_accounts', 'sent_today', '`sent_today` INT UNSIGNED NOT NULL DEFAULT 0');
    await ensureColumn('integration_accounts', 'sent_today_date', '`sent_today_date` DATE DEFAULT NULL');

    // 007_template_integration_account
    await ensureColumn('templates', 'integration_account_id', '`integration_account_id` INT UNSIGNED DEFAULT NULL', 'idx_templates_integration_account', 'ADD INDEX `idx_templates_integration_account` (`integration_account_id`)');
    await ensureForeignKey('templates', 'fk_templates_integration_account', 'FOREIGN KEY (`integration_account_id`) REFERENCES `integration_accounts`(`id`) ON DELETE SET NULL');

    // 008_conversation_inbound
    await ensureColumn('conversation_messages', 'provider_msg_id', '`provider_msg_id` VARCHAR(255) DEFAULT NULL', 'uniq_conversation_messages_provider_msg', 'ADD UNIQUE INDEX `uniq_conversation_messages_provider_msg` (`channel`,`provider_msg_id`)');

    // 009_google_sheets_multi — a company used to get exactly one Google Sheet
    // (sheet_id/range stored as plain company_settings keys). Introducing
    // per-sheet rows means an existing configured sheet has to become the
    // first row of the new table instead of silently disappearing on upgrade.
    await pool.query(`CREATE TABLE IF NOT EXISTS \`google_sheet_connections\` (
      \`id\`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      \`company_id\`      INT UNSIGNED NOT NULL,
      \`source_id\`       INT UNSIGNED NOT NULL,
      \`name\`            VARCHAR(150) NOT NULL,
      \`sheet_id\`        VARCHAR(120) NOT NULL,
      \`range\`           VARCHAR(60) NOT NULL DEFAULT 'A1:Z10000',
      \`last_synced_at\`  DATETIME DEFAULT NULL,
      \`created_at\`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      \`updated_at\`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      FOREIGN KEY (\`company_id\`) REFERENCES \`companies\`(\`id\`) ON DELETE CASCADE,
      FOREIGN KEY (\`source_id\`)  REFERENCES \`lead_sources\`(\`id\`) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci`);

    const legacySheetSettings = await q(
      "SELECT company_id, `key`, `value` FROM company_settings WHERE `key` IN ('google_sheets_id','google_sheets_range') AND `value` IS NOT NULL AND `value` <> ''"
    );
    const legacyByCompany = {};
    for (const row of legacySheetSettings) {
      (legacyByCompany[row.company_id] ??= {})[row.key] = row.value;
    }
    for (const [companyId, vals] of Object.entries(legacyByCompany)) {
      if (!vals.google_sheets_id) continue;
      const [{ cnt }] = await q('SELECT COUNT(*) AS cnt FROM google_sheet_connections WHERE company_id=?', [companyId]);
      if (Number(cnt) > 0) continue; // already migrated (or created fresh post-upgrade)
      let [source] = await q("SELECT id FROM lead_sources WHERE slug='google_sheets' LIMIT 1");
      if (!source) {
        const inserted = await run("INSERT INTO lead_sources (name,slug,category) VALUES ('Google Sheets','google_sheets','external')");
        source = { id: inserted.insertId };
      }
      const sheetIdMatch = String(vals.google_sheets_id).match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
      const sheetId = sheetIdMatch ? sheetIdMatch[1] : String(vals.google_sheets_id).trim();
      await run(
        'INSERT INTO google_sheet_connections (company_id, source_id, name, sheet_id, `range`) VALUES (?,?,?,?,?)',
        [companyId, source.id, 'Google Sheets', sheetId, vals.google_sheets_range || 'A1:Z10000']
      );
      console.log(`[auto-migrate] migrated single Google Sheet setting to google_sheet_connections for company #${companyId}`);
    }

    // 004_sms_mshastra (idempotent via ON DUPLICATE KEY)
    await run(`
      INSERT INTO settings (\`key\`, \`value\`, \`group\`) VALUES
        ('sms_provider','mshastra','sms'), ('sms_mshastra_url','https://mshastra.com/sendurl.aspx','sms'),
        ('sms_mshastra_user','','sms'), ('sms_mshastra_pwd','','sms'), ('sms_mshastra_sender','','sms'),
        ('sms_mshastra_country','91','sms'), ('sms_api_url','','sms'), ('sms_api_key','','sms'), ('sms_sender','','sms')
      ON DUPLICATE KEY UPDATE
        \`value\` = CASE WHEN \`value\` IS NULL OR \`value\`='' THEN VALUES(\`value\`) ELSE \`value\` END,
        \`group\` = VALUES(\`group\`)
    `);

    console.log('[auto-migrate] schema check complete — up to date.');
  } catch (err) {
    // Never crash the whole server over a migration hiccup — log loudly so it's
    // visible in `pm2 logs`, but let the app still come up with whatever schema exists.
    console.error('[auto-migrate] FAILED:', err.message);
  }
}
