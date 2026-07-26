-- Link each template to the specific integration account (e.g. a WhatsApp/Anantya
-- number) it was synced for or created under, so multiple accounts on the same
-- channel each keep their own separate template list. NULL = company-default
-- (the original single global account, kept for backward compatibility).
ALTER TABLE `templates`
  ADD COLUMN IF NOT EXISTS `integration_account_id` INT UNSIGNED DEFAULT NULL,
  ADD INDEX IF NOT EXISTS `idx_templates_integration_account` (`integration_account_id`);

ALTER TABLE `templates`
  ADD CONSTRAINT `fk_templates_integration_account`
  FOREIGN KEY (`integration_account_id`) REFERENCES `integration_accounts`(`id`) ON DELETE SET NULL;
