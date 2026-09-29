-- 012 CRM lead ingest + Marketing Gmail email campaigns
-- Idempotent / non-destructive. deploy may re-run.

-- crm_leads.external_id for Salesforce / external upserts
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_leads'
    AND COLUMN_NAME = 'external_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE crm_leads ADD COLUMN external_id VARCHAR(191) NULL AFTER source, ADD KEY idx_crm_leads_external (organization_id, source, external_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Unique when external_id present (MySQL allows multiple NULLs)
SET @uq_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'crm_leads'
    AND INDEX_NAME = 'uq_crm_leads_org_source_external'
);
SET @sql_uq := IF(
  @uq_exists = 0,
  'ALTER TABLE crm_leads ADD UNIQUE KEY uq_crm_leads_org_source_external (organization_id, source, external_id)',
  'SELECT 1'
);
PREPARE stmt_uq FROM @sql_uq;
EXECUTE stmt_uq;
DEALLOCATE PREPARE stmt_uq;

CREATE TABLE IF NOT EXISTS crm_integration_keys (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  key_hash VARCHAR(64) NOT NULL,
  key_prefix VARCHAR(32) NULL,
  source ENUM('salesforce', 'hubspot', 'zapier', 'generic') NOT NULL DEFAULT 'generic',
  active TINYINT(1) NOT NULL DEFAULT 1,
  created_by BIGINT UNSIGNED NULL,
  last_used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_integration_keys_hash (key_hash),
  KEY idx_crm_integration_keys_org (organization_id),
  KEY idx_crm_integration_keys_prefix (key_prefix),
  CONSTRAINT fk_crm_integration_keys_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_integration_keys_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marketing_email_campaigns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  subject VARCHAR(500) NOT NULL,
  html_body MEDIUMTEXT NOT NULL,
  status ENUM('draft', 'scheduled', 'sending', 'sent', 'failed') NOT NULL DEFAULT 'draft',
  segment_id BIGINT UNSIGNED NULL,
  source ENUM('crm_leads', 'segment', 'manual') NOT NULL DEFAULT 'crm_leads',
  created_by BIGINT UNSIGNED NULL,
  scheduled_at TIMESTAMP NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mkt_email_camp_org (organization_id),
  KEY idx_mkt_email_camp_status (organization_id, status),
  KEY idx_mkt_email_camp_segment (segment_id),
  CONSTRAINT fk_mkt_email_camp_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_mkt_email_camp_segment FOREIGN KEY (segment_id) REFERENCES segments (id) ON DELETE SET NULL,
  CONSTRAINT fk_mkt_email_camp_user FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS marketing_email_sends (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  campaign_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  lead_id BIGINT UNSIGNED NULL,
  customer_id BIGINT UNSIGNED NULL,
  status ENUM('queued', 'sent', 'failed') NOT NULL DEFAULT 'queued',
  error VARCHAR(1000) NULL,
  sent_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_mkt_email_sends_campaign (campaign_id),
  KEY idx_mkt_email_sends_email (email),
  KEY idx_mkt_email_sends_lead (lead_id),
  KEY idx_mkt_email_sends_status (campaign_id, status),
  CONSTRAINT fk_mkt_email_sends_campaign FOREIGN KEY (campaign_id) REFERENCES marketing_email_campaigns (id) ON DELETE CASCADE,
  CONSTRAINT fk_mkt_email_sends_lead FOREIGN KEY (lead_id) REFERENCES crm_leads (id) ON DELETE SET NULL,
  CONSTRAINT fk_mkt_email_sends_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
