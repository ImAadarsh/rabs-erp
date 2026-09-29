/**
 * WooCommerce / WordPress orders → channel-neutral orders/payments.
 *
 * Uses the WooCommerce REST API (wc/v3), the same surface and auth modes as
 * `wordpressApiImport.ts` (application password or consumer key/secret).
 */

import type { WordPressApiCredentials } from './wordpressApiImport.js';
import type {
  ParsedExternalAddress,
  ParsedExternalOrder,
  ParsedExternalOrderLine,
  ParsedExternalPayment,
  ParsedPaymentMethod
} from './externalOrderTypes.js';

interface WcAddress {
  first_name?: string;
  last_name?: string;
  company?: string;
  address_1?: string;
  address_2?: string;
  city?: string;
  state?: string;
  postcode?: string;
  country?: string;
  email?: string;
  phone?: string;
}

interface WcLineItem {
  id: number;
  name: string;
  product_id: number;
  variation_id: number;
  quantity: number;
  sku?: string;
  price?: number | string;
  subtotal?: string;
  subtotal_tax?: string;
  total?: string;
  total_tax?: string;
}

export interface WcOrder {
  id: number;
  number: string;
  status: string;
  currency: string;
  date_created: string;
  date_paid: string | null;
  date_completed: string | null;
  discount_total: string;
  shipping_total: string;
  shipping_tax: string;
  total: string;
  total_tax: string;
  payment_method: string;
  payment_method_title: string;
  transaction_id: string;
  customer_note?: string;
  billing?: WcAddress;
  shipping?: WcAddress;
  line_items?: WcLineItem[];
  shipping_lines?: Array<{ method_title?: string }>;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function buildAuthHeader(creds: WordPressApiCredentials): string {
  if (creds.authMode === 'appPassword') {
    return `Basic ${Buffer.from(`${creds.username ?? ''}:${creds.appPassword ?? ''}`).toString('base64')}`;
  }
  return `Basic ${Buffer.from(`${creds.consumerKey ?? ''}:${creds.consumerSecret ?? ''}`).toString('base64')}`;
}

/** WooCommerce payment gateway ids → Rabs Interiors payment methods. */
function mapPaymentMethod(method: string, title: string): ParsedPaymentMethod {
  const m = `${method ?? ''} ${title ?? ''}`.toLowerCase();
  if (m.includes('bacs') || m.includes('bank')) return 'bank_transfer';
  if (m.includes('cheque') || m.includes('check')) return 'check';
  if (m.includes('cod') || m.includes('cash')) return 'cash';
  if (m.includes('paypal') || m.includes('ppcp')) return 'paypal';
  if (m.includes('stripe') || m.includes('card') || m.includes('sumup') || m.includes('square')) return 'card';
  return 'other';
}

interface StatusMapping {
  status: ParsedExternalOrder['status'];
  paymentStatus: ParsedExternalOrder['paymentStatus'];
  fulfillmentStatus: ParsedExternalOrder['fulfillmentStatus'];
}

function mapStatus(wcStatus: string, isPaid: boolean): StatusMapping {
  switch ((wcStatus ?? '').toLowerCase()) {
    case 'completed':
      return { status: 'completed', paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' };
    case 'processing':
      return { status: 'processing', paymentStatus: isPaid ? 'paid' : 'pending', fulfillmentStatus: 'processing' };
    case 'on-hold':
      return { status: 'on_hold', paymentStatus: isPaid ? 'paid' : 'pending', fulfillmentStatus: 'pending' };
    case 'cancelled':
      return { status: 'cancelled', paymentStatus: isPaid ? 'refunded' : 'failed', fulfillmentStatus: 'cancelled' };
    case 'refunded':
      return { status: 'refunded', paymentStatus: 'refunded', fulfillmentStatus: 'cancelled' };
    case 'failed':
      return { status: 'pending', paymentStatus: 'failed', fulfillmentStatus: 'pending' };
    case 'pending':
    case 'checkout-draft':
    default:
      return { status: 'pending', paymentStatus: isPaid ? 'paid' : 'pending', fulfillmentStatus: 'pending' };
  }
}

function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function mapLine(item: WcLineItem): ParsedExternalOrderLine {
  const quantity = Math.max(1, Math.round(num(item.quantity)));
  const lineSubtotal = num(item.subtotal);
  const lineTotal = num(item.total);
  const taxAmount = num(item.total_tax);
  // Woo reports amounts ex-tax; derive the effective rate from the line.
  const taxRate = lineTotal > 0 ? taxAmount / lineTotal : 0;
  const discountAmount = Math.max(0, lineSubtotal - lineTotal);

  return {
    sku: item.sku?.trim() || null,
    // Prefer the variation id — that is what maps to a Rabs Interiors variant.
    externalProductId: String(item.variation_id || item.product_id || ''),
    name: item.name || item.sku || 'Web item',
    quantity,
    unitPrice: num(item.price) || (quantity > 0 ? lineTotal / quantity : 0),
    discountAmount,
    taxRate,
    taxAmount,
    lineTotal: lineTotal + taxAmount,
    notes: null
  };
}

function mapAddress(
  a: WcAddress | undefined,
  type: 'billing' | 'shipping'
): ParsedExternalAddress | null {
  if (!a) return null;
  // OrderAddress requires line1/city/postcode/country — skip partial records.
  if (!a.address_1?.trim() || !a.city?.trim() || !a.postcode?.trim() || !a.country?.trim()) {
    return null;
  }
  return {
    type,
    firstName: a.first_name?.trim() || null,
    lastName: a.last_name?.trim() || null,
    company: a.company?.trim() || null,
    addressLine1: a.address_1.trim().slice(0, 255),
    addressLine2: a.address_2?.trim() || null,
    city: a.city.trim().slice(0, 100),
    stateProvince: a.state?.trim() || null,
    postalCode: a.postcode.trim().slice(0, 20),
    countryCode: a.country.trim().slice(0, 2).toUpperCase(),
    phone: a.phone?.trim() || null,
    email: a.email?.trim() || null
  };
}

/** Map one WooCommerce order into the neutral order shape. */
export function mapWooOrder(
  order: WcOrder,
  opts: { connectionId: string }
): ParsedExternalOrder {
  const datePaid = parseDate(order.date_paid);
  const isPaid = datePaid !== null;
  const { status, paymentStatus, fulfillmentStatus } = mapStatus(order.status, isPaid);

  const lines = (order.line_items ?? []).map(mapLine);
  const total = num(order.total);
  const taxAmount = num(order.total_tax);
  const shippingAmount = num(order.shipping_total) + num(order.shipping_tax);
  const discountAmount = num(order.discount_total);
  const orderDate = parseDate(order.date_created) ?? new Date();

  const addresses = [
    mapAddress(order.billing, 'billing'),
    mapAddress(order.shipping, 'shipping')
  ].filter((a): a is ParsedExternalAddress => a !== null);

  const billing = order.billing;
  const payerName = [billing?.first_name, billing?.last_name].filter(Boolean).join(' ').trim() || null;

  // Woo exposes a single payment per order; only record it once actually paid.
  const payments: ParsedExternalPayment[] = isPaid
    ? [
        {
          externalId: order.transaction_id?.trim() || `wc-${opts.connectionId}-${order.id}`,
          method: mapPaymentMethod(order.payment_method, order.payment_method_title),
          amount: total,
          currency: order.currency || 'GBP',
          paidAt: datePaid!,
          status: (order.status ?? '').toLowerCase() === 'refunded' ? 'refunded' : 'completed',
          reference: order.payment_method_title || order.payment_method || null,
          payerName,
          payerEmail: billing?.email?.trim() || null,
          raw: {
            source: 'woocommerce',
            order_id: order.id,
            payment_method: order.payment_method,
            payment_method_title: order.payment_method_title,
            transaction_id: order.transaction_id
          }
        }
      ]
    : [];

  return {
    channel: 'woocommerce',
    externalId: String(order.id),
    externalNumber: order.number ?? String(order.id),
    orderNumber: `WC${opts.connectionId}-${order.number ?? order.id}`,
    orderDate,
    currency: order.currency || 'GBP',
    // Woo totals are tax-exclusive; subtotal is the goods value before tax.
    subtotal: Math.max(0, total - taxAmount - shippingAmount + discountAmount),
    discountAmount,
    shippingAmount,
    taxAmount,
    total,
    status,
    paymentStatus,
    fulfillmentStatus,
    customerEmail: billing?.email?.trim() || null,
    customerPhone: billing?.phone?.trim() || null,
    customerFirstName: billing?.first_name?.trim() || null,
    customerLastName: billing?.last_name?.trim() || null,
    customerCompany: billing?.company?.trim() || null,
    customerNotes: order.customer_note?.trim() || null,
    internalNotes: `Imported from WooCommerce · order #${order.number ?? order.id}`,
    shippingMethod: order.shipping_lines?.[0]?.method_title?.trim() || null,
    completedAt: parseDate(order.date_completed),
    cancelledAt: (order.status ?? '').toLowerCase() === 'cancelled' ? orderDate : null,
    lines,
    payments,
    addresses
  };
}

/** Fetch and map WooCommerce orders, paginating through the REST API. */
export async function fetchWooOrders(
  creds: WordPressApiCredentials,
  opts: {
    connectionId: string;
    from?: Date;
    to?: Date;
    statuses?: string[];
    maxOrders?: number;
  }
): Promise<ParsedExternalOrder[]> {
  const base = normalizeUrl(creds.storeUrl);
  const auth = buildAuthHeader(creds);
  const perPage = 100;
  const maxOrders = opts.maxOrders ?? 5000;
  const collected: WcOrder[] = [];

  for (let page = 1; page <= Math.ceil(maxOrders / perPage) + 1; page++) {
    const qs = new URLSearchParams({
      per_page: String(perPage),
      page: String(page),
      orderby: 'date',
      order: 'desc'
    });
    if (opts.from) qs.set('after', opts.from.toISOString());
    if (opts.to) qs.set('before', opts.to.toISOString());
    if (opts.statuses?.length) qs.set('status', opts.statuses.join(','));

    const res = await fetch(`${base}/wp-json/wc/v3/orders?${qs.toString()}`, {
      headers: { Authorization: auth, 'Content-Type': 'application/json' }
    });

    if (!res.ok) {
      const text = await res.text();
      throw new Error(`WooCommerce orders API error (${res.status}): ${text.slice(0, 300)}`);
    }

    const batch = (await res.json()) as WcOrder[];
    if (!Array.isArray(batch) || batch.length === 0) break;
    collected.push(...batch);
    if (batch.length < perPage || collected.length >= maxOrders) break;
  }

  return collected
    .slice(0, maxOrders)
    .map((o) => mapWooOrder(o, { connectionId: opts.connectionId }));
}
