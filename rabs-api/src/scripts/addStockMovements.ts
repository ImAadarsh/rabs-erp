/**
 * Schema change: add the stock_movements ledger, an append-only record of every
 * change to on-hand stock. Stock transfers write a paired out/in movement so
 * inventory history can be reconstructed and audited.
 *
 * The project runs with `synchronize: false` and no migration table, so schema
 * changes are applied by running this script once. It is idempotent.
 *
 * Usage: npx tsx src/scripts/addStockMovements.ts
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';

async function tableExists(table: string): Promise<boolean> {
    const rows = await AppDataSource.query(
        `SELECT 1 FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
        [table]
    );
    return rows.length > 0;
}

async function main() {
    await AppDataSource.initialize();

    if (await tableExists('stock_movements')) {
        console.log('· stock_movements already exists');
    } else {
        await AppDataSource.query(`
      CREATE TABLE stock_movements (
        id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        organization_id BIGINT UNSIGNED NOT NULL,
        variant_id BIGINT UNSIGNED NOT NULL,
        warehouse_id BIGINT UNSIGNED NOT NULL,
        bin_id BIGINT UNSIGNED NULL,
        stock_item_id BIGINT UNSIGNED NULL,
        lot_number VARCHAR(100) NULL,
        movement_type ENUM('transfer_out','transfer_in','adjustment','receipt','sale','return','count','other') NOT NULL,
        quantity INT NOT NULL COMMENT 'Signed: negative removes stock, positive adds it',
        quantity_before INT NOT NULL,
        quantity_after INT NOT NULL,
        unit_cost DECIMAL(15,4) NULL,
        reference_type ENUM('stock_transfer','stock_adjustment','grn','order','cycle_count','manual') NULL,
        reference_id BIGINT UNSIGNED NULL,
        reference_number VARCHAR(100) NULL,
        notes VARCHAR(500) NULL,
        created_by BIGINT UNSIGNED NULL,
        created_at TIMESTAMP NULL DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_stock_movements_variant_warehouse (variant_id, warehouse_id),
        INDEX idx_stock_movements_reference (reference_type, reference_id),
        INDEX idx_stock_movements_created (created_at),
        INDEX idx_stock_movements_org (organization_id),
        CONSTRAINT fk_stock_movements_org FOREIGN KEY (organization_id) REFERENCES organizations(id) ON DELETE CASCADE,
        CONSTRAINT fk_stock_movements_variant FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE,
        CONSTRAINT fk_stock_movements_warehouse FOREIGN KEY (warehouse_id) REFERENCES warehouses(id) ON DELETE CASCADE,
        CONSTRAINT fk_stock_movements_bin FOREIGN KEY (bin_id) REFERENCES bins(id) ON DELETE SET NULL,
        CONSTRAINT fk_stock_movements_stock_item FOREIGN KEY (stock_item_id) REFERENCES stock_items(id) ON DELETE SET NULL,
        CONSTRAINT fk_stock_movements_user FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
        COMMENT='Append-only ledger of on-hand stock changes'
    `);
        console.log('✓ created stock_movements');
    }

    await AppDataSource.destroy();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
