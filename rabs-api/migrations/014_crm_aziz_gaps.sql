-- 014 CRM Aziz gaps: contacts, lead qualification, deal probability override,
-- settings (auto-assign / follow-up), round-robin cursor.
-- Idempotent / non-destructive.

-- Lead qualification / prioritization
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_leads' AND COLUMN_NAME = 'score'
);

SET @sql := IF(@col = 0,
  'ALTER TABLE crm_leads ADD COLUMN score INT NULL AFTER notes, ADD COLUMN priority ENUM(''low'',''medium'',''high'',''urgent'') NOT NULL DEFAULT ''medium'' AFTER score, ADD COLUMN qualified_at TIMESTAMP NULL AFTER priority, ADD COLUMN disqualified_reason VARCHAR(500) NULL AFTER qualified_at',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Deal probability override (NULL = use stage probability)
SET @col := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'crm_deals' AND COLUMN_NAME = 'probability_override'
);

SET @sql := IF(@col = 0,
  'ALTER TABLE crm_deals ADD COLUMN probability_override DECIMAL(5,2) NULL AFTER amount',
  'SELECT 1');

PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Contacts (people on an account)
CREATE TABLE IF NOT EXISTS crm_contacts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  first_name VARCHAR(120) NOT NULL,
  last_name VARCHAR(120) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  title VARCHAR(150) NULL,
  is_primary TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_contacts_org (organization_id),
  KEY idx_crm_contacts_customer (customer_id),
  KEY idx_crm_contacts_email (organization_id, email),
  CONSTRAINT fk_crm_contacts_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_contacts_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Org CRM settings (auto-assign + follow-up toggles + RR cursor)
CREATE TABLE IF NOT EXISTS crm_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  auto_assign_leads TINYINT(1) NOT NULL DEFAULT 1,
  auto_followup_on_lead TINYINT(1) NOT NULL DEFAULT 1,
  last_assigned_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_settings_org (organization_id),
  CONSTRAINT fk_crm_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_settings_last_user FOREIGN KEY (last_assigned_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
