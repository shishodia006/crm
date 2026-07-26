-- Inbound replies (email IMAP polling + WhatsApp webhook messages) need a way to
-- dedupe re-delivered webhook events / re-scanned mailbox items so the same reply
-- doesn't get inserted into a conversation thread twice.
ALTER TABLE `conversation_messages`
  ADD COLUMN IF NOT EXISTS `provider_msg_id` VARCHAR(255) DEFAULT NULL,
  ADD UNIQUE INDEX IF NOT EXISTS `uniq_conversation_messages_provider_msg` (`channel`,`provider_msg_id`);
