/**
 * Links existing WooCommerce order lines that have no catalog variant to the
 * catalogue, by SKU / barcode / channel product mapping (same rules as import).
 *
 * The store is only READ (GET /wc/v3/orders?include=...) to recover each line's
 * SKU and product ids, which older imports did not keep. Lines are updated only
 * while their variant is still null, so the script is idempotent.
 *
 * Usage: node dist/scripts/relinkChannelOrderLines.js [--dry-run] [--connection=<id>]
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { ChannelConnection } from '../entities/catalog/ChannelConnection.js';
import { OrderLine } from '../entities/orders/OrderLine.js';
import { decryptJson } from '../utils/credentialCrypto.js';
import { fetchWooOrdersByIds } from '../services/import/wooOrderImport.js';
import { VariantResolver, relinkUnmatchedLines } from '../services/import/orderImportService.js';
import type { WordPressApiCredentials } from '../services/import/wordpressApiImport.js';

interface Row {
  id: string;
  organization_id: string;
  order_number: string;
  channel_order_id: string;
  channel_connection_id: string;
}

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const onlyConnection = arg('connection');
  await AppDataSource.initialize();

  const rows: Row[] = await AppDataSource.query(
    `SELECT DISTINCT o.id, o.organization_id, o.order_number, o.channel_order_id, o.channel_connection_id
       FROM orders o
       JOIN order_lines l ON l.order_id = o.id AND l.variant_id IS NULL
      WHERE o.channel = 'woocommerce'
        AND o.channel_connection_id IS NOT NULL
        AND o.channel_order_id IS NOT NULL
        ${onlyConnection ? 'AND o.channel_connection_id = ?' : ''}
      ORDER BY o.id`,
    onlyConnection ? [onlyConnection] : []
  );
  console.log(`${dryRun ? '[dry-run] ' : ''}${rows.length} WooCommerce order(s) with unlinked lines`);

  const byConnection = new Map<string, Row[]>();
  for (const r of rows) {
    const key = String(r.channel_connection_id);
    byConnection.set(key, [...(byConnection.get(key) ?? []), r]);
  }

  const totals = { orders: rows.length, unlinkedBefore: 0, skuFilled: 0, linked: 0, notFound: 0, failed: 0 };
  const lineRepo = AppDataSource.getRepository(OrderLine);

  for (const [connectionId, orders] of byConnection) {
    const conn = await AppDataSource.getRepository(ChannelConnection).findOne({ where: { id: connectionId } });
    if (!conn || (conn.channel !== 'wordpress' && conn.channel !== 'woocommerce')) {
      console.warn(`! connection #${connectionId} missing or not WooCommerce — skipping ${orders.length} order(s)`);
      totals.failed += orders.length;
      continue;
    }
    const raw = decryptJson<Omit<WordPressApiCredentials, never>>(conn.credentialsEncrypted);
    const creds: WordPressApiCredentials = { ...raw, storeUrl: raw.storeUrl ?? conn.storeUrl ?? '' };

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
        totals.notFound++;
        continue;
      }
      const lines = await lineRepo.find({
        where: { order: { id: row.id } },
        relations: ['variant']
      });
      const unlinked = lines.filter((l) => !l.variant);
      totals.unlinkedBefore += unlinked.length;
      const before = new Map(unlinked.map((l) => [l.id, l.sku]));
      const changed = relinkUnmatchedLines(lines, source, resolver);
      const linked = changed.filter((l) => l.variant).length;
      const skuFilled = changed.filter((l) => !before.get(l.id) && l.sku).length;
      totals.linked += linked;
      totals.skuFilled += skuFilled;
      if (changed.length) {
        console.log(`  ${row.order_number}: ${linked} linked, ${skuFilled} SKU(s) filled`);
        if (!dryRun) await lineRepo.save(changed);
      }
    }
  }

  console.log(
    `${dryRun ? '[dry-run] ' : ''}Orders: ${totals.orders}; unlinked lines before: ${totals.unlinkedBefore}; ` +
      `linked to a variant: ${totals.linked}; SKU filled from store: ${totals.skuFilled}; ` +
      `not returned by store: ${totals.notFound}; failed: ${totals.failed}.`
  );
  await AppDataSource.destroy();
}

main().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
