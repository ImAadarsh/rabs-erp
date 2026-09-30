-- B2B Sale Channel: portal settings, retailer accounts, customer credit fields
-- deploy.sh re-runs every migration, so this must stay re-runnable.

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS credit_limit DECIMAL(15,4) NOT NULL DEFAULT 0.0000 AFTER notes,
  ADD COLUMN IF NOT EXISTS credit_used DECIMAL(15,4) NOT NULL DEFAULT 0.0000 AFTER credit_limit,
  ADD COLUMN IF NOT EXISTS payment_terms VARCHAR(100) NULL AFTER credit_used;

CREATE TABLE IF NOT EXISTS b2b_portal_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  enabled TINYINT(1) NOT NULL DEFAULT 1,
  publish_mode ENUM('all_active', 'mapped_only') NOT NULL DEFAULT 'all_active',
  default_price_list_id BIGINT UNSIGNED NULL,
  default_warehouse_id BIGINT UNSIGNED NULL,
  assigned_rep_name VARCHAR(255) NULL,
  assigned_rep_phone VARCHAR(50) NULL,
  assigned_rep_email VARCHAR(255) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_b2b_settings_org (organization_id),
  CONSTRAINT fk_b2b_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_b2b_settings_price_list FOREIGN KEY (default_price_list_id) REFERENCES price_lists (id) ON DELETE SET NULL,
  CONSTRAINT fk_b2b_settings_warehouse FOREIGN KEY (default_warehouse_id) REFERENCES warehouses (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS retailer_accounts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  email VARCHAR(255) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  status ENUM('active', 'invited', 'disabled') NOT NULL DEFAULT 'active',
  last_login_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_retailer_org_email (organization_id, email),
  UNIQUE KEY uq_retailer_customer (customer_id),
  KEY idx_retailer_org (organization_id),
  CONSTRAINT fk_retailer_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_retailer_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
