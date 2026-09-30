import { EntityManager, In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Invoice } from '@entities/finance/Invoice.js';
import { InvoiceLine } from '@entities/finance/InvoiceLine.js';
import { Payment } from '@entities/finance/Payment.js';
import { Order } from '@entities/orders/Order.js';
import { Customer } from '@entities/orders/Customer.js';

/**
 * Channels that represent genuine trading activity. Demo/seed orders carry an
 * empty channel, so they are excluded from bulk generation.
 */
export const INVOICEABLE_CHANNELS = [
    'amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce',
    'wix', 'b2b_portal', 'pos', 'phone', 'email', 'other'
] as const;

export const WALK_IN_CUSTOMER_NUMBER = 'WALK-IN';

const num = (v: unknown) => {
    const n = Number(v ?? 0);
    return Number.isFinite(n) ? n : 0;
};

const round = (n: number) => Math.round(n * 10000) / 10000;

/**
 * Sequential per-organization invoice number, e.g. `INV-2026-00042`.
 *
 * `invoice_number` is globally unique, so the counter walks past any number
 * already taken rather than relying on the row count.
 */
export async function nextInvoiceNumber(manager: EntityManager, organizationId: string, year?: number) {
    const yr = year ?? new Date().getFullYear();
    const prefix = `INV-${yr}-`;

    const rows = await manager.getRepository(Invoice)
        .createQueryBuilder('i')
        .select('i.invoice_number', 'invoiceNumber')
        .where('i.invoice_number LIKE :prefix', { prefix: `${prefix}%` })
        .getRawMany<{ invoiceNumber: string }>();

    let max = 0;
    for (const r of rows) {
        const seq = parseInt(r.invoiceNumber.slice(prefix.length), 10);
        if (Number.isFinite(seq) && seq > max) max = seq;
    }

    return (seq: number) => `${prefix}${String(max + seq).padStart(5, '0')}`;
}

/**
 * Invoice status derived from how the order was paid. Orders that were
 * cancelled or refunded produce a cancelled invoice so the document still
 * exists for the audit trail.
 */
function statusForOrder(order: Order, paidAmount: number, total: number) {
    if (order.status === 'cancelled') return 'cancelled';
    if (order.status === 'refunded' || order.paymentStatus === 'refunded') return 'written_off';
    if (total > 0 && paidAmount >= total - 0.0001) return 'paid';
    if (paidAmount > 0) return 'partially_paid';
    if (order.paymentStatus === 'failed') return 'overdue';
    return 'sent';
}

/**
 * Turns an order's lines into invoice lines. Channel imports frequently arrive
 * without line detail, in which case the order total becomes a single summary
 * line so the invoice still balances.
 */
function buildLines(order: Order, manager: EntityManager) {
    const repo = manager.getRepository(InvoiceLine);
    const orderLines = order.lines ?? [];

    if (orderLines.length > 0) {
        return orderLines.map((l) => {
            const quantity = num(l.quantity) || 1;
            const unitPrice = num(l.unitPrice);
            const discountAmount = num(l.discountAmount);
            const taxAmount = num(l.taxAmount);
            const gross = quantity * unitPrice - discountAmount;
            return repo.create({
                orderLineId: l.id,
                description: l.sku ? `${l.name} (${l.sku})` : l.name,
                quantity,
                unitPrice,
                discountPercent: 0,
                discountAmount,
                // order_lines stores tax_rate as a fraction (0.2000 = 20%)
                taxRate: num(l.taxRate),
                taxAmount,
                lineTotal: round(gross)
            });
        });
    }

    const subtotal = num(order.subtotal) || num(order.total) - num(order.taxAmount) - num(order.shippingAmount);
    const label = order.channelOrderNumber
        ? `Goods supplied — order ${order.orderNumber} (channel ref ${order.channelOrderNumber})`
        : `Goods supplied — order ${order.orderNumber}`;

    return [repo.create({
        description: label,
        quantity: 1,
        unitPrice: round(subtotal),
        discountPercent: 0,
        discountAmount: 0,
        taxRate: 0,
        taxAmount: num(order.taxAmount),
        lineTotal: round(subtotal)
    })];
}

/**
 * Till sales are anonymous, but `invoices.customer_id` is mandatory. A single
 * reusable "Walk-in Customer" per organization stands in for them, mirroring
 * how retail systems record cash trade.
 */
async function walkInCustomerId(manager: EntityManager, organizationId: string) {
    const repo = manager.getRepository(Customer);
    const existing = await repo.findOne({
        where: { customerNumber: WALK_IN_CUSTOMER_NUMBER, organization: { id: organizationId } },
        select: { id: true }
    });
    if (existing) return existing.id;

    const created = await repo.save(repo.create({
        organization: { id: organizationId } as any,
        customerNumber: WALK_IN_CUSTOMER_NUMBER,
        firstName: 'Walk-in',
        lastName: 'Customer',
        customerType: 'individual',
        notes: 'Automatically used for anonymous point-of-sale transactions.'
    }));
    return created.id;
}

