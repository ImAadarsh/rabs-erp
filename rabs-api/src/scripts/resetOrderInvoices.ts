/**
 * Puts invoicing on a one-invoice-per-order footing.
 *
 * 1. Removes invoices that carry no billing meaning: seeded placeholders with
 *    no line items, and any invoice raised against a demo order that never
 *    came from a connected sales channel.
 * 2. Adds a unique index on invoices.order_id so an order can never be
 *    invoiced twice.
 * 3. Generates an invoice for every channel order that lacks one.
 *
 * The project runs with `synchronize: false` and no migration table, so schema
 * changes are applied by running this script once. It is idempotent.
 *
 * Usage: npx tsx src/scripts/resetOrderInvoices.ts [--keep-placeholders]
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import {
    generateInvoicesForOrders,
    findUninvoicedOrderIds
} from '../services/finance/invoiceGeneration.service.js';

async function indexExists(table: string, index: string): Promise<boolean> {
    const rows = await AppDataSource.query(
        `SELECT 1 FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
        [table, index]
    );
    return rows.length > 0;
}

async function main() {
    const keepPlaceholders = process.argv.includes('--keep-placeholders');
    await AppDataSource.initialize();

    if (keepPlaceholders) {
        console.log('· keeping existing invoices');
    } else {
        const empty = await AppDataSource.query(
            `DELETE i FROM invoices i
          LEFT JOIN invoice_lines l ON l.invoice_id = i.id
         WHERE l.id IS NULL`
        );
        console.log(`✓ removed ${empty.affectedRows ?? 0} placeholder invoice(s) with no line items`);

        const demo = await AppDataSource.query(
            `DELETE i FROM invoices i
          JOIN orders o ON o.id = i.order_id
         WHERE o.channel_connection_id IS NULL`
        );
        console.log(`✓ removed ${demo.affectedRows ?? 0} invoice(s) raised against non-channel demo orders`);
    }

    if (await indexExists('invoices', 'uq_invoices_order')) {
        console.log('· unique index uq_invoices_order already exists');
    } else {
        const dupes = await AppDataSource.query(
            `SELECT order_id, COUNT(*) AS c FROM invoices
        WHERE order_id IS NOT NULL GROUP BY order_id HAVING c > 1`
        );
        if (dupes.length > 0) {
            console.log(`! ${dupes.length} order(s) have multiple invoices — resolve these before the unique index can be added`);
            console.table(dupes);
        } else {
            await AppDataSource.query(
                `ALTER TABLE invoices ADD UNIQUE INDEX uq_invoices_order (order_id)`
            );
            console.log('✓ added unique index uq_invoices_order (one invoice per order)');
        }
    }

    const orgs = await AppDataSource.query(
        `SELECT id, name FROM organizations WHERE deleted_at IS NULL`
    );

    for (const org of orgs) {
        const orderIds = await findUninvoicedOrderIds(String(org.id));
        if (orderIds.length === 0) {
            console.log(`· ${org.name}: every eligible order is already invoiced`);
            continue;
        }
        const result = await generateInvoicesForOrders(String(org.id), orderIds);
        console.log(`✓ ${org.name}: created ${result.created.length} invoice(s), skipped ${result.skipped.length}`);
        if (result.skipped.length > 0) {
            console.table(result.skipped.slice(0, 10));
        }
    }

    const summary = await AppDataSource.query(
        `SELECT o.channel, COUNT(i.id) AS invoices, ROUND(SUM(i.total), 2) AS value
       FROM invoices i JOIN orders o ON o.id = i.order_id
      GROUP BY o.channel ORDER BY invoices DESC`
    );
    console.table(summary);

    await AppDataSource.destroy();
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
