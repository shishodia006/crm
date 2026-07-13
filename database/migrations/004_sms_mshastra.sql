-- Run once after 003_ai_agent_foundation.sql.
-- Adds first-class MShastra SMS settings without overwriting configured secrets.

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
  `value` = CASE
    WHEN `value` IS NULL OR `value` = '' THEN VALUES(`value`)
    ELSE `value`
  END,
  `group` = VALUES(`group`);
