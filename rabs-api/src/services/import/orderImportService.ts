/**
 * Channel-agnostic order + payment import.
 *
 * Takes `ParsedExternalOrder[]` from any channel mapper and upserts them into
 * the Orders and Payments modules.
 *
 * Idempotency (application-level, since there are no unique DB indexes):
 *  - orders:   (organization, channel, channelOrderId)
 *  - payments: (organization, transactionId)
 *  - lines:    only created when the order has none yet
 */

import { AppDataSource } from '@config/data-source.js';
import { Order } from '@entities/orders/Order.js';
import { OrderLine } from '@entities/orders/OrderLine.js';
import { OrderAddress } from '@entities/orders/OrderAddress.js';
import { Customer } from '@entities/orders/Customer.js';
import { Variant } from '@entities/catalog/Variant.js';
import type { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { Payment } from '@entities/finance/Payment.js';
import { Organization } from '@entities/iam/Organization.js';

import type {
  OrderImportOptions,
  OrderImportSummary,
  ParsedExternalOrder,
  ParsedExternalOrderLine
} from './externalOrderTypes.js';

/**
 * Channel mapping rows for a given order channel. The WordPress product sync
 * stores its mappings as `wordpress`, while orders from the same store are
 * recorded as `woocommerce`, so both must be consulted.
 */
function mappingChannelsFor(channel: ParsedExternalOrder['channel']): ChannelMapping['channel'][] {
  if (channel === 'woocommerce') return ['woocommerce', 'wordpress'];
  return [channel as ChannelMapping['channel']];
}

/** Resolves external line identifiers to catalog variants. */
export class VariantResolver {
  private bySku = new Map<string, string>();
  private byItemSku = new Map<string, string>();
  private byBarcode = new Map<string, string>();
  private byExternalId = new Map<string, string>();

  static async build(
    orders: ParsedExternalOrder[],
    channel: ParsedExternalOrder['channel'],
    organizationId: string
  ): Promise<VariantResolver> {
    const resolver = new VariantResolver();

    const skus = new Set<string>();
    const externalIds = new Set<string>();
    for (const o of orders) {
      for (const l of o.lines) {
        if (l.sku) skus.add(l.sku.toLowerCase());
        if (l.externalProductId) externalIds.add(l.externalProductId);
        if (l.externalParentProductId) externalIds.add(l.externalParentProductId);
      }
    }

    if (skus.size) {
      // Match on variant SKU, case-insensitively.
      const variants = await AppDataSource.getRepository(Variant)
        .createQueryBuilder('v')
        .innerJoin('v.catalogItem', 'ci')
        .select(['v.id', 'v.variantSku'])
        .where('LOWER(v.variant_sku) IN (:...skus)', { skus: [...skus] })
        .andWhere('ci.organization_id = :orgId', { orgId: organizationId })
        .andWhere('v.deleted_at IS NULL')
        .getMany();
      for (const v of variants) {
        resolver.bySku.set(String(v.variantSku).toLowerCase(), v.id);
      }

      // Simple products often carry the SKU on the catalog item only.
      const itemRows: Array<{ sku: string; variant_id: string }> = await AppDataSource.query(
        `SELECT LOWER(ci.sku) AS sku, MIN(v.id) AS variant_id
           FROM catalog_items ci
           JOIN variants v ON v.catalog_item_id = ci.id AND v.deleted_at IS NULL
          WHERE ci.organization_id = ? AND ci.deleted_at IS NULL AND LOWER(ci.sku) IN (?)
          GROUP BY LOWER(ci.sku)`,
        [organizationId, [...skus]]
      );
      for (const r of itemRows) resolver.byItemSku.set(r.sku, String(r.variant_id));

      // Stores often put the EAN/UPC in the SKU field.
      const barcodeRows: Array<{ code: string; variant_id: string }> = await AppDataSource.query(
        `SELECT LOWER(b.barcode) AS code, MIN(b.variant_id) AS variant_id
           FROM barcodes b
           JOIN variants v ON v.id = b.variant_id AND v.deleted_at IS NULL
           JOIN catalog_items ci ON ci.id = v.catalog_item_id AND ci.organization_id = ? AND ci.deleted_at IS NULL
          WHERE LOWER(b.barcode) IN (?)
          GROUP BY LOWER(b.barcode)`,
        [organizationId, [...skus]]
      );
      for (const r of barcodeRows) resolver.byBarcode.set(r.code, String(r.variant_id));
    }

    if (externalIds.size) {
      // Fall back to channel mappings written by the product sync. Product-level
      // mappings have no variant, so use the item's first variant.
      const rows: Array<{
        channel_product_id: string | null;
        channel_variant_id: string | null;
        variant_id: string;
      }> = await AppDataSource.query(
        `SELECT m.channel_product_id, m.channel_variant_id,
                COALESCE(m.variant_id,
                  (SELECT MIN(v.id) FROM variants v
                    WHERE v.catalog_item_id = m.catalog_item_id AND v.deleted_at IS NULL)) AS variant_id
           FROM channel_mappings m
           JOIN catalog_items ci ON ci.id = m.catalog_item_id AND ci.organization_id = ?
          WHERE m.channel IN (?)
            AND (m.channel_variant_id IN (?) OR m.channel_product_id IN (?))`,
        [organizationId, mappingChannelsFor(channel), [...externalIds], [...externalIds]]
      );
      for (const m of rows) {
        if (!m.variant_id) continue;
        const variantId = String(m.variant_id);
        if (m.channel_variant_id) resolver.byExternalId.set(m.channel_variant_id, variantId);
        // A product id maps via its product-level row when there is one.
        if (m.channel_product_id && (!m.channel_variant_id || !resolver.byExternalId.has(m.channel_product_id))) {
          resolver.byExternalId.set(m.channel_product_id, variantId);
        }
      }
    }

    return resolver;
  }

  resolve(line: ParsedExternalOrderLine): string | null {
    if (line.sku) {
      const key = line.sku.toLowerCase();
      const bySku = this.bySku.get(key) ?? this.byItemSku.get(key) ?? this.byBarcode.get(key);
      if (bySku) return bySku;
    }
    for (const id of [line.externalProductId, line.externalParentProductId]) {
      if (!id) continue;
      const byExt = this.byExternalId.get(id);
      if (byExt) return byExt;
    }
    return null;
  }
}

/**
 * Build order lines for an imported order. Lines that cannot be matched to a
 * catalog variant are still saved with their channel name/SKU/price and a null
 * variant, so the order is never left without lines.
 */
export function buildImportedOrderLines(
  orderId: string,
  parsed: ParsedExternalOrder,
  resolver: VariantResolver
): { lines: OrderLine[]; unmatchedSkus: string[] } {
  const lineRepo = AppDataSource.getRepository(OrderLine);
  const unmatchedSkus: string[] = [];
  const lines = parsed.lines.map((line) => {
    const variantId = resolver.resolve(line);
    if (!variantId) unmatchedSkus.push(line.sku || line.name);
    return lineRepo.create({
      order: { id: orderId } as Order,
      variant: variantId ? ({ id: variantId } as Variant) : null,
      sku: (line.sku ?? '').slice(0, 100),
      name: line.name.slice(0, 500),
      quantity: line.quantity,
      unitPrice: line.unitPrice,
      discountAmount: line.discountAmount,
      taxRate: line.taxRate,
      taxAmount: line.taxAmount,
      lineTotal: line.lineTotal,
      costPrice: null,
      quantityFulfilled: parsed.fulfillmentStatus === 'fulfilled' ? line.quantity : 0,
      warehouse: null,
      fulfillmentStatus:
        parsed.fulfillmentStatus === 'fulfilled'
          ? 'shipped'
          : parsed.fulfillmentStatus === 'cancelled'
            ? 'cancelled'
            : 'pending',
      notes: variantId ? (line.notes ?? null) : UNMATCHED_NOTE
    });
  });
  return { lines, unmatchedSkus };
}

const UNMATCHED_NOTE = 'Not matched to a catalog product';

/**
 * Re-link previously saved lines that have no catalog variant, using the channel's
 * current line data (pairs lines by name). Fills an empty SKU from the channel too.
 * Only touches lines whose variant is still null, so it is safe to run repeatedly.
 */
export function relinkUnmatchedLines(
  existing: OrderLine[],
  parsed: ParsedExternalOrder,
  resolver: VariantResolver
): OrderLine[] {
  const pool = [...parsed.lines];
  const changed: OrderLine[] = [];
  for (const line of existing) {
    if (line.variant) continue;
    const key = (line.name ?? '').trim().toLowerCase();
    const idx = pool.findIndex((p) => p.name.slice(0, 500).trim().toLowerCase() === key);
    if (idx < 0) continue;
    const [source] = pool.splice(idx, 1);
    let touched = false;
    if (!line.sku && source.sku) {
      line.sku = source.sku.slice(0, 100);
      touched = true;
    }
    const variantId = resolver.resolve({ ...source, sku: source.sku || line.sku || null });
    if (variantId) {
      line.variant = { id: variantId } as Variant;
      if (line.notes === UNMATCHED_NOTE) line.notes = null;
      touched = true;
    }
    if (touched) changed.push(line);
  }
  return changed;
}

async function resolveCustomer(
  parsed: ParsedExternalOrder,
  organizationId: string,
  summary: OrderImportSummary
): Promise<Customer | null> {
  const email = parsed.customerEmail?.trim().toLowerCase();
  if (!email) return null;

  const repo = AppDataSource.getRepository(Customer);
  const existing = await repo
    .createQueryBuilder('c')
    .where('c.organization_id = :orgId', { orgId: organizationId })
    .andWhere('LOWER(c.email) = :email', { email })
    .andWhere('c.deleted_at IS NULL')
    .getOne();

  if (existing) {
    summary.customersLinked++;
    return existing;
  }

  const created = await repo.save(
    repo.create({
      organization: { id: organizationId } as Organization,
      email,
      phone: parsed.customerPhone ?? null,
      firstName: parsed.customerFirstName ?? null,
      lastName: parsed.customerLastName ?? null,
      companyName: parsed.customerCompany ?? null,
      customerType: parsed.customerCompany ? 'business' : 'individual',
      status: 'active'
    })
  );
  summary.customersCreated++;
  return created;
}

const FULFILLMENT_RANK: Record<Order['fulfillmentStatus'], number> = {
  pending: 0,
  processing: 1,
  partially_fulfilled: 2,
  fulfilled: 3,
  cancelled: 4
};

/** Apply the mutable header fields from the channel onto an order. */
function applyHeader(order: Order, parsed: ParsedExternalOrder): void {
  // Re-syncs must not roll back pick/pack/ship progress recorded in the ERP.
  const keepLocalFulfillment =
    order.id &&
    parsed.fulfillmentStatus !== 'cancelled' &&
    FULFILLMENT_RANK[order.fulfillmentStatus] > FULFILLMENT_RANK[parsed.fulfillmentStatus];
  order.channelOrderId = parsed.externalId;
  order.channelOrderNumber = parsed.externalNumber;
  order.orderDate = parsed.orderDate;
  order.currency = parsed.currency;
  order.subtotal = parsed.subtotal;
  order.discountAmount = parsed.discountAmount;
  order.shippingAmount = parsed.shippingAmount;
  order.taxAmount = parsed.taxAmount;
  order.total = parsed.total;
  order.status = parsed.status;
  order.paymentStatus = parsed.paymentStatus;
  if (!keepLocalFulfillment) order.fulfillmentStatus = parsed.fulfillmentStatus;
  order.customerEmail = parsed.customerEmail ?? null;
  order.customerPhone = parsed.customerPhone ?? null;
  order.customerNotes = parsed.customerNotes ?? null;
  order.internalNotes = parsed.internalNotes ?? null;
  order.shippingMethod = parsed.shippingMethod ?? null;
  order.completedAt = parsed.completedAt ?? null;
  order.cancelledAt = parsed.cancelledAt ?? null;
}

/**
 * Ensure the generated `order_number` is unique. Channel ids are already
 * namespaced per connection, so a collision means the same order arrived under
 * a different external id — suffix it rather than failing the whole import.
 */
async function ensureUniqueOrderNumber(base: string): Promise<string> {
  const repo = AppDataSource.getRepository(Order);
  let candidate = base.slice(0, 100);
  for (let attempt = 1; attempt <= 20; attempt++) {
    const clash = await repo.findOne({ where: { orderNumber: candidate }, select: { id: true } });
    if (!clash) return candidate;
    const suffix = `-${attempt}`;
    candidate = `${base.slice(0, 100 - suffix.length)}${suffix}`;
  }
  return `${base.slice(0, 88)}-${Date.now().toString(36)}`;
}

export async function runOrderImport(
  orders: ParsedExternalOrder[],
  options: OrderImportOptions
): Promise<OrderImportSummary> {
  const summary: OrderImportSummary = {
    ordersCreated: 0,
    ordersUpdated: 0,
    ordersSkipped: 0,
    linesCreated: 0,
    linesUnmatched: 0,
    paymentsCreated: 0,
    paymentsSkipped: 0,
    customersCreated: 0,
    customersLinked: 0,
    addressesCreated: 0,
    errors: [],
    unmatchedSkus: []
  };

  if (!orders.length) return summary;

  const orderRepo = AppDataSource.getRepository(Order);
  const lineRepo = AppDataSource.getRepository(OrderLine);
  const addressRepo = AppDataSource.getRepository(OrderAddress);
  const paymentRepo = AppDataSource.getRepository(Payment);

  const resolver = await VariantResolver.build(orders, orders[0].channel, options.organizationId);
  const unmatched = new Set<string>();

  for (const parsed of orders) {
    try {
      const existing = await orderRepo.findOne({
        where: {
          organization: { id: options.organizationId },
          channel: parsed.channel,
          channelOrderId: parsed.externalId
        },
        relations: ['lines', 'lines.variant']
      });

      let order: Order;

      if (existing) {
        if (!options.updateExisting) {
          summary.ordersSkipped++;
          continue;
        }
        applyHeader(existing, parsed);
        // Backfill the source store on orders imported before it was tracked.
        existing.channelConnection = { id: options.connectionId } as ChannelConnection;
        order = await orderRepo.save(existing);
        summary.ordersUpdated++;
      } else {
        const customer = options.createCustomers
          ? await resolveCustomer(parsed, options.organizationId, summary)
          : null;

        const fresh = orderRepo.create({
          organization: { id: options.organizationId } as Organization,
          businessUnit: null,
          orderNumber: await ensureUniqueOrderNumber(parsed.orderNumber),
          channel: parsed.channel,
          channelConnection: { id: options.connectionId } as ChannelConnection,
          customer,
          createdBy: null
        });
        applyHeader(fresh, parsed);
        order = await orderRepo.save(fresh);
        summary.ordersCreated++;
      }

      // Lines: only populate when the order has none, so re-imports never duplicate.
      const hasLines = (existing?.lines?.length ?? 0) > 0;
      if (!hasLines && parsed.lines.length) {
        const { lines, unmatchedSkus } = buildImportedOrderLines(order.id, parsed, resolver);
        summary.linesUnmatched += unmatchedSkus.length;
        for (const sku of unmatchedSkus) unmatched.add(sku);
        await lineRepo.save(lines);
        summary.linesCreated += lines.length;
      } else if (hasLines && parsed.lines.length) {
        const relinked = relinkUnmatchedLines(existing!.lines, parsed, resolver);
        if (relinked.length) await lineRepo.save(relinked);
      }

      // Addresses: same guard — only on first import of the order.
      if (!existing && parsed.addresses.length) {
        const addresses = parsed.addresses.map((a) =>
          addressRepo.create({
            order: { id: order.id } as Order,
            addressType: a.type,
            firstName: a.firstName ?? null,
            lastName: a.lastName ?? null,
            company: a.company ?? null,
            addressLine1: a.addressLine1,
            addressLine2: a.addressLine2 ?? null,
            city: a.city,
            stateProvince: a.stateProvince ?? null,
            postalCode: a.postalCode,
            countryCode: a.countryCode,
            phone: a.phone ?? null,
            email: a.email ?? null
          })
        );
        await addressRepo.save(addresses);
        summary.addressesCreated += addresses.length;
      }

      if (options.importPayments) {
        for (const p of parsed.payments) {
          const dupe = await paymentRepo.findOne({
            where: { organizationId: options.organizationId, transactionId: p.externalId },
            select: { id: true }
          });
          if (dupe) {
            summary.paymentsSkipped++;
            continue;
          }
          await paymentRepo.save(
            paymentRepo.create({
              organizationId: options.organizationId,
              orderId: order.id,
              transactionId: p.externalId.slice(0, 255),
              paymentMethod: p.method,
              paymentType: 'sale',
              amount: p.amount,
              currency: p.currency,
              feeAmount: 0,
              status: p.status,
              paymentDate: p.paidAt,
              reference: p.reference?.slice(0, 255),
              payerEmail: p.payerEmail?.slice(0, 255),
              payerName: p.payerName?.slice(0, 255),
              gatewayResponse: p.raw ?? null,
              processedAt: p.status === 'completed' ? p.paidAt : undefined,
              notes: `Imported from ${parsed.channel === 'pos' ? 'Good Till EPOS' : parsed.channel}`
            })
          );
          summary.paymentsCreated++;
        }
      }
    } catch (err) {
      summary.errors.push({
        order: parsed.externalNumber ?? parsed.externalId,
        message: err instanceof Error ? err.message : 'Order import failed'
      });
    }
  }

  summary.unmatchedSkus = [...unmatched].slice(0, 100);
  return summary;
}
