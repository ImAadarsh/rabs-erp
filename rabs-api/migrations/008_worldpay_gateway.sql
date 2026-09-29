-- Add Worldpay provider + enlarge encrypted credential columns (idempotent-friendly)

-- Expand provider enum to include worldpay (MySQL/MariaDB)
ALTER TABLE payment_gateways
  MODIFY COLUMN provider ENUM('stripe', 'paypal', 'square', 'sumup', 'open_banking', 'manual', 'other', 'worldpay') NOT NULL;

ALTER TABLE payment_gateways
  MODIFY COLUMN api_key_encrypted TEXT NULL,
  MODIFY COLUMN api_secret_encrypted TEXT NULL,
  MODIFY COLUMN webhook_secret TEXT NULL;
