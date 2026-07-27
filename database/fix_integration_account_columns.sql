-- Safe, MySQL-version-agnostic column fix for the Campaign Builder 500 error.
-- Uses INFORMATION_SCHEMA + dynamic SQL instead of "ADD COLUMN IF NOT EXISTS",
-- which older MySQL (pre-8.0.29) rejects with ERROR 1064.
-- Safe to run multiple times — skips any column/table that already exists.

SET @db := DATABASE();

-- templates.integration_account_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='templates' AND COLUMN_NAME='integration_account_id');
SET @sql := IF(@exists=0,
  'ALTER TABLE `templates` ADD COLUMN `integration_account_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_templates_integration_account` (`integration_account_id`)',
  'SELECT ''templates.integration_account_id already exists'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;

-- communications.integration_account_id
SET @exists := (SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA=@db AND TABLE_NAME='communications' AND COLUMN_NAME='integration_account_id');
SET @sql := IF(@exists=0,
  'ALTER TABLE `communications` ADD COLUMN `integration_account_id` INT UNSIGNED DEFAULT NULL, ADD INDEX `idx_communications_integration_account` (`integration_account_id`)',
  'SELECT ''communications.integration_account_id already exists'' AS status');
PREPARE stmt FROM @sql; EXECUTE stmt; DEALLOCATE PREPARE stmt;
