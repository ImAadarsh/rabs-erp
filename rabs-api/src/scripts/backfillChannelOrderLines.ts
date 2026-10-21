/**
 * Re-pulls line items for WooCommerce channel orders that were imported with
 * no order lines (lines whose product could not be matched used to be dropped).
 *
 * For every order with 0 lines and a stored WooCommerce/WordPress channel
 * connection, the order is re-fetched from the store's REST API and its lines
 * are inserted: matched to a variant by SKU, else by channel mapping, else saved
 * with the channel name/SKU/qty/price and no variant.
 *
 * Idempotent: an order is only touched while it still has no lines, re-checked
 * inside the insert transaction. Requires migration 020c_order_lines_nullable_variant.sql.
 *
 * Usage: npx tsx src/scripts/backfillChannelOrderLines.ts [--dry-run] [--connection=<id>] [--limit=<n>]
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { ChannelConnection } from '../entities/catalog/ChannelConnection.js';
import { OrderLine } from '../entities/orders/OrderLine.js';
import { decryptJson } from '../utils/credentialCrypto.js';
import { fetchWooOrdersByIds } from '../services/import/wooOrderImport.js';
import { VariantResolver, buildImportedOrderLines } from '../services/import/orderImportService.js';
import type { WordPressApiCredentials } from '../services/import/wordpressApiImport.js';
import type { Order } from '../entities/orders/Order.js';

interface EmptyOrderRow {
  id: string;
  organization_id: string;
  order_number: string;
  channel_order_id: string;
  channel_connection_id: string;
  fulfillment_status: Order['fulfillmentStatus'];
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const onlyConnection = arg('connection');
  const limit = Number(arg('limit')) || 0;
  await AppDataSource.initialize();

  const params: unknown[] = [];
  let where = '';
  if (onlyConnection) {
    where = 'AND o.channel_connection_id = ?';
    params.push(onlyConnection);
  }
  const rows: EmptyOrderRow[] = await AppDataSource.query(
    `SELECT o.id, o.organization_id, o.order_number, o.channel_order_id, o.channel_connection_id, o.fulfillment_status
       FROM orders o
      WHERE o.channel = 'woocommerce'
        AND o.channel_connection_id IS NOT NULL
        AND o.channel_order_id IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM order_lines l WHERE l.order_id = o.id)
        ${where}
      ORDER BY o.id
      ${limit > 0 ? `LIMIT ${Math.floor(limit)}` : ''}`,
    params
  );
  console.log(`${dryRun ? '[dry-run] ' : ''}${rows.length} WooCommerce order(s) with 0 lines`);

  const byConnection = new Map<string, EmptyOrderRow[]>();
  for (const r of rows) {
    const key = String(r.channel_connection_id);
    byConnection.set(key, [...(byConnection.get(key) ?? []), r]);
  }

  const totals = { orders: 0, lines: 0, matched: 0, unmatched: 0, notFound: 0, noLinesInStore: 0, failed: 0 };

  for (const [connectionId, orders] of byConnection) {
    const conn = await AppDataSource.getRepository(ChannelConnection).findOne({ where: { id: connectionId } });
    if (!conn) {
      console.warn(`! connection #${connectionId} not found — skipping ${orders.length} order(s)`);
      totals.failed += orders.length;
      continue;
    }
    if (conn.channel !== 'wordpress' && conn.channel !== 'woocommerce') {
      console.warn(`! connection #${connectionId} (${conn.name}) is not WooCommerce — skipping`);
      totals.failed += orders.length;
      continue;
    }

    const raw = decryptJson<Omit<WordPressApiCredentials, never>>(conn.credentialsEncrypted);
    const creds: WordPressApiCredentials = { ...raw, storeUrl: raw.storeUrl ?? conn.storeUrl ?? '' };
    console.log(`· ${conn.name} (#${connectionId}): fetching ${orders.length} order(s) from the store`);

    let parsed;
    try {
      parsed = await fetchWooOrdersByIds(creds, {
        connectionId,
        orderIds: orders.map((o) => String(o.channel_order_id))
      });
    } catch (err) {
      console.error(`! ${conn.name}: ${err instanceof Error ? err.message : err}`);
      totals.failed += orders.length;
      continue;
    }
    const parsedById = new Map(parsed.map((p) => [p.externalId, p]));
    const resolver = await VariantResolver.build(parsed, 'woocommerce', String(orders[0].organization_id));

    for (const row of orders) {
      const source = parsedById.get(String(row.channel_order_id));
      if (!source) {
        console.warn(`  - ${row.order_number}: not returned by the store`);
        totals.notFound++;
        continue;
      }
      if (!source.lines.length) {
        console.warn(`  - ${row.order_number}: the store order has no line items`);
        totals.noLinesInStore++;
        continue;
      }

      // Line status follows the ERP's fulfilment progress, not the store's.
      const { lines, unmatchedSkus } = buildImportedOrderLines(
        String(row.id),
        { ...source, fulfillmentStatus: row.fulfillment_status },
        resolver
      );
      const matched = lines.length - unmatchedSkus.length;
      console.log(
        `  + ${row.order_number}: ${lines.length} line(s), ${matched} matched` +
          (unmatchedSkus.length ? `, unmatched: ${unmatchedSkus.join(', ')}` : '')
      );
      if (dryRun) {
        totals.orders++;
        totals.lines += lines.length;
        totals.matched += matched;
        totals.unmatched += unmatchedSkus.length;
        continue;
      }

      try {
        const inserted = await AppDataSource.transaction(async (manager) => {
          const [{ c }] = await manager.query(
            'SELECT COUNT(*) AS c FROM order_lines WHERE order_id = ? FOR UPDATE',
            [row.id]
          );
          if (Number(c) > 0) return false;
          await manager.getRepository(OrderLine).save(lines);
          return true;
        });
        if (!inserted) {
          console.log(`    (skipped — lines were added meanwhile)`);
          continue;
        }
        totals.orders++;
        totals.lines += lines.length;
        totals.matched += matched;
        totals.unmatched += unmatchedSkus.length;
      } catch (err) {
        console.error(`  ! ${row.order_number}: ${err instanceof Error ? err.message : err}`);
        totals.failed++;
      }
    }
  }

  console.log(
    `${dryRun ? '[dry-run] would backfill' : 'Backfilled'} ${totals.orders} order(s), ${totals.lines} line(s) ` +
      `(${totals.matched} matched to a variant, ${totals.unmatched} saved without a variant). ` +
      `Not found in store: ${totals.notFound}; store order without items: ${totals.noLinesInStore}; failed: ${totals.failed}.`
  );
  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
