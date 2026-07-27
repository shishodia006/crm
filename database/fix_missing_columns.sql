-- Comprehensive, MySQL-version-agnostic fix for every `ADD COLUMN/INDEX IF NOT EXISTS`
-- statement in schema.sql (older MySQL rejects that syntax with ERROR 1064, so these
-- never applied on production). Uses INFORMATION_SCHEMA checks + dynamic SQL instead —
-- safe to run multiple times, only adds what's actually missing.

SET @db := DATABASE();

-- Reusable pattern: check column existence, run ALTER only if missing.
-- (repeated inline per-column since MySQL has no user-defined stored-proc shorthand here)

-- leads.company_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='leads' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `leads` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_leads_company` (`company_id`)', 'SELECT ''leads.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- campaigns.company_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_campaigns_company` (`company_id`)', 'SELECT ''campaigns.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- campaigns.template_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='template_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `template_id` INT UNSIGNED DEFAULT NULL', 'SELECT ''campaigns.template_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- campaigns.audience_filter
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='audience_filter');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `audience_filter` JSON DEFAULT NULL', 'SELECT ''campaigns.audience_filter OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- campaigns.sent_count
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='campaigns' AND COLUMN_NAME='sent_count');
SET @sql := IF(@exists=0, 'ALTER TABLE `campaigns` ADD COLUMN `sent_count` INT UNSIGNED NOT NULL DEFAULT 0', 'SELECT ''campaigns.sent_count OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- templates.company_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='templates' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `templates` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_templates_company` (`company_id`)', 'SELECT ''templates.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- deals.company_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='deals' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `deals` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_deals_company` (`company_id`)', 'SELECT ''deals.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- tasks.company_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='tasks' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `tasks` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_tasks_company` (`company_id`)', 'SELECT ''tasks.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- integrations.company_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='integrations' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `integrations` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_integrations_company` (`company_id`)', 'SELECT ''integrations.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- integrations unique(company_id, slug) -- only add once company_id definitely exists
SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='integrations' AND INDEX_NAME='uniq_company_slug');
SET @sql := IF(@exists=0, 'ALTER TABLE `integrations` ADD UNIQUE KEY `uniq_company_slug` (`company_id`, `slug`)', 'SELECT ''integrations.uniq_company_slug OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- segments.company_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='segments' AND COLUMN_NAME='company_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `segments` ADD COLUMN `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_segments_company` (`company_id`)', 'SELECT ''segments.company_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.timezone
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='timezone');
SET @sql := IF(@exists=0, 'ALTER TABLE `users` ADD COLUMN `timezone` VARCHAR(60) DEFAULT NULL', 'SELECT ''users.timezone OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- users.status
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='users' AND COLUMN_NAME='status');
SET @sql := IF(@exists=0, 'ALTER TABLE `users` ADD COLUMN `status` ENUM(''invited'',''active'') NOT NULL DEFAULT ''active''', 'SELECT ''users.status OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- templates.integration_account_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='templates' AND COLUMN_NAME='integration_account_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `templates` ADD COLUMN `integration_account_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_templates_integration_account` (`integration_account_id`)', 'SELECT ''templates.integration_account_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- communications.integration_account_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='communications' AND COLUMN_NAME='integration_account_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `communications` ADD COLUMN `integration_account_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_communications_integration_account` (`integration_account_id`)', 'SELECT ''communications.integration_account_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- conversation_messages.provider_msg_id  (this is the one breaking IMAP reply storage)
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conversation_messages' AND COLUMN_NAME='provider_msg_id');
SET @sql := IF(@exists=0, 'ALTER TABLE `conversation_messages` ADD COLUMN `provider_msg_id` VARCHAR(255) DEFAULT NULL', 'SELECT ''conversation_messages.provider_msg_id OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SET @exists := (SELECT COUNT(*) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=@db AND TABLE_NAME='conversation_messages' AND INDEX_NAME='uniq_conversation_messages_provider_msg');
SET @sql := IF(@exists=0, 'ALTER TABLE `conversation_messages` ADD UNIQUE INDEX `uniq_conversation_messages_provider_msg` (`channel`,`provider_msg_id`)', 'SELECT ''conversation_messages provider_msg_id index OK''');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

SELECT 'ALL CHECKS COMPLETE' AS status;
