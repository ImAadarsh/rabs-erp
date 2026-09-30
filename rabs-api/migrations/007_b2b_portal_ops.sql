-- B2B portal operations: shipping, shipments, notifications, referrals, credit requests, buyers
-- deploy.sh re-runs every migration; keep statements idempotent.

ALTER TABLE b2b_portal_settings
  ADD COLUMN IF NOT EXISTS bank_transfer_instructions TEXT NULL AFTER assigned_rep_email,
  ADD COLUMN IF NOT EXISTS referral_reward_amount DECIMAL(15,4) NOT NULL DEFAULT 100.0000 AFTER bank_transfer_instructions,
  ADD COLUMN IF NOT EXISTS payment_provider_notes TEXT NULL AFTER referral_reward_amount;

CREATE TABLE IF NOT EXISTS b2b_shipping_methods (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT NULL,
  price DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  eta_label VARCHAR(255) NULL,
  icon VARCHAR(32) NOT NULL DEFAULT 'truck',
  min_order_amount DECIMAL(15,4) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_b2b_ship_org_code (organization_id, code),
  KEY idx_b2b_ship_org (organization_id),
  CONSTRAINT fk_b2b_ship_org FOREIGN KEY (organization_id) REFERENCES organizations (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_shipments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  order_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  carrier VARCHAR(100) NULL,
  tracking_number VARCHAR(255) NULL,
  status ENUM('pending', 'picking', 'packed', 'dispatched', 'in_transit', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  shipping_method_code VARCHAR(64) NULL,
  shipping_method_name VARCHAR(255) NULL,
  estimated_delivery_at TIMESTAMP NULL,
  dispatched_at TIMESTAMP NULL,
  delivered_at TIMESTAMP NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_b2b_shipments_org (organization_id),
  KEY idx_b2b_shipments_order (order_id),
  KEY idx_b2b_shipments_customer (customer_id),
  CONSTRAINT fk_b2b_shipments_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_b2b_shipments_order FOREIGN KEY (order_id) REFERENCES orders (id),
  CONSTRAINT fk_b2b_shipments_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_shipment_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  shipment_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(64) NOT NULL,
  message VARCHAR(500) NOT NULL,
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_b2b_ship_events_shipment (shipment_id),
  CONSTRAINT fk_b2b_ship_events_shipment FOREIGN KEY (shipment_id) REFERENCES b2b_shipments (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_notifications (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  message TEXT NOT NULL,
  type ENUM('promo', 'system', 'delivery', 'credit') NOT NULL DEFAULT 'system',
  action_url VARCHAR(500) NULL,
  is_read TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_b2b_notif_customer (customer_id, is_read),
  KEY idx_b2b_notif_org (organization_id),
  CONSTRAINT fk_b2b_notif_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_b2b_notif_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_notification_preferences (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id BIGINT UNSIGNED NOT NULL,
  price_alerts TINYINT(1) NOT NULL DEFAULT 1,
  stock_sms TINYINT(1) NOT NULL DEFAULT 1,
  order_updates TINYINT(1) NOT NULL DEFAULT 1,
  credit_alerts TINYINT(1) NOT NULL DEFAULT 1,
  marketing TINYINT(1) NOT NULL DEFAULT 0,
  channel_email TINYINT(1) NOT NULL DEFAULT 1,
  channel_sms TINYINT(1) NOT NULL DEFAULT 0,
  channel_whatsapp TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_b2b_notif_prefs_customer (customer_id),
  CONSTRAINT fk_b2b_notif_prefs_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_referrals (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  referrer_customer_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(64) NOT NULL,
  referred_email VARCHAR(255) NULL,
  referred_company VARCHAR(255) NULL,
  status ENUM('active', 'pending', 'qualified', 'rewarded', 'cancelled') NOT NULL DEFAULT 'active',
  reward_amount DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  rewarded_at TIMESTAMP NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_b2b_referral_org_code (organization_id, code),
  KEY idx_b2b_referral_referrer (referrer_customer_id),
  CONSTRAINT fk_b2b_referral_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_b2b_referral_referrer FOREIGN KEY (referrer_customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_credit_requests (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  requested_limit DECIMAL(15,4) NOT NULL,
  current_limit DECIMAL(15,4) NOT NULL,
  reason TEXT NULL,
  status ENUM('pending', 'approved', 'rejected', 'cancelled') NOT NULL DEFAULT 'pending',
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  review_notes TEXT NULL,
  reviewed_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_b2b_credit_req_org (organization_id, status),
  KEY idx_b2b_credit_req_customer (customer_id),
  CONSTRAINT fk_b2b_credit_req_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_b2b_credit_req_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_retailer_buyers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  phone VARCHAR(50) NULL,
  role ENUM('buyer', 'manager', 'viewer') NOT NULL DEFAULT 'buyer',
  spending_cap DECIMAL(15,4) NULL,
  status ENUM('active', 'invited', 'disabled') NOT NULL DEFAULT 'active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_b2b_buyer_customer_email (customer_id, email),
  KEY idx_b2b_buyer_org (organization_id),
  CONSTRAINT fk_b2b_buyer_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_b2b_buyer_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS b2b_credit_ledger (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  entry_type ENUM('invoice', 'payment', 'credit_note', 'adjustment', 'reward') NOT NULL,
  reference VARCHAR(100) NOT NULL,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(15,4) NOT NULL,
  balance_after DECIMAL(15,4) NULL,
  order_id BIGINT UNSIGNED NULL,
  payment_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_b2b_ledger_customer (customer_id, created_at),
  KEY idx_b2b_ledger_org (organization_id),
  CONSTRAINT fk_b2b_ledger_org FOREIGN KEY (organization_id) REFERENCES organizations (id),
  CONSTRAINT fk_b2b_ledger_customer FOREIGN KEY (customer_id) REFERENCES customers (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
