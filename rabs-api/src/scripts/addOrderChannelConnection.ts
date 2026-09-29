/**
 * Schema change: record which channel connection (POS till / web store) an
 * order came from, so the Orders UI can show the source store by name.
 *
 * The project runs with `synchronize: false` and no migration table, so schema
 * changes are applied by running this script once. It is idempotent.
 *
 * Usage: npx tsx src/scripts/addOrderChannelConnection.ts
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await AppDataSource.query(
    `SELECT 1 FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column]
  );
  return rows.length > 0;
}

async function indexExists(table: string, index: string): Promise<boolean> {
  const rows = await AppDataSource.query(
    `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, index]
  );
  return rows.length > 0;
}

async function main() {
  await AppDataSource.initialize();

  if (await columnExists('orders', 'channel_connection_id')) {
    console.log('· orders.channel_connection_id already exists');
  } else {
    await AppDataSource.query(
      `ALTER TABLE orders
         ADD COLUMN channel_connection_id BIGINT(20) UNSIGNED NULL AFTER channel_order_number`
    );
    console.log('✓ added orders.channel_connection_id');
  }

  if (await indexExists('orders', 'idx_orders_channel_connection')) {
    console.log('· index idx_orders_channel_connection already exists');
  } else {
    await AppDataSource.query(
      `ALTER TABLE orders
         ADD INDEX idx_orders_channel_connection (channel_connection_id)`
    );
    console.log('✓ added index idx_orders_channel_connection');
  }

  if (await indexExists('orders', 'fk_orders_channel_connection')) {
    console.log('· FK fk_orders_channel_connection already exists');
  } else {
    try {
      await AppDataSource.query(
        `ALTER TABLE orders
           ADD CONSTRAINT fk_orders_channel_connection
           FOREIGN KEY (channel_connection_id) REFERENCES channel_connections(id)
           ON DELETE SET NULL`
      );
      console.log('✓ added FK fk_orders_channel_connection');
    } catch (e) {
      console.log('! FK not added:', e instanceof Error ? e.message : e);
    }
  }

  // Backfill: imported order numbers are namespaced as POS{connId}- / WC{connId}-.
  const backfill = await AppDataSource.query(
    `UPDATE orders o
       JOIN channel_connections c
         ON c.id = CAST(
              REGEXP_REPLACE(SUBSTRING_INDEX(o.order_number, '-', 1), '^(POS|WC)', '')
              AS UNSIGNED)
      SET o.channel_connection_id = c.id
    WHERE o.channel_connection_id IS NULL
      AND o.order_number REGEXP '^(POS|WC)[0-9]+-'`
  );
  console.log(`✓ backfilled ${backfill.affectedRows ?? 0} order(s) from their order number prefix`);

  const summary = await AppDataSource.query(
    `SELECT o.channel, c.name AS store, COUNT(*) AS orders
       FROM orders o
       LEFT JOIN channel_connections c ON c.id = o.channel_connection_id
      GROUP BY o.channel, c.name
      ORDER BY orders DESC`
  );
  console.table(summary);

  await AppDataSource.destroy();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
