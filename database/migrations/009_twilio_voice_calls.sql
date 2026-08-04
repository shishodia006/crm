-- Twilio Voice (phone call) support — historical record only. Not auto-run;
-- server/src/db/autoMigrate.js (the "010_twilio_voice" block) is the source of
-- truth that actually applies this to existing installs at boot.

ALTER TABLE `communications` MODIFY COLUMN `channel` ENUM('email','whatsapp','rcs','sms','call') NOT NULL;
ALTER TABLE `communications` MODIFY COLUMN `status` ENUM(
  'queued','sent','delivered','opened','clicked','replied','bounced','failed','unsubscribed',
  'ringing','in_progress','no_answer','busy','canceled','completed'
) NOT NULL DEFAULT 'queued';

ALTER TABLE `communications` ADD COLUMN IF NOT EXISTS `direction` ENUM('outbound','inbound') NOT NULL DEFAULT 'outbound';
ALTER TABLE `communications` ADD COLUMN IF NOT EXISTS `duration_seconds` INT UNSIGNED DEFAULT NULL;
ALTER TABLE `communications` ADD COLUMN IF NOT EXISTS `recording_url` VARCHAR(500) DEFAULT NULL;
ALTER TABLE `communications` ADD COLUMN IF NOT EXISTS `agent_user_id` INT UNSIGNED DEFAULT NULL, ADD INDEX IF NOT EXISTS `idx_agent` (`agent_user_id`);
ALTER TABLE `communications` ADD CONSTRAINT `fk_communications_agent_user` FOREIGN KEY (`agent_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL;
