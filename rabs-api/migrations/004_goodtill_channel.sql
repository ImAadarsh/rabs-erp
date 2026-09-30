-- Migration: Add 'goodtill' support to channel_connections
-- Run once against the production database

ALTER TABLE channel_connections
  MODIFY COLUMN channel ENUM('shopify', 'woocommerce', 'wordpress', 'goodtill') NOT NULL DEFAULT 'woocommerce';