export interface GenerateResult {
    created: Invoice[];
    skipped: Array<{ orderId: string; orderNumber: string; reason: string }>;
}

/**
 * Creates exactly one invoice per order. Orders that already have an invoice
 * are skipped rather than duplicated, so this is safe to re-run.
 */
export async function generateInvoicesForOrders(
    organizationId: string,
    orderIds: string[],
    createdBy?: string
): Promise<GenerateResult> {
    const created: Invoice[] = [];
    const skipped: GenerateResult['skipped'] = [];

    if (orderIds.length === 0) return { created, skipped };

    await AppDataSource.transaction(async (manager) => {
        const orders = await manager.getRepository(Order).find({
            where: { id: In(orderIds), organization: { id: organizationId } },
            relations: ['lines', 'customer', 'businessUnit']
        });

        const found = new Set(orders.map((o) => String(o.id)));
        for (const id of orderIds) {
            if (!found.has(String(id))) {
                skipped.push({ orderId: id, orderNumber: '—', reason: 'Order not found in this organization' });
            }
        }
        if (orders.length === 0) return;

        const existing = await manager.getRepository(Invoice).find({
            where: { orderId: In(orders.map((o) => o.id)) },
            select: { id: true, orderId: true }
        });
        const invoiced = new Set(existing.map((i) => String(i.orderId)));

        const makeNumber = await nextInvoiceNumber(manager, organizationId);
        let walkInId: string | undefined;
        let seq = 0;

        for (const order of orders) {
            if (invoiced.has(String(order.id))) {
                skipped.push({ orderId: order.id, orderNumber: order.orderNumber, reason: 'Already invoiced' });
                continue;
            }

            let customerId = order.customer?.id;
            if (!customerId) {
                walkInId ??= await walkInCustomerId(manager, organizationId);
                customerId = walkInId;
            }

            const paid = await manager.getRepository(Payment)
                .createQueryBuilder('p')
                .select('SUM(p.amount)', 'total')
                .where('p.order_id = :orderId', { orderId: order.id })
                .andWhere('p.status = :status', { status: 'completed' })
                .andWhere('p.payment_type IN (:...types)', { types: ['sale', 'capture'] })
                .getRawOne<{ total: string | null }>();

            const paidAmount = round(num(paid?.total));
            const lines = buildLines(order, manager);

            const subtotal = round(lines.reduce((s, l) => s + num(l.lineTotal), 0));
            const taxAmount = round(num(order.taxAmount) || lines.reduce((s, l) => s + num(l.taxAmount), 0));
            const discountAmount = round(num(order.discountAmount));
            const shippingAmount = round(num(order.shippingAmount));
            // Trust the order total: channel imports are the source of truth for
            // what the customer was actually charged.
            const total = round(num(order.total) || subtotal + taxAmount + shippingAmount - discountAmount);

            const orderDate = order.orderDate ? new Date(order.orderDate) : new Date();
            const dueDate = new Date(orderDate);
            dueDate.setDate(dueDate.getDate() + 30);

            seq += 1;
            const invoice = manager.getRepository(Invoice).create({
                organizationId,
                orderId: order.id,
                customerId,
                businessUnitId: order.businessUnit?.id,
                invoiceNumber: makeNumber(seq),
                invoiceDate: orderDate,
                dueDate,
                currency: order.currency || 'GBP',
                subtotal,
                discountAmount,
                shippingAmount,
                taxAmount,
                total,
                paidAmount: Math.min(paidAmount, total),
                paymentTerms: 'Net 30',
                status: statusForOrder(order, paidAmount, total),
                notes: order.customerNotes ?? undefined,
                createdBy,
                lines
            });

            created.push(await manager.getRepository(Invoice).save(invoice));
        }
    });

    return { created, skipped };
}

/**
 * Restricts bulk generation to orders that arrived from a connected sales
 * channel (a web store or POS till). This deliberately excludes hand-created
 * and demo orders, which can still be invoiced individually by passing their
 * IDs to `generateInvoicesForOrders`.
 */
export function applyBulkEligibility<T extends { andWhere: Function }>(qb: T, organizationId: string): T {
    qb.andWhere('o.organization_id = :organizationId', { organizationId });
    qb.andWhere('o.channel IN (:...channels)', { channels: INVOICEABLE_CHANNELS });
    qb.andWhere('o.channel_connection_id IS NOT NULL');
    qb.andWhere('i.id IS NULL');
    return qb;
}

/** IDs of channel orders in the organization that have no invoice yet. */
export async function findUninvoicedOrderIds(organizationId: string, limit?: number) {
    const qb = AppDataSource.getRepository(Order)
        .createQueryBuilder('o')
        .select('o.id', 'id')
        .leftJoin(Invoice, 'i', 'i.order_id = o.id')
        .orderBy('o.order_date', 'DESC');

    applyBulkEligibility(qb, organizationId);
    if (limit) qb.limit(limit);

    const rows = await qb.getRawMany<{ id: string }>();
    return rows.map((r) => String(r.id));
}
