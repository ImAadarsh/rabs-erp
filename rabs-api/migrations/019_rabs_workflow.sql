-- RABS Carpets & Furniture — one-click CRM workflow
-- Enquiry → Appointment → Measure → Quote → Accepted → Deposit → Materials → Fitting/Delivery → Complete → Balance → Closed
-- MySQL 8.4 compatible (no ADD COLUMN IF NOT EXISTS). Idempotent via CREATE TABLE IF NOT EXISTS.

CREATE TABLE IF NOT EXISTS rabs_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  vat_rate DECIMAL(6,4) NOT NULL DEFAULT 0.2000,
  prices_include_vat TINYINT(1) NOT NULL DEFAULT 0,
  deposit_mode ENUM('percent','fixed','none') NOT NULL DEFAULT 'percent',
  deposit_percent DECIMAL(6,2) NOT NULL DEFAULT 25.00,
  deposit_fixed_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  deposit_min_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  auto_close_when_paid TINYINT(1) NOT NULL DEFAULT 0,
  default_delivery_charge DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  quote_validity_days INT NOT NULL DEFAULT 30,
  job_prefix VARCHAR(20) NOT NULL DEFAULT 'RJ-',
  quote_prefix VARCHAR(20) NOT NULL DEFAULT 'Q-',
  invoice_prefix VARCHAR(20) NOT NULL DEFAULT 'INV-',
  next_job_number INT NOT NULL DEFAULT 1001,
  next_quote_number INT NOT NULL DEFAULT 10001,
  next_invoice_number INT NOT NULL DEFAULT 5001,
  document_footer TEXT NULL,
  quote_terms TEXT NULL,
  company_details JSON NULL,
  role_permissions JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rabs_settings_org (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_statuses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(40) NOT NULL,
  label VARCHAR(80) NOT NULL,
  color VARCHAR(20) NOT NULL,
  text_color VARCHAR(20) NOT NULL DEFAULT '#FFFFFF',
  stage VARCHAR(30) NOT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  next_action_label VARCHAR(80) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rabs_status (organization_id, code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_products (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(60) NOT NULL,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(60) NOT NULL,
  kind ENUM('flooring','accessory','furniture','service') NOT NULL DEFAULT 'flooring',
  unit ENUM('m2','sqyd','linear_m','item','pack','roll') NOT NULL DEFAULT 'm2',
  calc_method ENUM('per_m2','per_sqyd','per_linear_m','per_item','per_pack') NOT NULL DEFAULT 'per_m2',
  roll_width_m DECIMAL(6,2) NULL,
  pack_coverage_m2 DECIMAL(8,3) NULL,
  wastage_percent DECIMAL(6,2) NOT NULL DEFAULT 0.00,
  cost_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sell_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  accessory_basis ENUM('area','perimeter','door','each') NULL,
  accessory_factor DECIMAL(8,3) NULL,
  applies_to JSON NULL,
  default_selected TINYINT(1) NOT NULL DEFAULT 0,
  variant_id BIGINT UNSIGNED NULL,
  colour VARCHAR(120) NULL,
  supplier VARCHAR(120) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rabs_product_code (organization_id, code),
  KEY idx_rabs_product_cat (organization_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_labour_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(120) NOT NULL,
  category VARCHAR(60) NOT NULL DEFAULT 'ANY',
  room_type VARCHAR(60) NULL,
  basis ENUM('per_m2','per_sqyd','per_room','per_stair','per_item','fixed') NOT NULL DEFAULT 'per_m2',
  cost_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  sell_rate DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  min_charge DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rabs_labour_org (organization_id, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_price_audit (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  entity VARCHAR(40) NOT NULL,
  entity_id BIGINT UNSIGNED NULL,
  entity_label VARCHAR(255) NULL,
  field VARCHAR(60) NOT NULL,
  old_value VARCHAR(255) NULL,
  new_value VARCHAR(255) NULL,
  changed_by BIGINT UNSIGNED NULL,
  changed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rabs_audit_org (organization_id, changed_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_customers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NULL,
  name VARCHAR(160) NOT NULL,
  phone VARCHAR(40) NULL,
  email VARCHAR(190) NULL,
  address_line1 VARCHAR(190) NULL,
  address_line2 VARCHAR(190) NULL,
  city VARCHAR(100) NULL,
  postcode VARCHAR(20) NULL,
  source VARCHAR(60) NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rabs_cust_org (organization_id),
  KEY idx_rabs_cust_phone (phone),
  KEY idx_rabs_cust_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_jobs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_number VARCHAR(40) NOT NULL,
  rabs_customer_id BIGINT UNSIGNED NOT NULL,
  status VARCHAR(40) NOT NULL DEFAULT 'NEW',
  title VARCHAR(190) NULL,
  site_address VARCHAR(255) NULL,
  requires_fitting TINYINT(1) NOT NULL DEFAULT 1,
  requires_delivery TINYINT(1) NOT NULL DEFAULT 0,
  surveyor_user_id BIGINT UNSIGNED NULL,
  accepted_quote_id BIGINT UNSIGNED NULL,
  converted_at DATETIME NULL,
  total_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  deposit_required DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  balance_due DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  materials_status ENUM('not_checked','pending','ready') NOT NULL DEFAULT 'not_checked',
  has_issue TINYINT(1) NOT NULL DEFAULT 0,
  issue_note TEXT NULL,
  notes TEXT NULL,
  completed_at DATETIME NULL,
  closed_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rabs_job_number (organization_id, job_number),
  KEY idx_rabs_job_status (organization_id, status),
  KEY idx_rabs_job_customer (rabs_customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_appointments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  scheduled_at DATETIME NOT NULL,
  duration_min INT NOT NULL DEFAULT 60,
  purpose VARCHAR(40) NOT NULL DEFAULT 'measure',
  staff_user_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  status ENUM('booked','done','cancelled') NOT NULL DEFAULT 'booked',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rabs_appt_job (job_id),
  KEY idx_rabs_appt_when (organization_id, scheduled_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_measurements (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  appointment_id BIGINT UNSIGNED NULL,
  status ENUM('draft','complete') NOT NULL DEFAULT 'draft',
  notes TEXT NULL,
  measured_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rabs_meas_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_rooms (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  measurement_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(80) NOT NULL,
  unit_input ENUM('m','ftin') NOT NULL DEFAULT 'm',
  length_ft INT NULL,
  length_in DECIMAL(5,2) NULL,
  width_ft INT NULL,
  width_in DECIMAL(5,2) NULL,
  length_m DECIMAL(8,3) NOT NULL DEFAULT 0,
  width_m DECIMAL(8,3) NOT NULL DEFAULT 0,
  area_m2 DECIMAL(10,2) NOT NULL DEFAULT 0,
  area_sqyd DECIMAL(10,2) NOT NULL DEFAULT 0,
  perimeter_m DECIMAL(10,2) NOT NULL DEFAULT 0,
  doors INT NOT NULL DEFAULT 1,
  stairs INT NOT NULL DEFAULT 0,
  product_id BIGINT UNSIGNED NULL,
  product_qty DECIMAL(10,2) NULL,
  notes TEXT NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rabs_room_meas (measurement_id),
  KEY idx_rabs_room_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_room_accessories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  room_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NOT NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  UNIQUE KEY uq_rabs_room_acc (room_id, product_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_files (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NULL,
  booking_id BIGINT UNSIGNED NULL,
  kind ENUM('room_photo','before','after','signature','document','other') NOT NULL DEFAULT 'other',
  url VARCHAR(600) NOT NULL,
  storage_key VARCHAR(400) NULL,
  mime_type VARCHAR(120) NULL,
  size_bytes INT NULL,
  caption VARCHAR(255) NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rabs_files_job (job_id),
  KEY idx_rabs_files_room (room_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_quotes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  measurement_id BIGINT UNSIGNED NULL,
  quote_number VARCHAR(40) NOT NULL,
  version INT NOT NULL DEFAULT 1,
  status ENUM('draft','sent','accepted','superseded','declined') NOT NULL DEFAULT 'draft',
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_type ENUM('none','percent','fixed') NOT NULL DEFAULT 'none',
  discount_value DECIMAL(12,2) NOT NULL DEFAULT 0,
  discount_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  delivery_charge DECIMAL(12,2) NOT NULL DEFAULT 0,
  net_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_rate DECIMAL(6,4) NOT NULL DEFAULT 0.2000,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  deposit_required DECIMAL(12,2) NOT NULL DEFAULT 0,
  cost_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  margin_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  margin_percent DECIMAL(6,2) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  valid_until DATE NULL,
  sent_at DATETIME NULL,
  accepted_at DATETIME NULL,
  accepted_by_name VARCHAR(160) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rabs_quote_ver (organization_id, quote_number, version),
  KEY idx_rabs_quote_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_quote_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  quote_id BIGINT UNSIGNED NOT NULL,
  room_id BIGINT UNSIGNED NULL,
  room_name VARCHAR(80) NULL,
  line_type ENUM('product','accessory','labour','custom') NOT NULL DEFAULT 'product',
  product_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  qty DECIMAL(10,2) NOT NULL DEFAULT 0,
  unit VARCHAR(20) NOT NULL DEFAULT 'item',
  unit_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  unit_price DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_cost DECIMAL(12,2) NOT NULL DEFAULT 0,
  line_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  meta JSON NULL,
  sort_order INT NOT NULL DEFAULT 0,
  KEY idx_rabs_ql_quote (quote_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_variations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(255) NOT NULL,
  net_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  status ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
  approved_at DATETIME NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rabs_var_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  quote_id BIGINT UNSIGNED NULL,
  invoice_number VARCHAR(40) NOT NULL,
  status ENUM('issued','part_paid','paid') NOT NULL DEFAULT 'issued',
  net_total DECIMAL(12,2) NOT NULL DEFAULT 0,
  vat_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0,
  `lines` JSON NULL,
  issued_at DATETIME NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_rabs_invoice_number (organization_id, invoice_number),
  UNIQUE KEY uq_rabs_invoice_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('deposit','part','balance','refund') NOT NULL DEFAULT 'part',
  method ENUM('cash','card','bank_transfer','finance','cheque','other') NOT NULL DEFAULT 'card',
  amount DECIMAL(12,2) NOT NULL,
  paid_at DATETIME NOT NULL,
  reference VARCHAR(120) NULL,
  notes VARCHAR(255) NULL,
  recorded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_rabs_pay_job (job_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_material_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  product_id BIGINT UNSIGNED NULL,
  description VARCHAR(255) NOT NULL,
  unit VARCHAR(20) NOT NULL DEFAULT 'item',
  qty_required DECIMAL(10,2) NOT NULL DEFAULT 0,
  qty_reserved INT NOT NULL DEFAULT 0,
  qty_short INT NOT NULL DEFAULT 0,
  variant_id BIGINT UNSIGNED NULL,
  status ENUM('reserved','to_order','ordered','received','not_tracked') NOT NULL DEFAULT 'not_tracked',
  checked_at DATETIME NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rabs_mat_job (job_id),
  KEY idx_rabs_mat_status (organization_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_bookings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  type ENUM('fitting','delivery') NOT NULL,
  scheduled_date DATE NOT NULL,
  slot VARCHAR(20) NOT NULL DEFAULT 'AM',
  staff_user_id BIGINT UNSIGNED NULL,
  status ENUM('booked','in_progress','complete','cancelled') NOT NULL DEFAULT 'booked',
  instructions TEXT NULL,
  checklist JSON NULL,
  signed_name VARCHAR(160) NULL,
  signature_file_id BIGINT UNSIGNED NULL,
  signed_at DATETIME NULL,
  started_at DATETIME NULL,
  completed_at DATETIME NULL,
  completion_notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  KEY idx_rabs_book_job (job_id),
  KEY idx_rabs_book_when (organization_id, scheduled_date),
  KEY idx_rabs_book_staff (staff_user_id, scheduled_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS rabs_timeline (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  event VARCHAR(60) NOT NULL,
  message VARCHAR(500) NOT NULL,
  meta JSON NULL,
  user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  KEY idx_rabs_tl_job (job_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
