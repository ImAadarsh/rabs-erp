/**
 * Channel-neutral order/payment shapes.
 *
 * Every external source (Good Till EPOS, WooCommerce, Shopify, …) maps its
 * payload into these types, so `orderImportService` stays source-agnostic.
 */

export type OrderChannel = 'pos' | 'woocommerce' | 'shopify';

export type ParsedPaymentMethod =
  | 'card'
  | 'bank_transfer'
  | 'paypal'
  | 'cash'
  | 'check'
  | 'other';

export interface ParsedExternalOrderLine {
  /** SKU used to resolve the RABS catalog variant. */
  sku: string | null;
  /** External product id, used as a fallback lookup via ChannelMapping. */
  externalProductId: string | null;
  name: string;
  quantity: number;
  /** Unit price including tax where the channel reports it that way. */
  unitPrice: number;
  discountAmount: number;
  /** Tax rate as a fraction (0.2 for 20%), matching OrderLine.taxRate scale. */
  taxRate: number;
  taxAmount: number;
  lineTotal: number;
  notes?: string | null;
}

export interface ParsedExternalPayment {
  /** Stable external id — the idempotency key for payments. */
  externalId: string;
  method: ParsedPaymentMethod;
  amount: number;
  currency: string;
  paidAt: Date;
  status: 'pending' | 'completed' | 'failed' | 'refunded';
  reference?: string | null;
  payerName?: string | null;
  payerEmail?: string | null;
  /** Raw channel payload, stored on Payment.gatewayResponse for traceability. */
  raw?: Record<string, unknown>;
}

export interface ParsedExternalAddress {
  type: 'billing' | 'shipping';
  firstName?: string | null;
  lastName?: string | null;
  company?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  stateProvince?: string | null;
  postalCode: string;
  countryCode: string;
  phone?: string | null;
  email?: string | null;
}

export interface ParsedExternalOrder {
  channel: OrderChannel;
  /** External order id — the idempotency key for orders. */
  externalId: string;
  /** Human-facing external reference (receipt no / Woo order number). */
  externalNumber: string | null;
  /** RABS-side unique order number, namespaced per connection. */
  orderNumber: string;
  orderDate: Date;
  currency: string;
  subtotal: number;
  discountAmount: number;
  shippingAmount: number;
  taxAmount: number;
  total: number;
  status: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded' | 'on_hold';
  paymentStatus: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'refunded' | 'failed';
  fulfillmentStatus: 'pending' | 'processing' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';
  customerEmail?: string | null;
  customerPhone?: string | null;
  customerFirstName?: string | null;
  customerLastName?: string | null;
  customerCompany?: string | null;
  customerNotes?: string | null;
  internalNotes?: string | null;
  shippingMethod?: string | null;
  completedAt?: Date | null;
  cancelledAt?: Date | null;
  lines: ParsedExternalOrderLine[];
  payments: ParsedExternalPayment[];
  addresses: ParsedExternalAddress[];
}

export interface OrderImportOptions {
  organizationId: string;
  /** Channel connection the orders were pulled from, recorded on each order. */
  connectionId: string;
  /** Create/link Customer records from channel billing details. */
  createCustomers: boolean;
  /** Import the payment records attached to each order. */
  importPayments: boolean;
  /** Update orders that already exist (status/totals) instead of skipping. */
  updateExisting: boolean;
}

export interface OrderImportSummary {
  ordersCreated: number;
  ordersUpdated: number;
  ordersSkipped: number;
  linesCreated: number;
  /** Lines whose SKU could not be matched to a RABS catalog variant. */
  linesUnmatched: number;
  paymentsCreated: number;
  paymentsSkipped: number;
  customersCreated: number;
  customersLinked: number;
  addressesCreated: number;
  errors: Array<{ order: string; message: string }>;
  /** SKUs that had no catalog match, for surfacing in the UI. */
  unmatchedSkus: string[];
}
