-- Migration: Add 'wordpress' support to channel tables
-- Run once against the production database

ALTER TABLE channel_connections
  MODIFY COLUMN channel ENUM('shopify', 'woocommerce', 'wordpress') NOT NULL DEFAULT 'woocommerce';

ALTER TABLE channel_mappings
  MODIFY COLUMN channel ENUM('amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'wordpress', 'wix', 'b2b_portal', 'pos') NOT NULL;
