-- 018 UK Accounting MVP (double-entry spine + VAT + invoices/bills + payroll journals).
-- Idempotent / non-destructive. deploy may re-run.
-- Extends existing finance invoices / journals / bank_* / vat_returns — does not duplicate.

-- Roles
INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'Accountant', 'ACCOUNTANT', 'UK accounting: journals, VAT, invoices, bills, reports', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'ACCOUNTANT' AND organization_id = 1);

-- Org accounting settings (VAT scheme flags)
CREATE TABLE IF NOT EXISTS acc_org_settings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  vat_registered TINYINT(1) NOT NULL DEFAULT 1,
  vat_number VARCHAR(20) NULL,
  vat_scheme ENUM('standard','flat_rate','cash_accounting') NOT NULL DEFAULT 'standard',
  flat_rate_percent DECIMAL(5,2) NULL,
  cash_accounting_enabled TINYINT(1) NOT NULL DEFAULT 0,
  flat_rate_enabled TINYINT(1) NOT NULL DEFAULT 0,
  default_currency CHAR(3) NOT NULL DEFAULT 'GBP',
  financial_year_start_month TINYINT NOT NULL DEFAULT 4,
  hmrc_mtd_client_id VARCHAR(255) NULL,
  hmrc_mtd_enabled TINYINT(1) NOT NULL DEFAULT 0,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_acc_org_settings (organization_id),
  CONSTRAINT fk_acc_org_settings_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- VAT codes
CREATE TABLE IF NOT EXISTS acc_vat_codes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  code VARCHAR(20) NOT NULL,
  name VARCHAR(100) NOT NULL,
  rate DECIMAL(7,4) NOT NULL DEFAULT 0.0000,
  is_recoverable TINYINT(1) NOT NULL DEFAULT 1,
  box_sales TINYINT NULL COMMENT 'VAT return box for output',
  box_purchases TINYINT NULL COMMENT 'VAT return box for input',
  is_system TINYINT(1) NOT NULL DEFAULT 0,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_acc_vat_code (organization_id, code),
  KEY idx_acc_vat_codes_org (organization_id),
  CONSTRAINT fk_acc_vat_codes_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Append-only accounting audit trail
