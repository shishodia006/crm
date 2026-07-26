-- Run once after 004_sms_mshastra.sql.
-- The Conversations feature (conversations + conversation_messages) predates RCS
-- being added as a channel, so its channel ENUM never included 'rcs'. Sending/logging
-- an RCS message failed with "Data truncated for column 'channel'" until this ran.

ALTER TABLE `conversations`
  MODIFY COLUMN `channel` ENUM('email','whatsapp','sms','call','rcs') NOT NULL DEFAULT 'email';

ALTER TABLE `conversation_messages`
  MODIFY COLUMN `channel` ENUM('email','whatsapp','sms','call','rcs') NOT NULL;
