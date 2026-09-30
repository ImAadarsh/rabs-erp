-- 015 UK HR extensions (immigration, RTW, leave, attendance, SSP, pension,
-- documents, payslips, tax docs, recruitment, compliance).
-- Idempotent / non-destructive. deploy may re-run.
-- Extends existing employees / leave_requests / payroll_* — does not duplicate.

-- Roles
INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'HR Manager', 'HR_MANAGER', 'HR management: employees, leave, immigration, payroll view', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'HR_MANAGER' AND organization_id = 1);

INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'HR Admin', 'HR_ADMIN', 'HR administration: full HR write access', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'HR_ADMIN' AND organization_id = 1);

-- Extend employees with UK payroll / role fields
ALTER TABLE employees ADD COLUMN ni_number VARCHAR(20) NULL;
ALTER TABLE employees ADD COLUMN tax_code VARCHAR(20) NULL DEFAULT '1257L';
ALTER TABLE employees ADD COLUMN department VARCHAR(255) NULL;
ALTER TABLE employees ADD COLUMN job_title VARCHAR(255) NULL;
ALTER TABLE employees ADD COLUMN annual_salary DECIMAL(15,4) NULL;
ALTER TABLE employees ADD COLUMN pay_frequency ENUM('weekly','fortnightly','four_weekly','monthly') NULL DEFAULT 'monthly';

-- Leave requests: optional policy link
ALTER TABLE leave_requests ADD COLUMN leave_policy_id BIGINT UNSIGNED NULL;

