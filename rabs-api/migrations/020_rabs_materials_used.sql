-- RABS: record stock that was used on a finished job (status 'used', qty_reserved keeps the amount taken from stock)
ALTER TABLE rabs_material_items
  MODIFY status ENUM('reserved','to_order','ordered','received','not_tracked','used') NOT NULL DEFAULT 'not_tracked';
