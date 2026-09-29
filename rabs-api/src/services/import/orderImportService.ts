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

import { In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Order } from '@entities/orders/Order.js';
import { OrderLine } from '@entities/orders/OrderLine.js';
import { OrderAddress } from '@entities/orders/OrderAddress.js';
import { Customer } from '@entities/orders/Customer.js';
import { Variant } from '@entities/catalog/Variant.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { Payment } from '@entities/finance/Payment.js';
import { Organization } from '@entities/iam/Organization.js';

import type {
  OrderImportOptions,
  OrderImportSummary,
  ParsedExternalOrder,
  ParsedExternalOrderLine
} from './externalOrderTypes.js';

/** Resolves external line identifiers to ABS Interiors catalog variants. */
class VariantResolver {
  private bySku = new Map<string, string>();
  private byExternalId = new Map<string, string>();

  static async build(
    orders: ParsedExternalOrder[],
    channel: ParsedExternalOrder['channel']
  ): Promise<VariantResolver> {
    const resolver = new VariantResolver();

    const skus = new Set<string>();
    const externalIds = new Set<string>();
    for (const o of orders) {
      for (const l of o.lines) {
        if (l.sku) skus.add(l.sku.toLowerCase());
        if (l.externalProductId) externalIds.add(l.externalProductId);
      }
    }

    if (skus.size) {
      // Match on variant SKU, case-insensitively.
      const variants = await AppDataSource.getRepository(Variant)
        .createQueryBuilder('v')
        .select(['v.id', 'v.variantSku'])
        .where('LOWER(v.variant_sku) IN (:...skus)', { skus: [...skus] })
        .andWhere('v.deleted_at IS NULL')
        .getMany();
      for (const v of variants) {
        resolver.bySku.set(String(v.variantSku).toLowerCase(), v.id);
      }
    }

    if (externalIds.size) {
      // Fall back to channel mappings written by the product sync.
      const mappingChannel = channel === 'pos' ? 'pos' : channel;
      const mappings = await AppDataSource.getRepository(ChannelMapping).find({
        where: [
          { channel: mappingChannel as ChannelMapping['channel'], channelVariantId: In([...externalIds]) },
          { channel: mappingChannel as ChannelMapping['channel'], channelProductId: In([...externalIds]) }
        ],
        relations: ['variant']
      });
      for (const m of mappings) {
        if (!m.variant) continue;
        if (m.channelVariantId) resolver.byExternalId.set(m.channelVariantId, m.variant.id);
        if (m.channelProductId) resolver.byExternalId.set(m.channelProductId, m.variant.id);
      }
    }

    return resolver;
  }

  resolve(line: ParsedExternalOrderLine): string | null {
    if (line.sku) {
      const bySku = this.bySku.get(line.sku.toLowerCase());
      if (bySku) return bySku;
    }
    if (line.externalProductId) {
      const byExt = this.byExternalId.get(line.externalProductId);
      if (byExt) return byExt;
    }
    return null;
  }
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

/** Apply the mutable header fields from the channel onto an order. */
function applyHeader(order: Order, parsed: ParsedExternalOrder): void {
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
  order.fulfillmentStatus = parsed.fulfillmentStatus;
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

  const resolver = await VariantResolver.build(orders, orders[0].channel);
  const unmatched = new Set<string>();

  for (const parsed of orders) {
    try {
      const existing = await orderRepo.findOne({
        where: {
          organization: { id: options.organizationId },
          channel: parsed.channel,
          channelOrderId: parsed.externalId
        },
        relations: ['lines']
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
        const toSave: OrderLine[] = [];
        for (const line of parsed.lines) {
          const variantId = resolver.resolve(line);
          if (!variantId) {
            summary.linesUnmatched++;
            if (line.sku) unmatched.add(line.sku);
            continue;
          }
          toSave.push(
            lineRepo.create({
              order: { id: order.id } as Order,
              variant: { id: variantId } as Variant,
              sku: (line.sku ?? '').slice(0, 100),
              name: line.name.slice(0, 500),
              quantity: line.quantity,
              unitPrice: line.unitPrice,
              discountAmount: line.discountAmount,
              taxRate: line.taxRate,
              taxAmount: line.taxAmount,
              lineTotal: line.lineTotal,
              costPrice: null,
              quantityFulfilled:
                parsed.fulfillmentStatus === 'fulfilled' ? line.quantity : 0,
              warehouse: null,
              fulfillmentStatus:
                parsed.fulfillmentStatus === 'fulfilled'
                  ? 'shipped'
                  : parsed.fulfillmentStatus === 'cancelled'
                    ? 'cancelled'
                    : 'pending',
              notes: line.notes ?? null
            })
          );
        }
        if (toSave.length) {
          await lineRepo.save(toSave);
          summary.linesCreated += toSave.length;
        }
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
