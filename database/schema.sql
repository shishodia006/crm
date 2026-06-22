-- ============================================================
-- DOT DOMINO CRM - MySQL Schema
-- Engine: InnoDB | Charset: utf8mb4 | Collation: utf8mb4_unicode_ci
-- ============================================================

SET FOREIGN_KEY_CHECKS = 0;
SET NAMES utf8mb4;

-- ============================================================
-- USERS & AUTH
-- ============================================================

CREATE TABLE IF NOT EXISTS `users` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`            VARCHAR(120) NOT NULL,
  `email`           VARCHAR(180) NOT NULL UNIQUE,
  `password`        VARCHAR(255) NOT NULL,
  `role`            ENUM('superadmin','admin','manager','agent') NOT NULL DEFAULT 'agent',
  `avatar`          VARCHAR(255) DEFAULT NULL,
  `phone`           VARCHAR(20) DEFAULT NULL,
  `is_active`       TINYINT(1) NOT NULL DEFAULT 1,
  `last_login_at`   DATETIME DEFAULT NULL,
  `created_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX `idx_role` (`role`),
  INDEX `idx_active` (`is_active`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_resets` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `email`      VARCHAR(180) NOT NULL,
  `token`      VARCHAR(100) NOT NULL UNIQUE,
  `expires_at` DATETIME NOT NULL,
  `used`       TINYINT(1) NOT NULL DEFAULT 0,
  INDEX `idx_email` (`email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `id`         VARCHAR(128) PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `ip`         VARCHAR(45) DEFAULT NULL,
  `user_agent` VARCHAR(512) DEFAULT NULL,
  `payload`    TEXT,
  `expires_at` DATETIME NOT NULL,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LEAD SOURCES
-- ============================================================

CREATE TABLE IF NOT EXISTS `lead_sources` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(100) NOT NULL,
  `slug`        VARCHAR(60) NOT NULL UNIQUE,  -- indimart, meta_ads, csv_upload, etc.
  `category`    ENUM('marketplace','advertising','website','external','events','manual','api') NOT NULL,
  `is_active`   TINYINT(1) NOT NULL DEFAULT 1,
  `config`      JSON DEFAULT NULL,            -- API keys, webhook secrets per source
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TAGS
-- ============================================================

CREATE TABLE IF NOT EXISTS `tags` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(80) NOT NULL UNIQUE,
  `color`      VARCHAR(7) NOT NULL DEFAULT '#6c757d',
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LEADS (Core)
-- ============================================================

CREATE TABLE IF NOT EXISTS `leads` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `uid`              VARCHAR(36) NOT NULL UNIQUE DEFAULT (UUID()), -- public-facing UID
  `name`             VARCHAR(150) NOT NULL,
  `email`            VARCHAR(180) DEFAULT NULL,
  `mobile`           VARCHAR(20) DEFAULT NULL,
  `company`          VARCHAR(200) DEFAULT NULL,
  `designation`      VARCHAR(150) DEFAULT NULL,
  `industry`         VARCHAR(100) DEFAULT NULL,
  `city`             VARCHAR(100) DEFAULT NULL,
  `state`            VARCHAR(100) DEFAULT NULL,
  `country`          VARCHAR(80) DEFAULT 'India',
  `pincode`          VARCHAR(10) DEFAULT NULL,
  `website`          VARCHAR(255) DEFAULT NULL,
  `source_id`        INT UNSIGNED DEFAULT NULL,
  `source_ref`       VARCHAR(255) DEFAULT NULL,  -- external ID from source
  `product_interest` VARCHAR(255) DEFAULT NULL,
  `campaign_ref`     VARCHAR(255) DEFAULT NULL,  -- UTM / campaign tag from source
  `assigned_to`      INT UNSIGNED DEFAULT NULL,
  `score`            SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `category`         ENUM('cold','warm','hot','sales_ready') NOT NULL DEFAULT 'cold',
  `status`           ENUM('new','contacted','qualified','proposal','negotiation','won','lost','unsubscribed','invalid') NOT NULL DEFAULT 'new',
  `is_duplicate`     TINYINT(1) NOT NULL DEFAULT 0,
  `duplicate_of`     INT UNSIGNED DEFAULT NULL,
  `email_valid`      TINYINT(1) DEFAULT NULL,
  `mobile_valid`     TINYINT(1) DEFAULT NULL,
  `do_not_contact`   TINYINT(1) NOT NULL DEFAULT 0,
  `unsubscribed_at`  DATETIME DEFAULT NULL,
  `won_at`           DATETIME DEFAULT NULL,
  `lost_at`          DATETIME DEFAULT NULL,
  `lost_reason`      VARCHAR(255) DEFAULT NULL,
  `notes`            TEXT DEFAULT NULL,
  `custom_fields`    JSON DEFAULT NULL,
  `ip_address`       VARCHAR(45) DEFAULT NULL,
  `created_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  FOREIGN KEY (`source_id`)   REFERENCES `lead_sources`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`duplicate_of`) REFERENCES `leads`(`id`) ON DELETE SET NULL,

  INDEX `idx_email`        (`email`),
  INDEX `idx_mobile`       (`mobile`),
  INDEX `idx_source`       (`source_id`),
  INDEX `idx_assigned`     (`assigned_to`),
  INDEX `idx_status`       (`status`),
  INDEX `idx_category`     (`category`),
  INDEX `idx_score`        (`score`),
  INDEX `idx_created`      (`created_at`),
  INDEX `idx_company`      (`company`),
  INDEX `idx_country_state`(`country`, `state`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `lead_tags` (
  `lead_id` INT UNSIGNED NOT NULL,
  `tag_id`  INT UNSIGNED NOT NULL,
  PRIMARY KEY (`lead_id`, `tag_id`),
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`tag_id`)  REFERENCES `tags`(`id`)  ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LEAD SCORE HISTORY
-- ============================================================

CREATE TABLE IF NOT EXISTS `lead_score_events` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lead_id`    INT UNSIGNED NOT NULL,
  `event`      VARCHAR(80) NOT NULL,   -- email_open, link_click, wa_read, etc.
  `delta`      SMALLINT NOT NULL,      -- +10, -5, etc.
  `score_after`SMALLINT UNSIGNED NOT NULL,
  `ref_type`   VARCHAR(50) DEFAULT NULL, -- 'communication', 'meeting', 'deal'
  `ref_id`     INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  INDEX `idx_lead`    (`lead_id`),
  INDEX `idx_event`   (`event`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LEAD SEGMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS `segments` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(120) NOT NULL,
  `type`       ENUM('static','dynamic') NOT NULL DEFAULT 'dynamic',
  `conditions` JSON DEFAULT NULL,   -- filter rules for dynamic segment
  `count`      INT UNSIGNED NOT NULL DEFAULT 0,
  `created_by` INT UNSIGNED DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `segment_leads` (
  `segment_id` INT UNSIGNED NOT NULL,
  `lead_id`    INT UNSIGNED NOT NULL,
  `added_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`segment_id`, `lead_id`),
  FOREIGN KEY (`segment_id`) REFERENCES `segments`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lead_id`)    REFERENCES `leads`(`id`)    ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TEMPLATES (Email / WhatsApp / RCS / SMS)
-- ============================================================

CREATE TABLE IF NOT EXISTS `templates` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(150) NOT NULL,
  `channel`     ENUM('email','whatsapp','rcs','sms') NOT NULL,
  `subject`     VARCHAR(255) DEFAULT NULL,          -- email only
  `body`        MEDIUMTEXT NOT NULL,
  `variables`   JSON DEFAULT NULL,                   -- {{name}}, {{company}}, etc.
  `wa_template_id` VARCHAR(100) DEFAULT NULL,        -- WhatsApp template name
  `media_url`   VARCHAR(500) DEFAULT NULL,
  `buttons`     JSON DEFAULT NULL,                   -- WA / RCS interactive buttons
  `status`      ENUM('draft','active','archived') NOT NULL DEFAULT 'draft',
  `created_by`  INT UNSIGNED DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_channel` (`channel`),
  INDEX `idx_status`  (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CAMPAIGNS & WORKFLOWS
-- ============================================================

CREATE TABLE IF NOT EXISTS `campaigns` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`        VARCHAR(200) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `type`        ENUM('drip','broadcast','trigger') NOT NULL DEFAULT 'drip',
  `status`      ENUM('draft','active','paused','archived') NOT NULL DEFAULT 'draft',
  `goal`        VARCHAR(255) DEFAULT NULL,          -- 'meeting_booked', 'purchase', etc.
  `entry_rules` JSON DEFAULT NULL,                   -- auto-enroll conditions
  `exit_rules`  JSON DEFAULT NULL,
  `created_by`  INT UNSIGNED DEFAULT NULL,
  `start_at`    DATETIME DEFAULT NULL,
  `end_at`      DATETIME DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`created_by`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_status` (`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `workflow_steps` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `campaign_id`   INT UNSIGNED NOT NULL,
  `parent_id`     INT UNSIGNED DEFAULT NULL,           -- NULL = first step
  `step_order`    SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  `type`          ENUM('send_email','send_whatsapp','send_rcs','send_sms',
                       'wait','condition','assign_agent','create_task',
                       'update_score','move_pipeline','exit') NOT NULL,
  `template_id`   INT UNSIGNED DEFAULT NULL,
  `delay_value`   SMALLINT UNSIGNED DEFAULT 0,
  `delay_unit`    ENUM('minutes','hours','days') DEFAULT 'days',
  `condition`     JSON DEFAULT NULL,                   -- branch conditions
  `action_data`   JSON DEFAULT NULL,                   -- extra config per type
  `yes_next_id`   INT UNSIGNED DEFAULT NULL,           -- condition true branch
  `no_next_id`    INT UNSIGNED DEFAULT NULL,           -- condition false branch
  `created_at`    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`parent_id`)   REFERENCES `workflow_steps`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`template_id`) REFERENCES `templates`(`id`) ON DELETE SET NULL,
  INDEX `idx_campaign` (`campaign_id`),
  INDEX `idx_order`    (`campaign_id`, `step_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- LEAD ENROLLMENTS
-- ============================================================

CREATE TABLE IF NOT EXISTS `lead_enrollments` (
  `id`              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lead_id`         INT UNSIGNED NOT NULL,
  `campaign_id`     INT UNSIGNED NOT NULL,
  `current_step_id` INT UNSIGNED DEFAULT NULL,
  `status`          ENUM('active','paused','completed','exited','converted') NOT NULL DEFAULT 'active',
  `next_execute_at` DATETIME DEFAULT NULL,
  `enrolled_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `completed_at`    DATETIME DEFAULT NULL,
  `exit_reason`     VARCHAR(255) DEFAULT NULL,
  FOREIGN KEY (`lead_id`)         REFERENCES `leads`(`id`)          ON DELETE CASCADE,
  FOREIGN KEY (`campaign_id`)     REFERENCES `campaigns`(`id`)      ON DELETE CASCADE,
  FOREIGN KEY (`current_step_id`) REFERENCES `workflow_steps`(`id`) ON DELETE SET NULL,
  UNIQUE KEY `uniq_lead_campaign` (`lead_id`, `campaign_id`),
  INDEX `idx_status`       (`status`),
  INDEX `idx_next_execute` (`next_execute_at`),
  INDEX `idx_campaign`     (`campaign_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `enrollment_step_logs` (
  `id`            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `enrollment_id` INT UNSIGNED NOT NULL,
  `step_id`       INT UNSIGNED NOT NULL,
  `status`        ENUM('pending','executed','skipped','failed') NOT NULL DEFAULT 'pending',
  `executed_at`   DATETIME DEFAULT NULL,
  `result`        JSON DEFAULT NULL,     -- delivery status, errors, etc.
  FOREIGN KEY (`enrollment_id`) REFERENCES `lead_enrollments`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`step_id`)       REFERENCES `workflow_steps`(`id`)   ON DELETE CASCADE,
  INDEX `idx_enrollment` (`enrollment_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- COMMUNICATIONS LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS `communications` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lead_id`        INT UNSIGNED NOT NULL,
  `enrollment_id`  INT UNSIGNED DEFAULT NULL,
  `step_id`        INT UNSIGNED DEFAULT NULL,
  `channel`        ENUM('email','whatsapp','rcs','sms') NOT NULL,
  `template_id`    INT UNSIGNED DEFAULT NULL,
  `to_address`     VARCHAR(255) NOT NULL,   -- email or phone
  `subject`        VARCHAR(255) DEFAULT NULL,
  `body_rendered`  MEDIUMTEXT DEFAULT NULL,
  `provider`       VARCHAR(60) DEFAULT NULL,  -- sendgrid, ses, mailgun, twilio, etc.
  `provider_msg_id`VARCHAR(255) DEFAULT NULL, -- provider's message ID for tracking
  `status`         ENUM('queued','sent','delivered','opened','clicked','replied',
                        'bounced','failed','unsubscribed') NOT NULL DEFAULT 'queued',
  `sent_at`        DATETIME DEFAULT NULL,
  `delivered_at`   DATETIME DEFAULT NULL,
  `opened_at`      DATETIME DEFAULT NULL,
  `clicked_at`     DATETIME DEFAULT NULL,
  `replied_at`     DATETIME DEFAULT NULL,
  `failed_reason`  VARCHAR(500) DEFAULT NULL,
  `metadata`       JSON DEFAULT NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lead_id`)       REFERENCES `leads`(`id`)          ON DELETE CASCADE,
  FOREIGN KEY (`enrollment_id`) REFERENCES `lead_enrollments`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`step_id`)       REFERENCES `workflow_steps`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`template_id`)   REFERENCES `templates`(`id`)      ON DELETE SET NULL,
  INDEX `idx_lead`       (`lead_id`),
  INDEX `idx_channel`    (`channel`),
  INDEX `idx_status`     (`status`),
  INDEX `idx_provider_id`(`provider_msg_id`),
  INDEX `idx_created`    (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `email_link_clicks` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `communication_id` INT UNSIGNED NOT NULL,
  `lead_id`          INT UNSIGNED NOT NULL,
  `url`              VARCHAR(2048) NOT NULL,
  `clicked_at`       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `ip`               VARCHAR(45) DEFAULT NULL,
  `user_agent`       VARCHAR(512) DEFAULT NULL,
  FOREIGN KEY (`communication_id`) REFERENCES `communications`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`lead_id`)          REFERENCES `leads`(`id`)          ON DELETE CASCADE,
  INDEX `idx_comm`  (`communication_id`),
  INDEX `idx_lead`  (`lead_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- JOB QUEUE (replaces RabbitMQ for Hostinger shared/VPS)
-- ============================================================

CREATE TABLE IF NOT EXISTS `jobs` (
  `id`           BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `queue`        VARCHAR(60) NOT NULL DEFAULT 'default',
  `payload`      LONGTEXT NOT NULL,
  `attempts`     TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `max_attempts` TINYINT UNSIGNED NOT NULL DEFAULT 3,
  `status`       ENUM('pending','processing','done','failed') NOT NULL DEFAULT 'pending',
  `available_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `reserved_at`  DATETIME DEFAULT NULL,
  `failed_at`    DATETIME DEFAULT NULL,
  `error`        TEXT DEFAULT NULL,
  `created_at`   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX `idx_queue_status` (`queue`, `status`, `available_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- CRM PIPELINE
-- ============================================================

CREATE TABLE IF NOT EXISTS `pipeline_stages` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(80) NOT NULL,
  `stage_order`TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `color`      VARCHAR(7) NOT NULL DEFAULT '#0d6efd',
  `is_won`     TINYINT(1) NOT NULL DEFAULT 0,
  `is_lost`    TINYINT(1) NOT NULL DEFAULT 0,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `deals` (
  `id`             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title`          VARCHAR(255) NOT NULL,
  `lead_id`        INT UNSIGNED NOT NULL,
  `stage_id`       INT UNSIGNED NOT NULL,
  `assigned_to`    INT UNSIGNED DEFAULT NULL,
  `value`          DECIMAL(14,2) DEFAULT 0.00,
  `currency`       VARCHAR(3) NOT NULL DEFAULT 'INR',
  `probability`    TINYINT UNSIGNED NOT NULL DEFAULT 0,
  `expected_close` DATE DEFAULT NULL,
  `actual_close`   DATE DEFAULT NULL,
  `won_at`         DATETIME DEFAULT NULL,
  `lost_at`        DATETIME DEFAULT NULL,
  `lost_reason`    VARCHAR(255) DEFAULT NULL,
  `source_id`      INT UNSIGNED DEFAULT NULL,
  `campaign_id`    INT UNSIGNED DEFAULT NULL,
  `notes`          TEXT DEFAULT NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`lead_id`)     REFERENCES `leads`(`id`)           ON DELETE CASCADE,
  FOREIGN KEY (`stage_id`)    REFERENCES `pipeline_stages`(`id`) ON DELETE RESTRICT,
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`)           ON DELETE SET NULL,
  FOREIGN KEY (`source_id`)   REFERENCES `lead_sources`(`id`)    ON DELETE SET NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`)       ON DELETE SET NULL,
  INDEX `idx_lead`    (`lead_id`),
  INDEX `idx_stage`   (`stage_id`),
  INDEX `idx_assigned`(`assigned_to`),
  INDEX `idx_close`   (`expected_close`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `deal_stage_history` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `deal_id`     INT UNSIGNED NOT NULL,
  `from_stage`  INT UNSIGNED DEFAULT NULL,
  `to_stage`    INT UNSIGNED NOT NULL,
  `changed_by`  INT UNSIGNED DEFAULT NULL,
  `changed_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `time_in_prev_stage` INT UNSIGNED DEFAULT NULL, -- seconds
  FOREIGN KEY (`deal_id`)    REFERENCES `deals`(`id`)           ON DELETE CASCADE,
  FOREIGN KEY (`from_stage`) REFERENCES `pipeline_stages`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`to_stage`)   REFERENCES `pipeline_stages`(`id`) ON DELETE RESTRICT,
  INDEX `idx_deal` (`deal_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- ACTIVITIES (Notes, Calls, Meetings, Emails manual)
-- ============================================================

CREATE TABLE IF NOT EXISTS `activities` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `type`        ENUM('note','call','meeting','email','whatsapp','document','quotation','invoice','task') NOT NULL,
  `lead_id`     INT UNSIGNED DEFAULT NULL,
  `deal_id`     INT UNSIGNED DEFAULT NULL,
  `user_id`     INT UNSIGNED DEFAULT NULL,
  `subject`     VARCHAR(255) DEFAULT NULL,
  `body`        TEXT DEFAULT NULL,
  `file_path`   VARCHAR(500) DEFAULT NULL,
  `amount`      DECIMAL(14,2) DEFAULT NULL,  -- quotation/invoice
  `due_at`      DATETIME DEFAULT NULL,
  `done`        TINYINT(1) NOT NULL DEFAULT 0,
  `done_at`     DATETIME DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_lead`    (`lead_id`),
  INDEX `idx_deal`    (`deal_id`),
  INDEX `idx_user`    (`user_id`),
  INDEX `idx_type`    (`type`),
  INDEX `idx_due`     (`due_at`),
  INDEX `idx_done`    (`done`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- TASKS (follow-ups, reminders)
-- ============================================================

CREATE TABLE IF NOT EXISTS `tasks` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title`       VARCHAR(255) NOT NULL,
  `description` TEXT DEFAULT NULL,
  `lead_id`     INT UNSIGNED DEFAULT NULL,
  `deal_id`     INT UNSIGNED DEFAULT NULL,
  `assigned_to` INT UNSIGNED DEFAULT NULL,
  `created_by`  INT UNSIGNED DEFAULT NULL,
  `priority`    ENUM('low','medium','high','urgent') NOT NULL DEFAULT 'medium',
  `due_at`      DATETIME DEFAULT NULL,
  `done`        TINYINT(1) NOT NULL DEFAULT 0,
  `done_at`     DATETIME DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lead_id`)     REFERENCES `leads`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`deal_id`)     REFERENCES `deals`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`assigned_to`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`created_by`)  REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_assigned` (`assigned_to`),
  INDEX `idx_due`      (`due_at`),
  INDEX `idx_done`     (`done`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- MEETINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS `meetings` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `title`       VARCHAR(255) NOT NULL,
  `lead_id`     INT UNSIGNED DEFAULT NULL,
  `deal_id`     INT UNSIGNED DEFAULT NULL,
  `host_id`     INT UNSIGNED DEFAULT NULL,
  `platform`    VARCHAR(60) DEFAULT NULL,  -- Zoom, Google Meet, etc.
  `meeting_url` VARCHAR(500) DEFAULT NULL,
  `scheduled_at`DATETIME NOT NULL,
  `duration`    SMALLINT UNSIGNED DEFAULT 30, -- minutes
  `status`      ENUM('scheduled','completed','cancelled','no_show') NOT NULL DEFAULT 'scheduled',
  `notes`       TEXT DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`deal_id`) REFERENCES `deals`(`id`) ON DELETE CASCADE,
  FOREIGN KEY (`host_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_lead`      (`lead_id`),
  INDEX `idx_scheduled` (`scheduled_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- REVENUE / CONVERSIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS `revenue_records` (
  `id`          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `deal_id`     INT UNSIGNED NOT NULL,
  `lead_id`     INT UNSIGNED NOT NULL,
  `source_id`   INT UNSIGNED DEFAULT NULL,
  `campaign_id` INT UNSIGNED DEFAULT NULL,
  `agent_id`    INT UNSIGNED DEFAULT NULL,
  `amount`      DECIMAL(14,2) NOT NULL,
  `currency`    VARCHAR(3) NOT NULL DEFAULT 'INR',
  `type`        ENUM('one_time','recurring','upsell','renewal') NOT NULL DEFAULT 'one_time',
  `recorded_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`deal_id`)     REFERENCES `deals`(`id`)        ON DELETE CASCADE,
  FOREIGN KEY (`lead_id`)     REFERENCES `leads`(`id`)        ON DELETE CASCADE,
  FOREIGN KEY (`source_id`)   REFERENCES `lead_sources`(`id`) ON DELETE SET NULL,
  FOREIGN KEY (`campaign_id`) REFERENCES `campaigns`(`id`)    ON DELETE SET NULL,
  FOREIGN KEY (`agent_id`)    REFERENCES `users`(`id`)        ON DELETE SET NULL,
  INDEX `idx_deal`     (`deal_id`),
  INDEX `idx_campaign` (`campaign_id`),
  INDEX `idx_source`   (`source_id`),
  INDEX `idx_agent`    (`agent_id`),
  INDEX `idx_date`     (`recorded_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- INTEGRATIONS CONFIG
-- ============================================================

CREATE TABLE IF NOT EXISTS `integrations` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `name`       VARCHAR(100) NOT NULL,
  `slug`       VARCHAR(60) NOT NULL UNIQUE,
  `type`       ENUM('crm','marketing','communication','marketplace','erp','analytics','other') NOT NULL,
  `is_active`  TINYINT(1) NOT NULL DEFAULT 0,
  `config`     JSON DEFAULT NULL,   -- encrypted API keys stored here
  `webhook_url`VARCHAR(500) DEFAULT NULL,
  `webhook_secret` VARCHAR(255) DEFAULT NULL,
  `last_sync`  DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_logs` (
  `id`             BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `integration_id` INT UNSIGNED DEFAULT NULL,
  `source`         VARCHAR(80) NOT NULL,
  `event`          VARCHAR(100) DEFAULT NULL,
  `payload`        LONGTEXT DEFAULT NULL,
  `status`         ENUM('received','processed','failed','ignored') NOT NULL DEFAULT 'received',
  `error`          TEXT DEFAULT NULL,
  `ip`             VARCHAR(45) DEFAULT NULL,
  `created_at`     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`integration_id`) REFERENCES `integrations`(`id`) ON DELETE SET NULL,
  INDEX `idx_source`  (`source`),
  INDEX `idx_status`  (`status`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AI PREDICTIONS
-- ============================================================

CREATE TABLE IF NOT EXISTS `ai_predictions` (
  `id`               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `lead_id`          INT UNSIGNED NOT NULL,
  `conversion_prob`  DECIMAL(5,4) DEFAULT NULL,   -- 0.0000 - 1.0000
  `intent_score`     TINYINT UNSIGNED DEFAULT NULL, -- 0-100
  `best_channel`     ENUM('email','whatsapp','rcs','sms') DEFAULT NULL,
  `best_time_hour`   TINYINT UNSIGNED DEFAULT NULL, -- 0-23
  `predicted_value`  DECIMAL(14,2) DEFAULT NULL,
  `model_version`    VARCHAR(20) DEFAULT 'v1',
  `computed_at`      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`lead_id`) REFERENCES `leads`(`id`) ON DELETE CASCADE,
  INDEX `idx_lead`    (`lead_id`),
  INDEX `idx_computed`(`computed_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- AUDIT LOG
-- ============================================================

CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id`          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`     INT UNSIGNED DEFAULT NULL,
  `action`      VARCHAR(100) NOT NULL,
  `entity_type` VARCHAR(60) DEFAULT NULL,
  `entity_id`   INT UNSIGNED DEFAULT NULL,
  `old_data`    JSON DEFAULT NULL,
  `new_data`    JSON DEFAULT NULL,
  `ip`          VARCHAR(45) DEFAULT NULL,
  `created_at`  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL,
  INDEX `idx_user`    (`user_id`),
  INDEX `idx_entity`  (`entity_type`, `entity_id`),
  INDEX `idx_created` (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- NOTIFICATION PREFERENCES
-- ============================================================

CREATE TABLE IF NOT EXISTS `notifications` (
  `id`         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  `user_id`    INT UNSIGNED NOT NULL,
  `type`       VARCHAR(80) NOT NULL,
  `title`      VARCHAR(255) NOT NULL,
  `body`       TEXT DEFAULT NULL,
  `link`       VARCHAR(500) DEFAULT NULL,
  `is_read`    TINYINT(1) NOT NULL DEFAULT 0,
  `read_at`    DATETIME DEFAULT NULL,
  `created_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users`(`id`) ON DELETE CASCADE,
  INDEX `idx_user_unread` (`user_id`, `is_read`),
  INDEX `idx_created`     (`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================================
-- SYSTEM SETTINGS
-- ============================================================

CREATE TABLE IF NOT EXISTS `settings` (
  `key`        VARCHAR(100) PRIMARY KEY,
  `value`      TEXT DEFAULT NULL,
  `group`      VARCHAR(60) NOT NULL DEFAULT 'general',
  `updated_at` DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET FOREIGN_KEY_CHECKS = 1;

-- ============================================================
-- SEED: Pipeline Stages
-- ============================================================

INSERT INTO `pipeline_stages` (`name`, `stage_order`, `color`, `is_won`, `is_lost`) VALUES
  ('New Lead',        1, '#6c757d', 0, 0),
  ('Contacted',       2, '#0d6efd', 0, 0),
  ('Qualified',       3, '#6610f2', 0, 0),
  ('Proposal Shared', 4, '#fd7e14', 0, 0),
  ('Negotiation',     5, '#ffc107', 0, 0),
  ('Won',             6, '#198754', 1, 0),
  ('Lost',            7, '#dc3545', 0, 1);

-- ============================================================
-- SEED: Lead Sources
-- ============================================================

INSERT INTO `lead_sources` (`name`, `slug`, `category`) VALUES
  ('IndiaMART',         'indimart',        'marketplace'),
  ('TradeIndia',        'tradeindia',       'marketplace'),
  ('JustDial',          'justdial',         'marketplace'),
  ('G2 Intent',         'g2_intent',        'marketplace'),
  ('Bombora',           'bombora',          'marketplace'),
  ('Meta Lead Ads',     'meta_leads',       'advertising'),
  ('Google Ads',        'google_ads',       'advertising'),
  ('LinkedIn Lead Ads', 'linkedin_leads',   'advertising'),
  ('Contact Form',      'contact_form',     'website'),
  ('Landing Page',      'landing_page',     'website'),
  ('Chatbot',           'chatbot',          'website'),
  ('Website Popup',     'website_popup',    'website'),
  ('Apollo',            'apollo',           'external'),
  ('ZoomInfo',          'zoominfo',         'external'),
  ('Lusha',             'lusha',            'external'),
  ('CSV Upload',        'csv_upload',       'external'),
  ('API Push',          'api_push',         'api'),
  ('QR Lead Capture',   'qr_capture',       'events'),
  ('Manual Entry',      'manual',           'manual');

-- ============================================================
-- SEED: Score Rules in Settings
-- ============================================================

INSERT INTO `settings` (`key`, `value`, `group`) VALUES
  ('score_email_open',          '5',   'scoring'),
  ('score_email_click',         '10',  'scoring'),
  ('score_wa_read',             '10',  'scoring'),
  ('score_wa_reply',            '20',  'scoring'),
  ('score_rcs_click',           '10',  'scoring'),
  ('score_sms_reply',           '5',   'scoring'),
  ('score_website_visit',       '15',  'scoring'),
  ('score_meeting_booked',      '50',  'scoring'),
  ('score_quotation_requested', '75',  'scoring'),
  ('score_purchase_completed',  '100', 'scoring'),
  ('category_cold_min',         '0',   'scoring'),
  ('category_cold_max',         '25',  'scoring'),
  ('category_warm_min',         '26',  'scoring'),
  ('category_warm_max',         '75',  'scoring'),
  ('category_hot_min',          '76',  'scoring'),
  ('category_hot_max',          '150', 'scoring'),
  ('category_sales_ready_min',  '151', 'scoring'),
  ('app_name',    'Dot Domino CRM', 'general'),
  ('timezone',    'Asia/Kolkata',   'general'),
  ('currency',    'INR',            'general'),
  ('smtp_host',   '',               'email'),
  ('smtp_port',   '587',            'email'),
  ('smtp_user',   '',               'email'),
  ('smtp_pass',   '',               'email'),
  ('smtp_from',   '',               'email'),
  ('smtp_from_name', 'Dot Domino',  'email'),
  ('sendgrid_key','',               'email'),
  ('mailgun_key', '',               'email'),
  ('mailgun_domain','',             'email'),
  ('ses_key',     '',               'email'),
  ('ses_secret',  '',               'email'),
  ('ses_region',  'ap-south-1',     'email'),
  ('wa_api_token','',               'whatsapp'),
  ('wa_phone_id', '',               'whatsapp'),
  ('sms_provider','',               'sms'),
  ('sms_api_key', '',               'sms'),
  ('sms_sender',  '',               'sms'),
  ('rcs_api_key', '',               'rcs'),
  ('ai_enabled',  '0',              'ai');

-- SEED: Default admin user (password: Admin@123 — bcrypt)
INSERT INTO `users` (`name`, `email`, `password`, `role`) VALUES
  ('Super Admin', 'admin@dotdomino.com',
   '$2y$12$oAmdmOkdVMYH5kr5xiOR7uRk12Y2/iU9XW5EKt3DxkTLcaoUZXF6i',
   'superadmin');
