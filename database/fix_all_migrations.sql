-- Consolidated, MySQL-version-agnostic re-run of ALL of database/migrations/001..008
-- for a production DB where the `ADD COLUMN/INDEX IF NOT EXISTS` syntax silently
-- failed (older MySQL rejects it with ERROR 1064). Safe to run multiple times.

SET @db := DATABASE();

-- ── helper pattern used throughout: check INFORMATION_SCHEMA, only ALTER if missing ──

-- 001_multicompany: company_id on leads/campaigns/templates/deals/tasks/integrations
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `leads` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_leads_company` (`company_id`)', 'SELECT ''leads.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_campaigns_company` (`company_id`)', 'SELECT ''campaigns.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='templates' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `templates` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_templates_company` (`company_id`)', 'SELECT ''templates.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='deals' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `deals` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_deals_company` (`company_id`)', 'SELECT ''deals.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='tasks' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `tasks` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_tasks_company` (`company_id`)', 'SELECT ''tasks.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='integrations' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `integrations` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_integrations_company` (`company_id`)', 'SELECT ''integrations.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='template_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `template_id` INT UNSIGNED DEFAULT NULL', 'SELECT ''campaigns.template_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='audience_filter');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `audience_filter` JSON DEFAULT NULL', 'SELECT ''campaigns.audience_filter OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='sent_count');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `sent_count` INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT ''campaigns.sent_count OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='segments' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `segments` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_segments_company` (`company_id`)', 'SELECT ''segments.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='timezone');
SET @sql := IF(@exists=0, 'ALTER TABLE `users` ADD COLUMN `timezone` VARCHAR(60) DEFAULT NULL', 'SELECT ''users.timezone OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @sql := IF(@exists=0, 'ALTER TABLE `users` ADD COLUMN `status` ENUM(''invited'',''active'') NOT NULL DEFAULT ''active''', 'SELECT ''users.status OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- data backfill so pre-existing rows aren't invisible to company_id filters
INSERT INTO `companies` (`name`, `slug`)
SELECT 'Default Workspace', 'default-workspace'
WHERE NOT EXISTS (SELECT 1 FROM `companies` LIMIT 1);

SET @default_company_id := (SELECT id FROM companies ORDER BY id ASC LIMIT 1);
UPDATE `leads`        SET company_id=@default_company_id WHERE company_id IS NULL;
UPDATE `campaigns`    SET company_id=@default_company_id WHERE company_id IS NULL;
UPDATE `templates`    SET company_id=@default_company_id WHERE company_id IS NULL;
UPDATE `deals`        SET company_id=@default_company_id WHERE company_id IS NULL;
UPDATE `tasks`        SET company_id=@default_company_id WHERE company_id IS NULL;
UPDATE `integrations` SET company_id=@default_company_id WHERE company_id IS NULL;
UPDATE `segments`     SET company_id=@default_company_id WHERE company_id IS NULL;
INSERT IGNORE INTO `company_users` (`company_id`, `user_id`)
SELECT @default_company_id, id FROM users WHERE is_active=1;

-- 002_integration_routing: communications.integration_account_id (+ FK)
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='communications' AND COLUMN_NAME='integration_account_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `communications` ADD COLUMN `integration_account_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_communications_integration_account` (`integration_account_id`)', 'SELECT ''communications.integration_account_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='communications' AND CONSTRAINT_NAME='fk_communications_integration_account');
SET @sql := IF(@exists=0, 'ALTER TABLE `communications` ADD CONSTRAINT `fk_communications_integration_account` FOREIGN KEY (`integration_account_id`) REFERENCES `integration_accounts`(`id`) ON DELETE SET NULL', 'SELECT ''fk_communications_integration_account OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 005_conversation_rcs_channel: add 'rcs' to channel ENUMs (MODIFY is always safe to re-run)
ALTER TABLE `conversations` MODIFY COLUMN `channel` ENUM('email','whatsapp','sms','call','rcs') NOT NULL DEFAULT 'email';
ALTER TABLE `conversation_messages` MODIFY COLUMN `channel` ENUM('email','whatsapp','sms','call','rcs') NOT NULL;

-- 006_email_module: templates.design_json + integration_accounts send-limit tracking
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='templates' AND COLUMN_NAME='design_json');
SET @sql := IF(@exists=0, 'ALTER TABLE `templates` ADD COLUMN `design_json` JSON DEFAULT NULL', 'SELECT ''templates.design_json OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='integration_accounts' AND COLUMN_NAME='daily_send_limit');
SET @sql := IF(@exists=0, 'ALTER TABLE `integration_accounts` ADD COLUMN `daily_send_limit` INT UNSIGNED DEFAULT NULL', 'SELECT ''integration_accounts.daily_send_limit OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='integration_accounts' AND COLUMN_NAME='sent_today');
SET @sql := IF(@exists=0, 'ALTER TABLE `integration_accounts` ADD COLUMN `sent_today` INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT ''integration_accounts.sent_today OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='integration_accounts' AND COLUMN_NAME='sent_today_date');
SET @sql := IF(@exists=0, 'ALTER TABLE `integration_accounts` ADD COLUMN `sent_today_date` DATE DEFAULT NULL', 'SELECT ''integration_accounts.sent_today_date OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 007_template_integration_account: templates.integration_account_id (+ FK)
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='templates' AND COLUMN_NAME='integration_account_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `templates` ADD COLUMN `integration_account_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_templates_integration_account` (`integration_account_id`)', 'SELECT ''templates.integration_account_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='templates' AND CONSTRAINT_NAME='fk_templates_integration_account');
SET @sql := IF(@exists=0, 'ALTER TABLE `templates` ADD CONSTRAINT `fk_templates_integration_account` FOREIGN KEY (`integration_account_id`) REFERENCES `integration_accounts`(`id`) ON DELETE SET NULL', 'SELECT ''fk_templates_integration_account OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 008_conversation_inbound: conversation_messages.provider_msg_id (dedupe key for IMAP replies)
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conversation_messages' AND COLUMN_NAME='provider_msg_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `conversation_messages` ADD COLUMN `provider_msg_id` VARCHAR(255) DEFAULT NULL', 'SELECT ''conversation_messages.provider_msg_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conversation_messages' AND INDEX_NAME='uniq_conversation_messages_provider_msg');
SET @sql := IF(@exists=0, 'ALTER TABLE `conversation_messages` ADD UNIQUE INDEX `uniq_conversation_messages_provider_msg` (`channel`,`provider_msg_id`)', 'SELECT ''conversation_messages provider_msg_id index OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- 004_sms_mshastra: default SMS settings (idempotent via ON DUPLICATE KEY)
INSERT INTO `settings` (`key`, `value`, `group`) VALUES
  ('sms_provider',          'mshastra', 'sms'),
  ('sms_mshastra_url',     'https://mshastra.com/sendurl.aspx', 'sms'),
  ('sms_mshastra_user',    '', 'sms'),
  ('sms_mshastra_pwd',     '', 'sms'),
  ('sms_mshastra_sender',  '', 'sms'),
  ('sms_mshastra_country', '91', 'sms'),
  ('sms_api_url',          '', 'sms'),
  ('sms_api_key',          '', 'sms'),
  ('sms_sender',           '', 'sms')
ON DUPLICATE KEY UPDATE
  `value` = CASE WHEN `value` IS NULL OR `value` = '' THEN VALUES(`value`) ELSE `value` END,
  `group` = VALUES(`group`);

SELECT 'ALL MIGRATIONS APPLIED' AS status;
