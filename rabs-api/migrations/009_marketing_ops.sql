-- 009 Marketing ops: roles, conversion channel, nullable click for direct attribution
-- Idempotent / non-destructive

-- Marketing role
INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'Marketing', 'MARKETING', 'Marketing & Affiliates module access', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'MARKETING' AND organization_id = 1);

-- Admin role (used by marketing RBAC alongside SUPER_ADMIN)
INSERT INTO roles (organization_id, name, code, description, is_system, created_at, updated_at)
SELECT 1, 'Administrator', 'ADMIN', 'Organization administrator', 1, NOW(), NOW()
WHERE NOT EXISTS (SELECT 1 FROM roles WHERE code = 'ADMIN' AND organization_id = 1);

-- Allow conversions without a prior click (code-only / B2B attribution)
ALTER TABLE affiliate_conversions
  MODIFY COLUMN affiliate_click_id BIGINT UNSIGNED NULL;

-- Channel attribution (b2b_portal, etc.)
SET @col_exists := (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'affiliate_conversions'
    AND COLUMN_NAME = 'channel'
);
SET @sql := IF(
  @col_exists = 0,
  'ALTER TABLE affiliate_conversions ADD COLUMN channel VARCHAR(50) NULL AFTER currency',
  'SELECT 1'
);
PREPARE stmt FROM @sql;
EXECUTE stmt;
DEALLOCATE PREPARE stmt;

-- Index for channel reporting
SET @idx_exists := (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE()
    AND TABLE_NAME = 'affiliate_conversions'
    AND INDEX_NAME = 'idx_channel'
);
SET @sql2 := IF(
  @idx_exists = 0,
  'ALTER TABLE affiliate_conversions ADD INDEX idx_channel (channel)',
  'SELECT 1'
);
PREPARE stmt2 FROM @sql2;
EXECUTE stmt2;
DEALLOCATE PREPARE stmt2;
