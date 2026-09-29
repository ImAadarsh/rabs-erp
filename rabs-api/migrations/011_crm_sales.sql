-- 011 CRM Sales + Account 360
-- Pipelines, stages, leads, deals, activities, tags; crm_owner on customers.
-- Idempotent / non-destructive. deploy.sh may re-run.

-- Sales / CS roles (codes already used by RBAC elsewhere)
INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'Sales Representative', 'SALES_REP', 'CRM sales & account ownership', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'SALES_REP' AND organization_id = 1);

INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'Customer Service', 'CUSTOMER_SERVICE', 'Customer service / CRM access', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'CUSTOMER_SERVICE' AND organization_id = 1);

INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'CS Agent', 'CS_AGENT', 'Support tickets & CRM', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'CS_AGENT' AND organization_id = 1);

-- Account owner on ERP customers
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customers'
    AND COLUMN_NAME = 'crm_owner_user_id'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE customers ADD COLUMN crm_owner_user_id BIGINT UNSIGNED NULL AFTER status, ADD KEY idx_customers_crm_owner (crm_owner_user_id)',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

SET @fk_exists := (
  SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'customers'
    AND CONSTRAINT_NAME = 'fk_customers_crm_owner'
);
SET @sql_fk := IF(
  @fk_exists = 0,
  'ALTER TABLE customers ADD CONSTRAINT fk_customers_crm_owner FOREIGN KEY (crm_owner_user_id) REFERENCES users (id) ON DELETE SET NULL',
  'SELECT 1'
);
PREPARE stmt_fk FROM @sql_fk;
EXECUTE stmt_fk;
DEALLOCATE PREPARE stmt_fk;

CREATE TABLE IF NOT EXISTS crm_pipelines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  type ENUM('onboarding', 'expansion', 'credit') NOT NULL DEFAULT 'onboarding',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_pipelines_org (organization_id),
  KEY idx_crm_pipelines_org_type (organization_id, type),
  CONSTRAINT fk_crm_pipelines_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_stages (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  pipeline_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  position INT NOT NULL DEFAULT 0,
  probability DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  is_won TINYINT(1) NOT NULL DEFAULT 0,
  is_lost TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_stages_pipeline (pipeline_id, position),
  CONSTRAINT fk_crm_stages_pipeline FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_leads (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  company VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  source VARCHAR(100) NULL,
  status ENUM('new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost') NOT NULL DEFAULT 'new',
  owner_user_id BIGINT UNSIGNED NULL,
  affiliate_id BIGINT UNSIGNED NULL,
  converted_customer_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_leads_org (organization_id),
  KEY idx_crm_leads_status (organization_id, status),
  KEY idx_crm_leads_owner (owner_user_id),
  KEY idx_crm_leads_email (organization_id, email),
  CONSTRAINT fk_crm_leads_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_leads_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_leads_affiliate FOREIGN KEY (affiliate_id) REFERENCES affiliates (id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_leads_customer FOREIGN KEY (converted_customer_id) REFERENCES customers (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_deals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  pipeline_id BIGINT UNSIGNED NOT NULL,
  stage_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  amount DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  expected_close DATE NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  status ENUM('open', 'won', 'lost') NOT NULL DEFAULT 'open',
  lost_reason VARCHAR(500) NULL,
  lead_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_deals_org (organization_id),
  KEY idx_crm_deals_status (organization_id, status),
  KEY idx_crm_deals_customer (customer_id),
  KEY idx_crm_deals_pipeline (pipeline_id),
  KEY idx_crm_deals_stage (stage_id),
  KEY idx_crm_deals_owner (owner_user_id),
  CONSTRAINT fk_crm_deals_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_deals_pipeline FOREIGN KEY (pipeline_id) REFERENCES crm_pipelines (id),
  CONSTRAINT fk_crm_deals_stage FOREIGN KEY (stage_id) REFERENCES crm_stages (id),
  CONSTRAINT fk_crm_deals_customer FOREIGN KEY (customer_id) REFERENCES customers (id),
  CONSTRAINT fk_crm_deals_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_deals_lead FOREIGN KEY (lead_id) REFERENCES crm_leads (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_deal_stage_history (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  deal_id BIGINT UNSIGNED NOT NULL,
  from_stage_id BIGINT UNSIGNED NULL,
  to_stage_id BIGINT UNSIGNED NOT NULL,
  changed_by_user_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_deal_hist_deal (deal_id, created_at),
  CONSTRAINT fk_crm_deal_hist_deal FOREIGN KEY (deal_id) REFERENCES crm_deals (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_deal_hist_from FOREIGN KEY (from_stage_id) REFERENCES crm_stages (id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_deal_hist_to FOREIGN KEY (to_stage_id) REFERENCES crm_stages (id),
  CONSTRAINT fk_crm_deal_hist_user FOREIGN KEY (changed_by_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_activities (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  type ENUM('task', 'call', 'meeting', 'note') NOT NULL DEFAULT 'task',
  subject VARCHAR(500) NOT NULL,
  body TEXT NULL,
  due_at TIMESTAMP NULL,
  completed_at TIMESTAMP NULL,
  owner_user_id BIGINT UNSIGNED NULL,
  customer_id BIGINT UNSIGNED NULL,
  lead_id BIGINT UNSIGNED NULL,
  deal_id BIGINT UNSIGNED NULL,
  ticket_id BIGINT UNSIGNED NULL,
  order_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_crm_act_org (organization_id),
  KEY idx_crm_act_owner_due (owner_user_id, due_at, completed_at),
  KEY idx_crm_act_customer (customer_id),
  KEY idx_crm_act_lead (lead_id),
  KEY idx_crm_act_deal (deal_id),
  CONSTRAINT fk_crm_act_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_act_owner FOREIGN KEY (owner_user_id) REFERENCES users (id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_act_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_act_lead FOREIGN KEY (lead_id) REFERENCES crm_leads (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_act_deal FOREIGN KEY (deal_id) REFERENCES crm_deals (id) ON DELETE CASCADE,
  CONSTRAINT fk_crm_act_ticket FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE SET NULL,
  CONSTRAINT fk_crm_act_order FOREIGN KEY (order_id) REFERENCES orders (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_tags (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(100) NOT NULL,
  color VARCHAR(32) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_tags_org_name (organization_id, name),
  CONSTRAINT fk_crm_tags_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS crm_taggables (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  tag_id BIGINT UNSIGNED NOT NULL,
  entity_type ENUM('account', 'lead', 'deal') NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_crm_taggable (tag_id, entity_type, entity_id),
  KEY idx_crm_taggable_entity (entity_type, entity_id),
  CONSTRAINT fk_crm_taggable_tag FOREIGN KEY (tag_id) REFERENCES crm_tags (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
