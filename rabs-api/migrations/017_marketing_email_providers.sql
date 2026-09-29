-- 017 Marketing multi-provider email connectors + campaign builder fields + events
-- Idempotent / non-destructive. deploy may re-run.
-- Note: PREPARE / EXECUTE / DEALLOCATE must each be separate statements (own line + semicolon).

CREATE TABLE IF NOT EXISTS marketing_email_connectors (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('sendgrid', 'gmail_smtp', 'brevo', 'ses', 'mailchimp') NOT NULL,
  name VARCHAR(150) NOT NULL,
  credentials_encrypted TEXT NOT NULL,
  key_hint VARCHAR(64) NULL,
  status ENUM('active', 'inactive', 'error') NOT NULL DEFAULT 'active',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  last_tested_at TIMESTAMP NULL,
  last_test_ok TINYINT(1) NULL,
  last_test_message VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mkt_email_conn_org (organization_id),
  KEY idx_mkt_email_conn_provider (organization_id, provider),
  KEY idx_mkt_email_conn_default (organization_id, is_default),
  CONSTRAINT fk_mkt_email_conn_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_mkt_email_conn_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketing_email_campaigns' AND COLUMN_NAME = 'connector_id'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE marketing_email_campaigns ADD COLUMN connector_id BIGINT UNSIGNED NULL AFTER organization_id, ADD KEY idx_mkt_email_camp_connector (connector_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketing_email_campaigns' AND CONSTRAINT_NAME = 'fk_mkt_email_camp_connector'
);
SET @sql_fk := IF(
  @fk = 0,
  'ALTER TABLE marketing_email_campaigns ADD CONSTRAINT fk_mkt_email_camp_connector FOREIGN KEY (connector_id) REFERENCES marketing_email_connectors (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketing_email_campaigns' AND COLUMN_NAME = 'builder_json'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE marketing_email_campaigns ADD COLUMN builder_json LONGTEXT NULL AFTER html_body',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketing_email_campaigns' AND COLUMN_NAME = 'from_name'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE marketing_email_campaigns ADD COLUMN from_name VARCHAR(255) NULL AFTER subject',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketing_email_campaigns' AND COLUMN_NAME = 'reply_to'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE marketing_email_campaigns ADD COLUMN reply_to VARCHAR(255) NULL AFTER from_name',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'marketing_email_campaigns' AND COLUMN_NAME = 'audience_type'
);
SET @sql := IF(
  @col = 0,
  'ALTER TABLE marketing_email_campaigns ADD COLUMN audience_type ENUM(''crm_leads'', ''segment'', ''manual'') NULL AFTER source',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

UPDATE marketing_email_campaigns
SET audience_type = source
WHERE audience_type IS NULL AND source IS NOT NULL;

CREATE TABLE IF NOT EXISTS marketing_email_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NULL,
  connector_id BIGINT UNSIGNED NULL,
  campaign_id BIGINT UNSIGNED NULL,
  send_id BIGINT UNSIGNED NULL,
  email VARCHAR(255) NULL,
  event_type VARCHAR(64) NOT NULL,
  provider_event_id VARCHAR(191) NULL,
  sg_message_id VARCHAR(191) NULL,
  payload JSON NULL,
  occurred_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mkt_email_evt_org (organization_id),
  KEY idx_mkt_email_evt_campaign (campaign_id),
  KEY idx_mkt_email_evt_type (event_type),
  KEY idx_mkt_email_evt_email (email),
  KEY idx_mkt_email_evt_sg_msg (sg_message_id),
  KEY idx_mkt_email_evt_provider (provider_event_id),
  CONSTRAINT fk_mkt_email_evt_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE SET NULL,
  CONSTRAINT fk_mkt_email_evt_connector FOREIGN KEY (connector_id) REFERENCES marketing_email_connectors (id) ON DELETE SET NULL,
  CONSTRAINT fk_mkt_email_evt_campaign FOREIGN KEY (campaign_id) REFERENCES marketing_email_campaigns (id) ON DELETE SET NULL,
  CONSTRAINT fk_mkt_email_evt_send FOREIGN KEY (send_id) REFERENCES marketing_email_sends (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
