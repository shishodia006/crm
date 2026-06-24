-- Run once after 001_multicompany.sql.
ALTER TABLE `communications`
  ADD COLUMN IF NOT EXISTS `integration_account_id` INT UNSIGNED DEFAULT NULL,
  ADD INDEX IF NOT EXISTS `idx_communications_integration_account` (`integration_account_id`);

ALTER TABLE `communications`
  ADD CONSTRAINT `fk_communications_integration_account`
  FOREIGN KEY (`integration_account_id`) REFERENCES `integration_accounts`(`id`) ON DELETE SET NULL;
