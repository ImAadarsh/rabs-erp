-- Min selling price, calendar event ids, payment reminder history
ALTER TABLE rabs_products
  ADD COLUMN min_sell_price DECIMAL(12,2) NULL AFTER sell_price;

ALTER TABLE rabs_appointments
  ADD COLUMN google_calendar_event_id VARCHAR(255) NULL AFTER status;

ALTER TABLE rabs_bookings
  ADD COLUMN google_calendar_event_id VARCHAR(255) NULL AFTER status;

CREATE TABLE IF NOT EXISTS rabs_payment_reminders (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  organization_id BIGINT UNSIGNED NOT NULL,
  job_id BIGINT UNSIGNED NOT NULL,
  rabs_customer_id BIGINT UNSIGNED NOT NULL,
  kind ENUM('deposit','balance','overdue') NOT NULL DEFAULT 'deposit',
  channel ENUM('email','sms','call','note') NOT NULL DEFAULT 'note',
  due_date DATE NULL,
  sent_at DATETIME NULL,
  outcome VARCHAR(255) NULL,
  notes TEXT NULL,
  created_by BIGINT UNSIGNED NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_rabs_pay_rem_job (job_id),
  INDEX idx_rabs_pay_rem_org (organization_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
