/**
 * Good Till (SumUp POS) sales → channel-neutral orders/payments.
 *
 * Good Till models a till transaction as a "sale": `sales_details.sales_items`
 * are the receipt lines and `sales_payments_history` are the tenders applied.
 */

import {
  GoodTillApiClient,
  type GoodTillCredentials,
  type GoodTillSaleDetail,
  type GoodTillSaleItem,
  type GoodTillSalePayment
} from './goodtillApiClient.js';
import type {
  ParsedExternalOrder,
  ParsedExternalOrderLine,
  ParsedExternalPayment,
  ParsedPaymentMethod
} from './externalOrderTypes.js';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Good Till tender codes → Rabs Interiors payment methods. */
function mapPaymentMethod(method: string): ParsedPaymentMethod {
  const m = (method ?? '').trim().toUpperCase();
  if (m === 'CASH') return 'cash';
  if (m.includes('CARD') || m.includes('CREDIT') || m.includes('DEBIT') || m === 'SUMUP') return 'card';
  if (m.includes('PAYPAL')) return 'paypal';
  if (m.includes('BANK') || m.includes('TRANSFER')) return 'bank_transfer';
  if (m.includes('CHEQUE') || m.includes('CHECK')) return 'check';
  return 'other';
}

/**
 * Good Till reports naive local datetimes ('2026-07-15 12:15:44').
 * Parse as local time rather than letting JS treat it as UTC.
 */
function parseGoodTillDate(value: string | null | undefined): Date {
  if (!value) return new Date();
  const m = /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(value);
  if (!m) {
    const fallback = new Date(value);
    return Number.isNaN(fallback.getTime()) ? new Date() : fallback;
  }
  return new Date(
    Number(m[1]),
    Number(m[2]) - 1,
    Number(m[3]),
    Number(m[4]),
    Number(m[5]),
    Number(m[6])
  );
}

function mapLine(item: GoodTillSaleItem): ParsedExternalOrderLine | null {
  if (item.is_removed) return null;

  const quantity = Math.max(1, Math.round(num(item.quantity)));
  const lineTotal = num(item.line_total_after_discount);
  const taxAmount = num(item.line_vat_after_discount);
  // vat_rate arrives as a percentage ('20.000'); OrderLine.taxRate is a fraction.
  const taxRate = num(item.vat_rate) / 100;

  return {
    sku: item.product_sku?.trim() || null,
    externalProductId: item.product_id ?? null,
    name: item.product_name || item.product_sku || 'POS item',
    quantity,
    unitPrice: num(item.price_inc_vat_per_item),
    discountAmount: num(item.discount_amount),
    taxRate,
    taxAmount,
    lineTotal,
    notes: item.item_notes?.trim() || null
  };
}

function mapPayment(
  p: GoodTillSalePayment,
  currency: string,
  saleId: string
): ParsedExternalPayment | null {
  // `payment_amount` is the tender net of change given; `*_actual` includes change.
  const amount = num(p.payment_amount);
  if (amount <= 0) return null;

  return {
    externalId: p.id || `${saleId}-${p.payment_method}-${p.payment_date_time}`,
    method: mapPaymentMethod(p.payment_method),
    amount,
    currency,
    paidAt: parseGoodTillDate(p.payment_date_time),
    status: 'completed',
    reference: p.payment_method ?? null,
    raw: { ...p, source: 'goodtill', sales_id: saleId }
  };
}

/** Map one Good Till sale into the neutral order shape. */
export function mapGoodTillSale(
  sale: GoodTillSaleDetail,
  opts: { connectionId: string; currency: string }
): ParsedExternalOrder {
  const details = sale.sales_details ?? {};
  const items = details.sales_items ?? [];

  const lines = items
    .map(mapLine)
    .filter((l): l is ParsedExternalOrderLine => l !== null);

  const voided = (sale.order_status ?? '').toUpperCase() === 'VOIDED';
  const orderDate = parseGoodTillDate(sale.sales_date_time);

  const shippingAmount = num(details.delivery_charge) + num(details.service_charge);
  const taxAmount = num(details.total_vat);
  const total = num(details.total);
  const subtotal = num(details.total_ex_vat);
  const discountAmount = num(details.line_discount) + num(details.promo_offers);

  const payments = voided
    ? []
    : (sale.sales_payments_history ?? [])
        .map((p) => mapPayment(p, opts.currency, sale.id))
        .filter((p): p is ParsedExternalPayment => p !== null);

  const paidTotal = payments.reduce((sum, p) => sum + p.amount, 0);
  const receipt = sale.receipt_no?.trim() || String(sale.order_no ?? '');

  return {
    channel: 'pos',
    externalId: sale.id,
    externalNumber: receipt || null,
    // Namespaced by connection so re-imports and other channels never collide.
    orderNumber: `POS${opts.connectionId}-${receipt || sale.id.slice(0, 8)}`,
    orderDate,
    currency: opts.currency,
    subtotal,
    discountAmount,
    shippingAmount,
    taxAmount,
    total,
    status: voided ? 'cancelled' : 'completed',
    paymentStatus: voided
      ? 'failed'
      : paidTotal <= 0
        ? 'pending'
        : paidTotal + 0.01 < total
          ? 'partially_paid'
          : 'paid',
    // A completed till sale is handed over at the counter.
    fulfillmentStatus: voided ? 'cancelled' : 'fulfilled',
    customerNotes: sale.order_notes?.trim() || null,
    internalNotes: [
      `Imported from Good Till EPOS (${sale.sale_type ?? 'INSTORE'})`,
      receipt ? `Receipt ${receipt}` : null,
      `Sale ${sale.id}`
    ]
      .filter(Boolean)
      .join(' · '),
    completedAt: voided ? null : orderDate,
    cancelledAt: voided ? orderDate : null,
    lines,
    payments,
    addresses: []
  };
}

/** Fetch and map Good Till sales for a date range. */
export async function fetchGoodTillOrders(
  creds: GoodTillCredentials,
  opts: {
    connectionId: string;
    from: Date;
    to: Date;
    includeVoided?: boolean;
    currency?: string;
    maxSales?: number;
  }
): Promise<ParsedExternalOrder[]> {
  const client = new GoodTillApiClient(creds);
  await client.login();

  const sales = await client.getSalesDetails({
    from: opts.from,
    to: opts.to,
    includeVoided: opts.includeVoided,
    maxSales: opts.maxSales
  });

  const currency = opts.currency ?? 'GBP';
  return sales.map((s) => mapGoodTillSale(s, { connectionId: opts.connectionId, currency }));
}
