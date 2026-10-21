import { In, type EntityManager } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Customer } from '@entities/orders/Customer.js';
import { CustomerAddress } from '@entities/orders/CustomerAddress.js';
import { Order } from '@entities/orders/Order.js';
import { OrderLine } from '@entities/orders/OrderLine.js';
import { OrderAddress } from '@entities/orders/OrderAddress.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Payment } from '@entities/finance/Payment.js';
import { PaymentGateway } from '@entities/finance/PaymentGateway.js';
import { Invoice } from '@entities/finance/Invoice.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { B2bShipment } from '@entities/b2b/B2bShipment.js';
import { B2bShipmentEvent } from '@entities/b2b/B2bShipmentEvent.js';
import { B2bCreditLedger } from '@entities/b2b/B2bCreditLedger.js';
import { B2bShippingMethod } from '@entities/b2b/B2bShippingMethod.js';
import { resolveShippingPrice } from '@services/b2b/b2bShipping.service.js';
import { getOrCreateB2bSettings, listPortalProducts } from './b2bCatalog.service.js';
import { createWorldpayCardPayment } from '../payments/worldpay.service.js';
import { recordCouponUsage, validateCoupon } from '../marketing/coupon.service.js';
import { attributeOrderConversion } from '../marketing/affiliate.service.js';

