-- Non-destructive: free-over threshold for B2B shipping methods
ALTER TABLE b2b_shipping_methods
  ADD COLUMN IF NOT EXISTS free_over_amount DECIMAL(15,4) NULL AFTER min_order_amount;
