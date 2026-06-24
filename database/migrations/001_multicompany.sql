-- Multi-company tenancy migration.
-- Run this ONCE on an existing Dot Domino CRM database, after taking a backup.
-- New installations should use database/schema.sql (which will include these tables in a later consolidation).

CREATE TABLE IF NOT EXISTS `companies` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name` VARCHAR(150) NOT NULL,
  `slug` VARCHAR(160) NOT NULL UNIQUE,
  `logo` VARCHAR(500) DEFAULT NULL,
  `timezone` VARCHAR(80) DEFAULT NULL,
  `currency` VARCHAR(12) DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_companies_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `company_users` (
  `company_id` INT UNSIGNED NOT NULL,
  `user_id` INT UNSIGNED NOT NULL,
  `role` ENUM('admin','manager','agent','viewer') DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`, `user_id`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_company_users_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `company_settings` (
  `company_id` INT UNSIGNED NOT NULL,
  `key` VARCHAR(100) NOT NULL,
  `value` TEXT DEFAULT NULL,
  `group` VARCHAR(60) NOT NULL DEFAULT 'general',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`company_id`, `key`),
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  INDEX `idx_company_settings_group` (`company_id`, `group`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `communication_events` (
  `id` BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `communication_id` INT UNSIGNED DEFAULT NULL,
  `lead_id` INT UNSIGNED DEFAULT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `provider_msg_id` VARCHAR(255) DEFAULT NULL,
  `event_type` ENUM('sent','delivered','read','opened','clicked','replied','failed','bounced','unknown') NOT NULL,
  `event_key` CHAR(64) NOT NULL,
  `occurred_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `payload` JSON DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY `uniq_communication_event` (`event_key`),
  INDEX `idx_comm_events_communication` (`communication_id`,`event_type`,`occurred_at`),
  INDEX `idx_comm_events_lead` (`lead_id`,`event_type`,`occurred_at`),
  INDEX `idx_comm_events_provider_message` (`provider`,`provider_msg_id`),
  FOREIGN KEY (`communication_id`) REFERENCES `communications`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `integration_accounts` (
  `id` INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `company_id` INT UNSIGNED NOT NULL,
  `name` VARCHAR(120) NOT NULL,
  `provider` VARCHAR(60) NOT NULL,
  `channel` ENUM('email','whatsapp','rcs','sms','lead_source','other') NOT NULL DEFAULT 'other',
  `external_account_id` VARCHAR(255) DEFAULT NULL,
  `webhook_key` CHAR(48) NOT NULL UNIQUE,
  `webhook_secret` VARCHAR(255) DEFAULT NULL,
  `config` JSON DEFAULT NULL,
  `is_active` TINYINT(1) NOT NULL DEFAULT 1,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`company_id`) REFERENCES `companies`(`id`) ON DELETE CASCADE,
  INDEX `idx_integration_accounts_company` (`company_id`,`provider`,`is_active`),
  INDEX `idx_integration_accounts_external` (`provider`,`external_account_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- MySQL 8.0.29+ supports IF NOT EXISTS. For older MySQL versions, run the
-- equivalent ALTER TABLE statements once after checking the columns.
ALTER TABLE `leads` ADD COLUMN IF NOT EXISTS `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX IF NOT EXISTS `idx_leads_company` (`company_id`);
ALTER TABLE `campaigns` ADD COLUMN IF NOT EXISTS `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX IF NOT EXISTS `idx_campaigns_company` (`company_id`);
ALTER TABLE `templates` ADD COLUMN IF NOT EXISTS `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX IF NOT EXISTS `idx_templates_company` (`company_id`);
ALTER TABLE `deals` ADD COLUMN IF NOT EXISTS `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX IF NOT EXISTS `idx_deals_company` (`company_id`);
ALTER TABLE `tasks` ADD COLUMN IF NOT EXISTS `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX IF NOT EXISTS `idx_tasks_company` (`company_id`);
ALTER TABLE `integrations` ADD COLUMN IF NOT EXISTS `company_id` INT UNSIGNED DEFAULT NULL, ADD INDEX IF NOT EXISTS `idx_integrations_company` (`company_id`);

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
INSERT IGNORE INTO `company_users` (`company_id`, `user_id`)
SELECT @default_company_id, id FROM users WHERE is_active=1;