-- Immigration / visa
CREATE TABLE IF NOT EXISTS hr_immigration (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  status ENUM('british_citizen','settled','pre_settled','skilled_worker','student','spouse','other','unknown') NOT NULL DEFAULT 'unknown',
  visa_type VARCHAR(100) NULL,
  visa_number VARCHAR(100) NULL,
  visa_expiry DATE NULL,
  share_code VARCHAR(50) NULL,
  right_to_work_verified TINYINT(1) NOT NULL DEFAULT 0,
  right_to_work_checked_at DATETIME NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hr_immigration_employee (employee_id),
  KEY idx_hr_immigration_expiry (visa_expiry),
  CONSTRAINT fk_hr_immigration_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Right to Work documents (S3)
CREATE TABLE IF NOT EXISTS hr_rtw_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  doc_type ENUM('passport','brp','share_code_check','visa','birth_certificate','other') NOT NULL DEFAULT 'other',
  document_name VARCHAR(255) NOT NULL,
  s3_key VARCHAR(500) NULL,
  document_url VARCHAR(1000) NULL,
  verified_at DATETIME NULL,
  verified_by BIGINT UNSIGNED NULL,
  expires_at DATE NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_rtw_employee (employee_id),
  KEY idx_hr_rtw_expires (expires_at),
  CONSTRAINT fk_hr_rtw_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_rtw_verified_by FOREIGN KEY (verified_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Leave policies (org-level)
CREATE TABLE IF NOT EXISTS hr_leave_policies (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  leave_type ENUM('vacation','sick','personal','maternity','paternity','bereavement','unpaid','other') NOT NULL DEFAULT 'vacation',
  entitlement_days DECIMAL(5,2) NOT NULL DEFAULT 28.00,
  carries_over TINYINT(1) NOT NULL DEFAULT 0,
  max_carry_days DECIMAL(5,2) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_leave_policies_org (organization_id),
  CONSTRAINT fk_hr_leave_policies_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_leave_balances (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  leave_policy_id BIGINT UNSIGNED NOT NULL,
  year SMALLINT NOT NULL,
  entitled_days DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  used_days DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  pending_days DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  carried_days DECIMAL(5,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hr_leave_bal (employee_id, leave_policy_id, year),
  KEY idx_hr_leave_bal_emp (employee_id),
  CONSTRAINT fk_hr_leave_bal_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_leave_bal_policy FOREIGN KEY (leave_policy_id) REFERENCES hr_leave_policies (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Daily attendance (complements time_entries)
CREATE TABLE IF NOT EXISTS hr_attendance (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  status ENUM('present','absent','late','half_day','holiday','sick','remote') NOT NULL DEFAULT 'present',
  clock_in TIME NULL,
  clock_out TIME NULL,
  hours_worked DECIMAL(5,2) NULL,
  notes VARCHAR(500) NULL,
  recorded_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hr_attendance_day (employee_id, work_date),
  KEY idx_hr_attendance_date (work_date),
  CONSTRAINT fk_hr_attendance_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_attendance_recorded_by FOREIGN KEY (recorded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_overtime (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  work_date DATE NOT NULL,
  hours DECIMAL(5,2) NOT NULL,
  rate_multiplier DECIMAL(4,2) NOT NULL DEFAULT 1.50,
  reason VARCHAR(500) NULL,
  status ENUM('pending','approved','rejected','paid') NOT NULL DEFAULT 'pending',
  approved_by BIGINT UNSIGNED NULL,
  approved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_overtime_emp (employee_id),
  KEY idx_hr_overtime_status (status),
  CONSTRAINT fk_hr_overtime_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_overtime_approved_by FOREIGN KEY (approved_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Statutory Sick Pay episodes
CREATE TABLE IF NOT EXISTS hr_sick_episodes (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NULL,
  waiting_days INT NOT NULL DEFAULT 3,
  qualifying_days INT NOT NULL DEFAULT 0,
  ssp_days_paid INT NOT NULL DEFAULT 0,
  ssp_rate DECIMAL(10,4) NULL,
  ssp_total DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  linked_to_previous TINYINT(1) NOT NULL DEFAULT 0,
  fit_note_received TINYINT(1) NOT NULL DEFAULT 0,
  fit_note_s3_key VARCHAR(500) NULL,
  status ENUM('open','closed','cancelled') NOT NULL DEFAULT 'open',
  notes TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_sick_emp (employee_id),
  KEY idx_hr_sick_status (status),
  CONSTRAINT fk_hr_sick_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Pension auto-enrolment
CREATE TABLE IF NOT EXISTS hr_pension (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  eligible TINYINT(1) NOT NULL DEFAULT 1,
  enrolled TINYINT(1) NOT NULL DEFAULT 0,
  scheme_name VARCHAR(255) NULL,
  contribution_pct DECIMAL(5,2) NULL,
  employer_contribution_pct DECIMAL(5,2) NULL,
  deferral_date DATE NULL,
  enrolment_date DATE NULL,
  opt_out_date DATE NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_hr_pension_employee (employee_id),
  CONSTRAINT fk_hr_pension_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- General HR documents (contracts etc via S3)
CREATE TABLE IF NOT EXISTS hr_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  doc_category ENUM('contract','handbook','policy','id','certificate','other') NOT NULL DEFAULT 'other',
  document_name VARCHAR(255) NOT NULL,
  s3_key VARCHAR(500) NULL,
  document_url VARCHAR(1000) NULL,
  issue_date DATE NULL,
  expiry_date DATE NULL,
  uploaded_by BIGINT UNSIGNED NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_docs_employee (employee_id),
  CONSTRAINT fk_hr_docs_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_docs_uploaded_by FOREIGN KEY (uploaded_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Payslips (metadata + S3 file; links optional payroll line)
CREATE TABLE IF NOT EXISTS hr_payslips (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  payroll_run_id BIGINT UNSIGNED NULL,
  payroll_line_id BIGINT UNSIGNED NULL,
  tax_year VARCHAR(9) NOT NULL,
  pay_period_start DATE NOT NULL,
  pay_period_end DATE NOT NULL,
  payment_date DATE NULL,
  gross_pay DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  tax_deducted DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  ni_deducted DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  pension_deducted DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  net_pay DECIMAL(15,4) NOT NULL DEFAULT 0.0000,
  s3_key VARCHAR(500) NULL,
  document_url VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_payslips_emp (employee_id),
  KEY idx_hr_payslips_year (tax_year),
  CONSTRAINT fk_hr_payslips_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_payslips_run FOREIGN KEY (payroll_run_id) REFERENCES payroll_runs (id) ON DELETE SET NULL,
  CONSTRAINT fk_hr_payslips_line FOREIGN KEY (payroll_line_id) REFERENCES payroll_lines (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- P45 / P60 tax documents
CREATE TABLE IF NOT EXISTS hr_tax_documents (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  doc_type ENUM('P45','P60','P11D','other') NOT NULL,
  tax_year VARCHAR(9) NOT NULL,
  s3_key VARCHAR(500) NULL,
  document_url VARCHAR(1000) NULL,
  issued_at DATE NULL,
  notes VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_tax_docs_emp (employee_id),
  KEY idx_hr_tax_docs_type (doc_type, tax_year),
  CONSTRAINT fk_hr_tax_docs_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Recruitment
CREATE TABLE IF NOT EXISTS hr_job_postings (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  title VARCHAR(255) NOT NULL,
  department VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  employment_type ENUM('full_time','part_time','contract','temporary','intern') NOT NULL DEFAULT 'full_time',
  description TEXT NULL,
  status ENUM('draft','open','closed','filled','cancelled') NOT NULL DEFAULT 'draft',
  posted_at DATE NULL,
  closes_at DATE NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_jobs_org (organization_id),
  KEY idx_hr_jobs_status (organization_id, status),
  CONSTRAINT fk_hr_jobs_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_jobs_created_by FOREIGN KEY (created_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_applicants (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  job_posting_id BIGINT UNSIGNED NOT NULL,
  first_name VARCHAR(100) NOT NULL,
  last_name VARCHAR(100) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  stage ENUM('applied','screening','interview','offer','hired','rejected','withdrawn') NOT NULL DEFAULT 'applied',
  cv_s3_key VARCHAR(500) NULL,
  cv_url VARCHAR(1000) NULL,
  notes TEXT NULL,
  employee_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_applicants_job (job_posting_id),
  KEY idx_hr_applicants_stage (stage),
  CONSTRAINT fk_hr_applicants_job FOREIGN KEY (job_posting_id) REFERENCES hr_job_postings (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_applicants_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS hr_onboarding_checklists (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  employee_id BIGINT UNSIGNED NOT NULL,
  item_key VARCHAR(100) NOT NULL,
  item_label VARCHAR(255) NOT NULL,
  is_done TINYINT(1) NOT NULL DEFAULT 0,
  due_date DATE NULL,
  completed_at DATETIME NULL,
  completed_by BIGINT UNSIGNED NULL,
  sort_order INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_onboard_emp (employee_id),
  CONSTRAINT fk_hr_onboard_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_onboard_completed_by FOREIGN KEY (completed_by) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Compliance alerts (visa expiry etc)
CREATE TABLE IF NOT EXISTS hr_compliance_alerts (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  organization_id BIGINT UNSIGNED NOT NULL,
  employee_id BIGINT UNSIGNED NULL,
  alert_type ENUM('visa_expiry','rtw_expiry','document_expiry','pension_deferral','leave_balance','custom') NOT NULL,
  severity ENUM('info','warning','critical') NOT NULL DEFAULT 'warning',
  title VARCHAR(255) NOT NULL,
  message TEXT NULL,
  due_date DATE NULL,
  status ENUM('open','acknowledged','resolved','dismissed') NOT NULL DEFAULT 'open',
  reminder_sent_at DATETIME NULL,
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_hr_alerts_org (organization_id),
  KEY idx_hr_alerts_status (organization_id, status),
  KEY idx_hr_alerts_due (due_date),
  CONSTRAINT fk_hr_alerts_org FOREIGN KEY (organization_id) REFERENCES organizations (id) ON DELETE CASCADE,
  CONSTRAINT fk_hr_alerts_employee FOREIGN KEY (employee_id) REFERENCES employees (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Optional FK for leave_policy on leave_requests (idempotent skip if dup)
ALTER TABLE leave_requests
  ADD CONSTRAINT fk_leave_requests_policy FOREIGN KEY (leave_policy_id) REFERENCES hr_leave_policies (id) ON DELETE SET NULL;