function num(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function toMinorUnits(amount: number, currency: string): number {
  // Most currencies use 2 decimal places; Worldpay expects implied decimals
  void currency;
  return Math.round(Number(amount) * 100);
}

async function pickGateway(
  organizationId: string,
  method: 'card' | 'bank_transfer'
): Promise<PaymentGateway | null> {
  const gatewayRepo = AppDataSource.getRepository(PaymentGateway);
  const gateways = await gatewayRepo.find({
    where: { organizationId, isActive: true }
  });
  if (gateways.length === 0) return null;

  const preferred =
    method === 'card'
      ? ['worldpay', 'stripe', 'sumup', 'square', 'paypal', 'other']
      : ['open_banking', 'worldpay', 'manual'];

  for (const p of preferred) {
    const hit = gateways.find((g) => g.provider === p);
    if (hit) return hit;
  }
  return gateways.find((g) => g.isDefault) || gateways[0] || null;
}

function plural(unit: string, qty: number): string {
  if (qty === 1) return unit;
  return /(s|x|ch|sh)$/.test(unit) ? `${unit}es` : `${unit}s`;
}

/**
 * Rejects lines asking for more than the portal's available stock (on hand minus reserved,
 * in the item's sale unit). The B2B portal has no backorder setting, so nothing may oversell.
 */
function assertPortalStock(
  lines: { variantId: string; quantity: number }[],
  variantIndex: Map<string, { productName: string; sku: string; stockLevel: number; saleUnit: string }>
) {
  const requested = new Map<string, number>();
  for (const line of lines) {
    requested.set(line.variantId, (requested.get(line.variantId) ?? 0) + line.quantity);
  }
  const shortages: { variantId: string; sku: string; name: string; requested: number; available: number; saleUnit: string }[] = [];
  for (const [variantId, qty] of requested) {
    const v = variantIndex.get(variantId);
    if (!v) continue;
    if (qty > v.stockLevel) {
      shortages.push({ variantId, sku: v.sku, name: v.productName, requested: qty, available: v.stockLevel, saleUnit: v.saleUnit });
    }
  }
  if (!shortages.length) return;
  const message = shortages
    .map((s) =>
      s.available <= 0
        ? `${s.name} is out of stock`
        : `Only ${s.available} ${plural(s.saleUnit, s.available)} of ${s.name} available (you asked for ${s.requested})`
    )
    .join('; ');
  throw Object.assign(new Error(message), { status: 409, code: 'INSUFFICIENT_STOCK', shortages });
}

export async function createPortalOrder(opts: {
  organizationId: string;
  customer: Customer;
  lines: { variantId: string; quantity: number; unitPrice?: number }[];
  shippingMethod?: string;
  shippingMethodCode?: string;
  customerNotes?: string;
  paymentMethod?: 'bank_transfer' | 'card' | 'credit';
  addressId?: string;
  couponCode?: string;
  affiliateCode?: string;
  affiliateTrackingCode?: string;
  affiliateSessionId?: string;
  affiliateClickId?: string;
  /** Staff-placed orders may exceed portal stock; retailer orders never can. */
  allowOversell?: boolean;
  /** Staff orders paid on account: charge the retailer's trade credit in the same transaction (400 if over the limit). */
  chargeTradeCredit?: boolean;
  internalNotes?: string;
}) {
  if (!opts.lines.length) {
    throw Object.assign(new Error('Order must include at least one line'), { status: 400 });
  }

  const products = await listPortalProducts({ organizationId: opts.organizationId, customer: opts.customer });
  const variantIndex = new Map<
    string,
    { productName: string; sku: string; name: string; casePrice: number; vatRate: number; stockLevel: number; saleUnit: string }
  >();
  for (const p of products) {
    for (const v of p.variants) {
      variantIndex.set(v.id, {
        productName: p.name,
        sku: v.sku,
        name: v.name,
        casePrice: v.casePrice,
        vatRate: v.vatRate,
        stockLevel: v.stockLevel,
        saleUnit: v.saleUnit
      });
    }
  }

  if (!opts.allowOversell) {
    assertPortalStock(opts.lines, variantIndex);
  }

  const settings = await getOrCreateB2bSettings(opts.organizationId);
  const warehouse = settings.defaultWarehouse
    ? await AppDataSource.getRepository(Warehouse).findOne({ where: { id: settings.defaultWarehouse.id } })
    : null;

  let shippingAmount = 0;
  let shippingLabel = opts.shippingMethod ?? null;
  let shippingMethodRow: B2bShippingMethod | null = null;
  if (opts.shippingMethodCode) {
    shippingMethodRow = await AppDataSource.getRepository(B2bShippingMethod).findOne({
      where: { organization: { id: opts.organizationId }, code: opts.shippingMethodCode, isActive: true }
    });
    if (shippingMethodRow) {
      shippingLabel = shippingMethodRow.name;
    }
  }

  let subtotal = 0;
  let taxAmount = 0;
  const prepared: {
    variant: Variant;
    sku: string;
    name: string;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
  }[] = [];

  for (const line of opts.lines) {
    const priced = variantIndex.get(line.variantId);
    if (!priced) {
      throw Object.assign(new Error(`Variant ${line.variantId} is not available on the B2B portal`), { status: 400 });
    }
    if (line.quantity < 1) {
      throw Object.assign(new Error('Quantity must be at least 1'), { status: 400 });
    }
    const variant = await AppDataSource.getRepository(Variant).findOne({ where: { id: line.variantId } });
    if (!variant) {
      throw Object.assign(new Error(`Variant ${line.variantId} not found`), { status: 400 });
    }
    const unitPrice = line.unitPrice != null && line.unitPrice >= 0 ? line.unitPrice : priced.casePrice;
    const net = unitPrice * line.quantity;
    const vat = net * priced.vatRate;
    subtotal += net;
    taxAmount += vat;
    prepared.push({
      variant,
      sku: priced.sku,
      name: priced.name,
      quantity: line.quantity,
      unitPrice,
      taxRate: priced.vatRate,
      taxAmount: vat,
      lineTotal: net + vat
    });
  }

  let discountAmount = 0;
  let appliedCouponId: string | null = null;
  let freeShipping = false;

  if (opts.couponCode) {
    const validated = await validateCoupon({
      organizationId: opts.organizationId,
      couponCode: opts.couponCode,
      customerId: opts.customer.id,
      subtotal
    });
    discountAmount = validated.discountAmount;
    appliedCouponId = validated.coupon.id;
    freeShipping = validated.coupon.discountType === 'free_shipping';
  }

  // Resolve shipping after goods subtotal so free-over thresholds use net goods.
  if (shippingMethodRow && !freeShipping) {
    shippingAmount = resolveShippingPrice(shippingMethodRow, subtotal);
  } else if (freeShipping) {
    shippingAmount = 0;
  }

  // UK standard-rated freight: add 20% VAT on shipping (ex-VAT price stored on method).
  const shippingVatRate = 0.2;
  const shippingVat = shippingAmount > 0 ? shippingAmount * shippingVatRate : 0;
  taxAmount += shippingVat;

  const total = Number(Math.max(0, subtotal + taxAmount + shippingAmount - discountAmount).toFixed(4));
  const orderNumber = `ZM-${new Date().getFullYear()}-${String(Date.now()).slice(-8)}`;

  return AppDataSource.transaction(async (manager) => {
    const orderRepo = manager.getRepository(Order);
    const order = orderRepo.create({
      organization: { id: opts.organizationId } as any,
      orderNumber,
      channel: 'b2b_portal',
      customer: opts.customer,
      customerEmail: opts.customer.email,
      customerPhone: opts.customer.phone,
      orderDate: new Date(),
      currency: 'GBP',
      subtotal: Number(subtotal.toFixed(4)),
      discountAmount: Number(discountAmount.toFixed(4)),
      shippingAmount: Number(shippingAmount.toFixed(4)),
      taxAmount: Number(taxAmount.toFixed(4)),
      total,
      paymentStatus: 'pending',
      fulfillmentStatus: 'pending',
      shippingMethod: shippingLabel,
      customerNotes: opts.customerNotes ?? null,
      internalNotes: opts.internalNotes ?? null,
      status: 'confirmed'
    });
    await orderRepo.save(order);

    if (appliedCouponId && discountAmount >= 0) {
      await recordCouponUsage(manager, {
        couponId: appliedCouponId,
        orderId: order.id,
        customerId: opts.customer.id,
        discountAmount,
        currency: 'GBP'
      });
    }

    await attributeOrderConversion(manager, {
      organizationId: opts.organizationId,
      orderId: order.id,
      orderValue: total,
      currency: 'GBP',
      channel: 'b2b_portal',
      affiliateCode: opts.affiliateCode,
      trackingCode: opts.affiliateTrackingCode,
      sessionId: opts.affiliateSessionId,
      clickId: opts.affiliateClickId
    });

    const lineRepo = manager.getRepository(OrderLine);
    for (const line of prepared) {
      await lineRepo.save(
        lineRepo.create({
          order,
          variant: line.variant,
          sku: line.sku,
          name: line.name,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountAmount: 0,
          taxRate: line.taxRate,
          taxAmount: Number(line.taxAmount.toFixed(4)),
          lineTotal: Number(line.lineTotal.toFixed(4)),
          warehouse,
          fulfillmentStatus: 'pending'
        })
      );
    }

    const addresses = opts.customer.addresses ?? [];
    const addr =
      (opts.addressId ? addresses.find((a) => a.id === opts.addressId) : null) ||
      addresses.find((a) => a.isDefault) ||
      addresses[0];
    if (addr) {
      const oaRepo = manager.getRepository(OrderAddress);
      for (const type of ['shipping', 'billing'] as const) {
        await oaRepo.save(
          oaRepo.create({
            order,
            addressType: type,
            firstName: addr.firstName,
            lastName: addr.lastName,
            company: addr.company,
            addressLine1: addr.addressLine1,
            addressLine2: addr.addressLine2,
            city: addr.city,
            stateProvince: addr.stateProvince,
            postalCode: addr.postalCode,
            countryCode: addr.countryCode,
            phone: addr.phone,
            email: opts.customer.email
          })
        );
      }
    }

    const shipmentRepo = manager.getRepository(B2bShipment);
    const shipment = await shipmentRepo.save(
      shipmentRepo.create({
        organization: { id: opts.organizationId } as any,
        order,
        customer: opts.customer,
        status: 'pending',
        shippingMethodCode: opts.shippingMethodCode ?? null,
        shippingMethodName: shippingLabel,
        carrier: null,
        trackingNumber: null
      })
    );
    await manager.getRepository(B2bShipmentEvent).save(
      manager.getRepository(B2bShipmentEvent).create({
        shipment,
        status: 'pending',
        message: 'Order received — awaiting fulfilment'
      })
    );

    if (opts.chargeTradeCredit) {
      await chargeTradeCreditTx(manager, opts.organizationId, opts.customer.id, order);
    }

    return orderRepo.findOne({
      where: { id: order.id },
      relations: ['lines', 'customer', 'organization']
    });
  });
}

export const PORTAL_ORDER_STATUSES = ['Pending', 'Processing', 'Delivered', 'Cancelled'] as const;
export type PortalOrderStatus = (typeof PORTAL_ORDER_STATUSES)[number];

const PORTAL_STATUS_TO_DB: Record<PortalOrderStatus, Order['status'][]> = {
  Pending: ['pending', 'on_hold'],
  Processing: ['confirmed', 'processing'],
  Delivered: ['completed'],
  Cancelled: ['cancelled', 'refunded']
};

const PORTAL_SORT_COLUMNS = {
  date: 'o.orderDate',
  total: 'o.total',
  status: 'o.status'
} as const;

export type PortalOrderListQuery = {
  page: number;
  pageSize: number;
  sort: keyof typeof PORTAL_SORT_COLUMNS;
  dir: 'asc' | 'desc';
  search?: string;
  status?: PortalOrderStatus;
  dateFrom?: string;
  dateTo?: string;
  branchId?: string;
};

function branchLabel(addr: { addressLine1: string; city: string }) {
  return [addr.addressLine1, addr.city].filter(Boolean).join(', ');
}

function serializeShipment(shipment: B2bShipment) {
  return {
    id: shipment.id,
    status: shipment.status,
    carrier: shipment.carrier,
    trackingNumber: shipment.trackingNumber,
    events: (shipment.events || [])
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
      .map((e) => ({
        id: e.id,
        status: e.status,
        message: e.message,
        createdAt: e.createdAt
      }))
  };
}

/** Paginated, filtered order list strictly scoped to one B2B customer. */
export async function listPortalOrders(customerId: string, query: PortalOrderListQuery) {
  const qb = AppDataSource.getRepository(Order)
    .createQueryBuilder('o')
    .where('o.customer_id = :customerId', { customerId })
    .andWhere("o.channel = 'b2b_portal'");

  if (query.search) {
    const term = query.search.replace(/[\\%_]/g, (c) => `\\${c}`);
    qb.andWhere('o.order_number LIKE :search', { search: `%${term}%` });
  }
  if (query.status) {
    qb.andWhere('o.status IN (:...statuses)', { statuses: PORTAL_STATUS_TO_DB[query.status] });
  }
  if (query.dateFrom) {
    qb.andWhere('o.order_date >= :dateFrom', { dateFrom: `${query.dateFrom} 00:00:00` });
  }
  if (query.dateTo) {
    qb.andWhere('o.order_date <= :dateTo', { dateTo: `${query.dateTo} 23:59:59` });
  }
  if (query.branchId) {
    const branch = await AppDataSource.getRepository(CustomerAddress).findOne({
      where: { id: query.branchId, customer: { id: customerId } }
    });
    if (!branch) {
      throw Object.assign(new Error('Branch not found'), { status: 400 });
    }
    qb.andWhere(
      `EXISTS (SELECT 1 FROM order_addresses oa WHERE oa.order_id = o.id AND oa.address_type = 'shipping'
        AND oa.address_line1 = :branchLine1 AND oa.postal_code = :branchPostcode)`,
      { branchLine1: branch.addressLine1, branchPostcode: branch.postalCode }
    );
  }

  const direction = query.dir === 'asc' ? 'ASC' : 'DESC';
  qb.orderBy(PORTAL_SORT_COLUMNS[query.sort], direction)
    .addOrderBy('o.id', direction)
    .skip((query.page - 1) * query.pageSize)
    .take(query.pageSize);

  const [orders, total] = await qb.getManyAndCount();
  const ids = orders.map((o) => o.id);

  const [lines, addresses, shipments] = ids.length
    ? await Promise.all([
        AppDataSource.getRepository(OrderLine).find({ where: { order: { id: In(ids) } }, relations: ['order'] }),
        AppDataSource.getRepository(OrderAddress).find({
          where: { order: { id: In(ids) }, addressType: 'shipping' },
          relations: ['order']
        }),
        AppDataSource.getRepository(B2bShipment).find({
          where: { order: { id: In(ids) } },
          relations: ['order', 'events'],
          order: { createdAt: 'DESC' }
        })
      ])
    : [[], [], []];

  const { mapOrderToPortal } = await import('./b2bCatalog.service.js');
  const data = orders.map((o) => {
    const mapped = mapOrderToPortal({ ...o, lines: lines.filter((l) => l.order.id === o.id) });
    const addr = addresses.find((a) => a.order.id === o.id);
    const shipment = shipments.find((s) => s.order.id === o.id);
    return {
      ...mapped,
      orderDate: o.orderDate,
      paymentStatus: o.paymentStatus,
      branch: addr ? branchLabel(addr) : null,
      trackingNumber: shipment?.trackingNumber || undefined,
      fulfillmentStatus: shipment?.status,
      shipment: shipment ? serializeShipment(shipment) : undefined
    };
  });

  return { data, meta: { total, page: query.page, pageSize: query.pageSize } };
}

/** Single order detail; returns null unless the order belongs to this customer. */
export async function getPortalOrder(customerId: string, orderId: string) {
  if (!/^\d+$/.test(orderId)) return null;
  const order = await AppDataSource.getRepository(Order).findOne({
    where: { id: orderId, customer: { id: customerId }, channel: 'b2b_portal' },
    relations: ['lines', 'addresses']
  });
  if (!order) return null;

  const [shipment, invoice] = await Promise.all([
    AppDataSource.getRepository(B2bShipment).findOne({
      where: { order: { id: order.id } },
      relations: ['events'],
      order: { createdAt: 'DESC' }
    }),
    AppDataSource.getRepository(Invoice).findOne({
      where: { orderId: order.id, customerId },
      order: { id: 'DESC' }
    })
  ]);

  const { mapOrderToPortal } = await import('./b2bCatalog.service.js');
  const mapped = mapOrderToPortal(order);
  const shipping = (order.addresses || []).find((a) => a.addressType === 'shipping');
  const shipmentJson = shipment ? serializeShipment(shipment) : undefined;

  const timeline: { status: string; label: string; at: Date }[] = [
    { status: 'placed', label: 'Order placed', at: order.orderDate }
  ];
  for (const e of shipmentJson?.events || []) {
    timeline.push({ status: e.status, label: e.message || e.status, at: e.createdAt });
  }
  if (order.completedAt) timeline.push({ status: 'completed', label: 'Order completed', at: order.completedAt });
  if (order.cancelledAt) timeline.push({ status: 'cancelled', label: 'Order cancelled', at: order.cancelledAt });
  timeline.sort((a, b) => +new Date(a.at) - +new Date(b.at));

  return {
    ...mapped,
    orderDate: order.orderDate,
    paymentStatus: order.paymentStatus,
    currency: order.currency,
    discountAmount: num(order.discountAmount),
    shippingAmount: num(order.shippingAmount),
    branch: shipping ? branchLabel(shipping) : null,
    deliveryAddress: shipping
      ? {
          name: [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || null,
          company: shipping.company,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2,
          city: shipping.city,
          postalCode: shipping.postalCode,
          countryCode: shipping.countryCode,
          phone: shipping.phone
        }
      : null,
    trackingNumber: shipment?.trackingNumber || undefined,
    fulfillmentStatus: shipment?.status,
    shipment: shipmentJson,
    timeline,
    invoice: invoice
      ? {
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          invoiceDate: invoice.invoiceDate,
          documentUrl: invoice.documentUrl || null
        }
      : null
  };
}

/** Consume trade credit for an order inside an open transaction: credit check, payment row and ledger entry. */
async function chargeTradeCreditTx(manager: EntityManager, organizationId: string, customerId: string, order: Order) {
  const customerRepo = manager.getRepository(Customer);
  const customer = await customerRepo.findOne({ where: { id: customerId }, lock: { mode: 'pessimistic_write' } });
  if (!customer) {
    throw Object.assign(new Error('Customer not found'), { status: 404 });
  }

  const available = num(customer.creditLimit) - num(customer.creditUsed);
  const total = num(order.total);
  if (available + 0.0001 < total) {
    throw Object.assign(
      new Error(`Insufficient trade credit: order total £${total.toFixed(2)}, available £${Math.max(0, available).toFixed(2)}`),
      { status: 400, code: 'INSUFFICIENT_CREDIT' }
    );
  }

  customer.creditUsed = Number((num(customer.creditUsed) + total).toFixed(4));
  await customerRepo.save(customer);

  order.paymentStatus = 'authorized';
  order.status = 'processing';
  order.customerNotes = [order.customerNotes, 'Paid via Trade Credit'].filter(Boolean).join(' | ');
  await manager.getRepository(Order).save(order);

  const payment = await manager.getRepository(Payment).save(
    manager.getRepository(Payment).create({
      organizationId,
      orderId: order.id,
      transactionId: `TC-${order.orderNumber}`,
      paymentMethod: 'other',
      paymentType: 'sale',
      amount: total,
      currency: order.currency || 'GBP',
      feeAmount: 0,
      status: 'completed',
      paymentDate: new Date(),
      reference: 'trade_credit',
      notes: 'B2B trade credit',
      processedAt: new Date()
    })
  );

  await manager.getRepository(B2bCreditLedger).save(
    manager.getRepository(B2bCreditLedger).create({
      organization: { id: organizationId } as any,
      customer,
      entryType: 'invoice',
      reference: `INV-${order.orderNumber}`,
      description: `Trade credit invoice for ${order.orderNumber}`,
      amount: total,
      balanceAfter: num(customer.creditUsed),
      orderId: order.id,
      paymentId: payment.id
    })
  );
}

export async function applyTradeCredit(opts: { organizationId: string; customer: Customer; orderId: string }) {
  return AppDataSource.transaction(async (manager) => {
    const orderRepo = manager.getRepository(Order);
    const order = await orderRepo.findOne({
      where: { id: opts.orderId },
      relations: ['customer', 'organization', 'lines']
    });
    if (!order || order.customer?.id !== opts.customer.id) {
      throw Object.assign(new Error('Order not found'), { status: 404 });
    }
    if (order.paymentStatus === 'paid' || order.paymentStatus === 'authorized') {
      return order;
    }

    await chargeTradeCreditTx(manager, opts.organizationId, opts.customer.id, order);

    return orderRepo.findOne({ where: { id: order.id }, relations: ['lines', 'customer'] });
  });
}

export async function createPaymentIntent(opts: {
  organizationId: string;
  customer: Customer;
  orderId: string;
  method: 'card' | 'bank_transfer';
  cardDetails?: {
    cardNumber: string;
    expiry: string;
    cvv: string;
    holderName?: string;
  };
  bankId?: string;
}) {
  const orderRepo = AppDataSource.getRepository(Order);
  const order = await orderRepo.findOne({
    where: { id: opts.orderId },
    relations: ['customer', 'lines']
  });
  if (!order || order.customer?.id !== opts.customer.id) {
    throw Object.assign(new Error('Order not found'), { status: 404 });
  }
  if (order.paymentStatus === 'paid') {
    throw Object.assign(new Error('Order is already paid'), { status: 400 });
  }

  const gateway = await pickGateway(opts.organizationId, opts.method);
  const settings = await getOrCreateB2bSettings(opts.organizationId);
  const paymentRepo = AppDataSource.getRepository(Payment);
  const txnId = `B2B-${opts.method}-${order.orderNumber}-${Date.now()}`;

  // --- Card via Worldpay (preferred) ---
  if (opts.method === 'card' && gateway?.provider === 'worldpay') {
    if (!opts.cardDetails?.cardNumber || !opts.cardDetails?.expiry || !opts.cardDetails?.cvv) {
      throw Object.assign(
        new Error('Card details are required for Worldpay. Provide cardNumber, expiry (MM/YY), and cvv.'),
        { status: 400 }
      );
    }
    const [mm, yy] = opts.cardDetails.expiry.split('/').map((s) => s.trim());
    const expiryMonth = parseInt(mm, 10);
    let expiryYear = parseInt(yy, 10);
    if (expiryYear < 100) expiryYear += 2000;
    if (!expiryMonth || !expiryYear) {
      throw Object.assign(new Error('Invalid card expiry. Use MM/YY.'), { status: 400 });
    }

    const wp = await createWorldpayCardPayment({
      gateway,
      amountMinor: toMinorUnits(num(order.total), order.currency || 'GBP'),
      currency: order.currency || 'GBP',
      transactionReference: txnId.slice(0, 64),
      orderReference: order.orderNumber,
      narrativeLine1: 'RABS',
      card: {
        cardNumber: opts.cardDetails.cardNumber,
        expiryMonth,
        expiryYear,
        cvc: opts.cardDetails.cvv,
        cardHolderName: opts.cardDetails.holderName || opts.customer.email || undefined
      }
    });

    const payment = await paymentRepo.save(
      paymentRepo.create({
        organizationId: opts.organizationId,
        orderId: order.id,
        paymentGatewayId: gateway.id,
        transactionId: wp.worldpayPaymentId || txnId,
        paymentMethod: 'card',
        paymentType: 'sale',
        amount: num(order.total),
        currency: order.currency || 'GBP',
        feeAmount: 0,
        status: wp.status === 'completed' ? 'completed' : wp.status === 'pending' ? 'pending' : 'failed',
        paymentDate: new Date(),
        reference: `worldpay_${gateway.mode}`,
        payerEmail: opts.customer.email ?? undefined,
        payerName: opts.cardDetails.holderName,
        gatewayResponse: {
          provider: 'worldpay',
          mode: gateway.mode,
          outcome: wp.outcome,
          labeledMode: gateway.mode === 'test' ? 'TEST MODE' : 'LIVE'
        },
        failureCode: wp.ok ? undefined : wp.status,
        failureMessage: wp.ok ? undefined : wp.message,
        processedAt: wp.status === 'completed' ? new Date() : undefined,
        notes: wp.message
      })
    );

    if (wp.status === 'completed') {
      order.paymentStatus = 'paid';
      order.status = 'processing';
      order.customerNotes = [order.customerNotes, `Paid via Worldpay (${gateway.mode})`].filter(Boolean).join(' | ');
      await orderRepo.save(order);
    } else if (wp.status === 'pending' || wp.status === 'requires_action') {
      order.paymentStatus = 'pending';
      await orderRepo.save(order);
      throw Object.assign(new Error(wp.message), { status: 402, payment, gateway, worldpay: wp });
    } else {
      throw Object.assign(new Error(wp.message), { status: 402, payment, gateway, worldpay: wp });
    }

    const { mapOrderToPortal } = await import('./b2bCatalog.service.js');
    const mapped = mapOrderToPortal(order as any);
    (mapped as any).gatewayUsed = `Worldpay (${gateway.mode === 'test' ? 'TEST' : 'LIVE'})`;
    (mapped as any).paymentStatusLabel = gateway.mode === 'test' ? 'Paid (Worldpay TEST)' : 'Paid (Worldpay)';

    return {
      payment,
      order: await orderRepo.findOne({ where: { id: order.id }, relations: ['lines', 'customer'] }),
      mappedOrder: mapped,
      gateway: { id: gateway.id, name: gateway.name, provider: gateway.provider, mode: gateway.mode },
      clientSecret: null,
      message: wp.message
    };
  }

  // --- Card without Worldpay / without usable gateway ---
  if (opts.method === 'card') {
    if (!gateway) {
      throw Object.assign(
        new Error('No active card payment gateway configured. Add Worldpay (or another provider) in Finance → Payment Dashboard.'),
        { status: 503 }
      );
    }
    if (gateway.provider !== 'manual') {
      throw Object.assign(
        new Error(
          `Card gateway "${gateway.provider}" is active but live charge integration is not configured for this provider. Prefer Worldpay, or use trade credit / manual bank transfer.`
        ),
        { status: 503 }
      );
    }
  }

  // --- Bank transfer / open banking ---
  if (opts.method === 'bank_transfer') {
    const instructions =
      settings.bankTransferInstructions ||
      'Transfer the order total to the RABS account shown in your trade agreement. Include the order number as the payment reference. Staff will mark the payment received once funds clear.';

    if (gateway?.provider === 'open_banking' && !gateway.apiKeyEncrypted) {
      throw Object.assign(
        new Error('Open Banking gateway is listed but credentials are not configured. Use manual bank transfer or configure the provider.'),
        { status: 503 }
      );
    }

    // Never auto-complete bank transfer — always pending until staff confirm
    const payment = await paymentRepo.save(
      paymentRepo.create({
        organizationId: opts.organizationId,
        orderId: order.id,
        paymentGatewayId: gateway?.id,
        transactionId: txnId,
        paymentMethod: 'bank_transfer',
        paymentType: 'sale',
        amount: num(order.total),
        currency: order.currency || 'GBP',
        feeAmount: 0,
        status: 'pending',
        paymentDate: new Date(),
        reference: opts.bankId ? `bank:${opts.bankId}` : 'bank_transfer',
        payerEmail: opts.customer.email ?? undefined,
        gatewayResponse: {
          provider: gateway?.provider || 'manual',
          mode: gateway?.mode || 'test',
          awaitingFunds: true,
          labeledMode: gateway?.mode === 'live' ? 'LIVE (awaiting settlement)' : 'TEST/MANUAL (awaiting confirmation)'
        },
        notes: instructions
      })
    );

    order.paymentStatus = 'pending';
    order.customerNotes = [order.customerNotes, 'Awaiting bank transfer settlement'].filter(Boolean).join(' | ');
    await orderRepo.save(order);

    const { mapOrderToPortal } = await import('./b2bCatalog.service.js');
    const mapped = mapOrderToPortal(order as any);
    (mapped as any).gatewayUsed = gateway
      ? `${gateway.name} (${gateway.mode === 'test' ? 'TEST' : 'LIVE'} — pending)`
      : 'Manual bank transfer (pending confirmation)';
    (mapped as any).paymentStatusLabel = 'Awaiting bank transfer';

    return {
      payment,
      order: await orderRepo.findOne({ where: { id: order.id }, relations: ['lines', 'customer'] }),
      mappedOrder: mapped,
      gateway: gateway
        ? { id: gateway.id, name: gateway.name, provider: gateway.provider, mode: gateway.mode }
        : { id: null, name: 'Manual bank transfer', provider: 'manual', mode: 'test' },
      clientSecret: null,
      bankTransferInstructions: instructions,
      message: 'Order placed. Payment is pending until bank funds are confirmed by staff — this is not a simulated success.'
    };
  }

  throw Object.assign(new Error('Unsupported payment method'), { status: 400 });
}

export { CustomerAddress };
