-- Run once after 005_conversation_rcs_channel.sql.
-- Adds: (1) a structured block-design column for the email template builder
-- (body stays the compiled HTML that every send path already renders), and
-- (2) per-account daily send-limit tracking for integration_accounts.

ALTER TABLE `templates`
  ADD COLUMN IF NOT EXISTS `design_json` JSON DEFAULT NULL;

ALTER TABLE `integration_accounts`
  ADD COLUMN IF NOT EXISTS `daily_send_limit` INT UNSIGNED DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS `sent_today` INT UNSIGNED NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS `sent_today_date` DATE DEFAULT NULL;