CREATE TABLE IF NOT EXISTS acc_audit_events (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  entity_type VARCHAR(80) NOT NULL,
  entity_id BIGINT UNSIGNED NOT NULL,
  action ENUM('create','update','post','approve','void','match','reconcile','submit','dispose','import') NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  payload_json JSON NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_audit_org (organization_id),
  KEY idx_acc_audit_entity (entity_type, entity_id),
  KEY idx_acc_audit_created (created_at),
  CONSTRAINT fk_acc_audit_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_audit_actor FOREIGN KEY (actor_user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extend invoices for UK posting / documents / recurring link
ALTER TABLE invoices ADD COLUMN document_url VARCHAR(1000) NULL;
ALTER TABLE invoices ADD COLUMN journal_entry_id BIGINT UNSIGNED NULL;
ALTER TABLE invoices ADD COLUMN posted_at TIMESTAMP NULL;
ALTER TABLE invoices ADD COLUMN vat_inclusive TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE invoices ADD COLUMN recurring_invoice_id BIGINT UNSIGNED NULL;

ALTER TABLE invoice_lines ADD COLUMN vat_code_id BIGINT UNSIGNED NULL;
ALTER TABLE invoice_lines ADD COLUMN ledger_account_id BIGINT UNSIGNED NULL;

ALTER TABLE credit_notes ADD COLUMN document_url VARCHAR(1000) NULL;
ALTER TABLE credit_notes ADD COLUMN journal_entry_id BIGINT UNSIGNED NULL;
ALTER TABLE credit_notes ADD COLUMN posted_at TIMESTAMP NULL;
ALTER TABLE credit_notes ADD COLUMN customer_id BIGINT UNSIGNED NULL;

ALTER TABLE credit_note_lines ADD COLUMN vat_code_id BIGINT UNSIGNED NULL;
ALTER TABLE credit_note_lines ADD COLUMN tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0;
ALTER TABLE credit_note_lines ADD COLUMN tax_amount DECIMAL(15,4) NOT NULL DEFAULT 0;

ALTER TABLE bank_transactions ADD COLUMN import_batch_id VARCHAR(64) NULL;
ALTER TABLE bank_transactions ADD COLUMN matched_type VARCHAR(40) NULL;
ALTER TABLE bank_transactions ADD COLUMN matched_id BIGINT UNSIGNED NULL;
ALTER TABLE bank_transactions ADD COLUMN match_confidence DECIMAL(5,2) NULL;
ALTER TABLE bank_transactions ADD COLUMN rule_id BIGINT UNSIGNED NULL;

ALTER TABLE vat_returns ADD COLUMN box1 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box2 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box3 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box4 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box5 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box6 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box7 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box8 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN box9 DECIMAL(15,4) NOT NULL DEFAULT 0;
ALTER TABLE vat_returns ADD COLUMN vat_scheme VARCHAR(40) NULL;
ALTER TABLE vat_returns ADD COLUMN export_json JSON NULL;
ALTER TABLE vat_returns ADD COLUMN submission_placeholder TINYINT(1) NOT NULL DEFAULT 0;

ALTER TABLE payments ADD COLUMN invoice_id BIGINT UNSIGNED NULL;
ALTER TABLE payments ADD COLUMN customer_id BIGINT UNSIGNED NULL;
ALTER TABLE payments ADD COLUMN journal_entry_id BIGINT UNSIGNED NULL;

-- Recurring sales invoices
CREATE TABLE IF NOT EXISTS acc_recurring_invoices (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  template_name VARCHAR(255) NOT NULL,
  frequency ENUM('weekly','monthly','quarterly','yearly') NOT NULL DEFAULT 'monthly',
  next_run_date DATE NOT NULL,
  end_date DATE NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  payment_terms VARCHAR(100) NULL,
  lines_json JSON NOT NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  last_invoice_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_recurring_org (organization_id),
  KEY idx_acc_recurring_next (next_run_date, is_active),
  CONSTRAINT fk_acc_recurring_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_recurring_customer FOREIGN KEY (customer_id) REFERENCES customers (id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Supplier bills (purchases)
CREATE TABLE IF NOT EXISTS acc_supplier_bills (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  supplier_id BIGINT UNSIGNED NOT NULL,
  bill_number VARCHAR(100) NOT NULL,
  bill_date DATE NOT NULL,
  due_date DATE NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  subtotal DECIMAL(15,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15,4) NOT NULL DEFAULT 0,
  total DECIMAL(15,4) NOT NULL DEFAULT 0,
  paid_amount DECIMAL(15,4) NOT NULL DEFAULT 0,
  status ENUM('draft','pending_approval','approved','partially_paid','paid','void') NOT NULL DEFAULT 'draft',
  document_url VARCHAR(1000) NULL,
  journal_entry_id BIGINT UNSIGNED NULL,
  posted_at TIMESTAMP NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_acc_bill_number (organization_id, bill_number),
  KEY idx_acc_bills_supplier (supplier_id),
  KEY idx_acc_bills_status (status),
  CONSTRAINT fk_acc_bills_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_bills_supplier FOREIGN KEY (supplier_id) REFERENCES suppliers (id) ON DELETE RESTRICT,
  CONSTRAINT fk_acc_bills_journal FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_bills_approved_by FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acc_supplier_bill_lines (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  bill_id BIGINT UNSIGNED NOT NULL,
  description VARCHAR(500) NOT NULL,
  quantity DECIMAL(12,4) NOT NULL DEFAULT 1,
  unit_price DECIMAL(15,4) NOT NULL DEFAULT 0,
  vat_code_id BIGINT UNSIGNED NULL,
  tax_rate DECIMAL(7,4) NOT NULL DEFAULT 0,
  tax_amount DECIMAL(15,4) NOT NULL DEFAULT 0,
  line_total DECIMAL(15,4) NOT NULL DEFAULT 0,
  ledger_account_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_bill_lines_bill (bill_id),
  CONSTRAINT fk_acc_bill_lines_bill FOREIGN KEY (bill_id) REFERENCES acc_supplier_bills (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_bill_lines_vat FOREIGN KEY (vat_code_id) REFERENCES acc_vat_codes (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_bill_lines_ledger FOREIGN KEY (ledger_account_id) REFERENCES ledger_accounts (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acc_bill_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  bill_id BIGINT UNSIGNED NOT NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(15,4) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  bank_account_id BIGINT UNSIGNED NULL,
  reference VARCHAR(255) NULL,
  journal_entry_id BIGINT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_bill_pay_bill (bill_id),
  CONSTRAINT fk_acc_bill_pay_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_bill_pay_bill FOREIGN KEY (bill_id) REFERENCES acc_supplier_bills (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_bill_pay_bank FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_bill_pay_journal FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acc_invoice_payments (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  invoice_id BIGINT UNSIGNED NOT NULL,
  payment_id BIGINT UNSIGNED NULL,
  payment_date DATE NOT NULL,
  amount DECIMAL(15,4) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  bank_account_id BIGINT UNSIGNED NULL,
  reference VARCHAR(255) NULL,
  journal_entry_id BIGINT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_inv_pay_invoice (invoice_id),
  CONSTRAINT fk_acc_inv_pay_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_inv_pay_invoice FOREIGN KEY (invoice_id) REFERENCES invoices (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_inv_pay_payment FOREIGN KEY (payment_id) REFERENCES payments (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_inv_pay_bank FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_inv_pay_journal FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Employee expenses
CREATE TABLE IF NOT EXISTS acc_expenses (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NULL,
  expense_date DATE NOT NULL,
  category VARCHAR(100) NULL,
  description VARCHAR(500) NOT NULL,
  amount DECIMAL(15,4) NOT NULL,
  tax_amount DECIMAL(15,4) NOT NULL DEFAULT 0,
  vat_code_id BIGINT UNSIGNED NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  receipt_url VARCHAR(1000) NULL,
  status ENUM('draft','submitted','approved','rejected','reimbursed','void') NOT NULL DEFAULT 'draft',
  ledger_account_id BIGINT UNSIGNED NULL,
  journal_entry_id BIGINT UNSIGNED NULL,
  approved_by BIGINT UNSIGNED NULL,
  approved_at TIMESTAMP NULL,
  rejection_reason VARCHAR(500) NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_expenses_org (organization_id),
  KEY idx_acc_expenses_status (status),
  CONSTRAINT fk_acc_expenses_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_expenses_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_expenses_vat FOREIGN KEY (vat_code_id) REFERENCES acc_vat_codes (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_expenses_ledger FOREIGN KEY (ledger_account_id) REFERENCES ledger_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_expenses_journal FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_expenses_approved FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Fixed assets
CREATE TABLE IF NOT EXISTS acc_fixed_assets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  asset_code VARCHAR(50) NOT NULL,
  name VARCHAR(255) NOT NULL,
  purchase_date DATE NOT NULL,
  purchase_cost DECIMAL(15,4) NOT NULL,
  residual_value DECIMAL(15,4) NOT NULL DEFAULT 0,
  useful_life_months INT NOT NULL DEFAULT 36,
  depreciation_method ENUM('straight_line','reducing_balance') NOT NULL DEFAULT 'straight_line',
  reducing_rate DECIMAL(7,4) NULL,
  cost_account_id BIGINT UNSIGNED NULL,
  accum_depr_account_id BIGINT UNSIGNED NULL,
  depr_expense_account_id BIGINT UNSIGNED NULL,
  status ENUM('active','fully_depreciated','disposed') NOT NULL DEFAULT 'active',
  disposed_at DATE NULL,
  disposal_proceeds DECIMAL(15,4) NULL,
  disposal_journal_id BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_acc_asset_code (organization_id, asset_code),
  CONSTRAINT fk_acc_assets_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_assets_cost_acct FOREIGN KEY (cost_account_id) REFERENCES ledger_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_assets_accum_acct FOREIGN KEY (accum_depr_account_id) REFERENCES ledger_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_assets_depr_acct FOREIGN KEY (depr_expense_account_id) REFERENCES ledger_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_assets_disposal_je FOREIGN KEY (disposal_journal_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acc_depreciation_schedule (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  asset_id BIGINT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  amount DECIMAL(15,4) NOT NULL,
  journal_entry_id BIGINT UNSIGNED NULL,
  status ENUM('scheduled','posted','skipped') NOT NULL DEFAULT 'scheduled',
  posted_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_depr_asset (asset_id),
  CONSTRAINT fk_acc_depr_asset FOREIGN KEY (asset_id) REFERENCES acc_fixed_assets (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_depr_journal FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Bank rules / transfers / reconciliations
CREATE TABLE IF NOT EXISTS acc_bank_rules (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  match_field ENUM('description','reference','payee_payer','amount') NOT NULL DEFAULT 'description',
  match_operator ENUM('contains','equals','starts_with','regex') NOT NULL DEFAULT 'contains',
  match_value VARCHAR(255) NOT NULL,
  ledger_account_id BIGINT UNSIGNED NULL,
  vat_code_id BIGINT UNSIGNED NULL,
  priority INT NOT NULL DEFAULT 100,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_bank_rules_org (organization_id),
  CONSTRAINT fk_acc_bank_rules_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_bank_rules_ledger FOREIGN KEY (ledger_account_id) REFERENCES ledger_accounts (id) ON DELETE SET NULL,
  CONSTRAINT fk_acc_bank_rules_vat FOREIGN KEY (vat_code_id) REFERENCES acc_vat_codes (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acc_bank_transfers (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  from_bank_account_id BIGINT UNSIGNED NOT NULL,
  to_bank_account_id BIGINT UNSIGNED NOT NULL,
  transfer_date DATE NOT NULL,
  amount DECIMAL(15,4) NOT NULL,
  currency CHAR(3) NOT NULL DEFAULT 'GBP',
  reference VARCHAR(255) NULL,
  journal_entry_id BIGINT UNSIGNED NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_transfers_org (organization_id),
  CONSTRAINT fk_acc_transfers_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_transfers_from FOREIGN KEY (from_bank_account_id) REFERENCES bank_accounts (id) ON DELETE RESTRICT,
  CONSTRAINT fk_acc_transfers_to FOREIGN KEY (to_bank_account_id) REFERENCES bank_accounts (id) ON DELETE RESTRICT,
  CONSTRAINT fk_acc_transfers_journal FOREIGN KEY (journal_entry_id) REFERENCES journal_entries (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS acc_bank_reconciliations (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  bank_account_id BIGINT UNSIGNED NOT NULL,
  statement_date DATE NOT NULL,
  statement_balance DECIMAL(15,4) NOT NULL,
  book_balance DECIMAL(15,4) NOT NULL DEFAULT 0,
  difference DECIMAL(15,4) NOT NULL DEFAULT 0,
  status ENUM('in_progress','completed') NOT NULL DEFAULT 'in_progress',
  completed_at TIMESTAMP NULL,
  completed_by BIGINT UNSIGNED NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_recon_bank (bank_account_id),
  CONSTRAINT fk_acc_recon_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_recon_bank FOREIGN KEY (bank_account_id) REFERENCES bank_accounts (id) ON DELETE CASCADE,
  CONSTRAINT fk_acc_recon_user FOREIGN KEY (completed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Corporation tax worksheet (support data — not full CT600)
CREATE TABLE IF NOT EXISTS acc_ct_worksheets (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  accounting_profit DECIMAL(15,4) NOT NULL DEFAULT 0,
  add_backs DECIMAL(15,4) NOT NULL DEFAULT 0,
  deductions DECIMAL(15,4) NOT NULL DEFAULT 0,
  capital_allowances DECIMAL(15,4) NOT NULL DEFAULT 0,
  taxable_profit DECIMAL(15,4) NOT NULL DEFAULT 0,
  ct_rate DECIMAL(7,4) NOT NULL DEFAULT 0.2500,
  estimated_ct DECIMAL(15,4) NOT NULL DEFAULT 0,
  adjustments_json JSON NULL,
  notes TEXT NULL,
  status ENUM('draft','finalised') NOT NULL DEFAULT 'draft',
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_acc_ct_org (organization_id),
  CONSTRAINT fk_acc_ct_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
