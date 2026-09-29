-- Migration: Add product-master fields to catalog_items to match the inventory seed sheet
-- Adds: sub_category, uom, pack_size, cost_price, selling_price, currency,
--       supplier_sku, lead_time_days, remarks
-- Note: attributes (JSON) already exists for arbitrary key/value product fields.
-- Warehousing/stock fields (opening qty, reorder, warehouse, bin, batch, expiry, supplier)
-- remain in the inventory module.
-- deploy.sh re-runs every migration on each deploy, so this must stay re-runnable.

ALTER TABLE catalog_items
  ADD COLUMN IF NOT EXISTS sub_category   VARCHAR(255)   NULL AFTER category,
  ADD COLUMN IF NOT EXISTS uom            VARCHAR(50)    NULL AFTER manufacturer,
  ADD COLUMN IF NOT EXISTS pack_size      VARCHAR(100)   NULL AFTER uom,
  ADD COLUMN IF NOT EXISTS cost_price     DECIMAL(15,4)  NULL AFTER pack_size,
  ADD COLUMN IF NOT EXISTS selling_price  DECIMAL(15,4)  NULL AFTER cost_price,
  ADD COLUMN IF NOT EXISTS currency       CHAR(3)        NOT NULL DEFAULT 'GBP' AFTER selling_price,
  ADD COLUMN IF NOT EXISTS supplier_sku   VARCHAR(100)   NULL AFTER currency,
  ADD COLUMN IF NOT EXISTS lead_time_days INT            NULL AFTER supplier_sku,
  ADD COLUMN IF NOT EXISTS remarks        TEXT           NULL AFTER lead_time_days;
