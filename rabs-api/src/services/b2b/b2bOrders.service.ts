import { AppDataSource } from '@config/data-source.js';
import { Customer } from '@entities/orders/Customer.js';
import { CustomerAddress } from '@entities/orders/CustomerAddress.js';
import { Order } from '@entities/orders/Order.js';
import { OrderLine } from '@entities/orders/OrderLine.js';
import { OrderAddress } from '@entities/orders/OrderAddress.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Payment } from '@entities/finance/Payment.js';
import { PaymentGateway } from '@entities/finance/PaymentGateway.js';
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

export async function createPortalOrder(opts: {
  organizationId: string;
  customer: Customer;
  lines: { variantId: string; quantity: number }[];
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
}) {
  if (!opts.lines.length) {
    throw Object.assign(new Error('Order must include at least one line'), { status: 400 });
  }

  const products = await listPortalProducts({ organizationId: opts.organizationId, customer: opts.customer });
  const variantIndex = new Map<string, { productName: string; sku: string; name: string; casePrice: number; vatRate: number }>();
  for (const p of products) {
    for (const v of p.variants) {
      variantIndex.set(v.id, {
        productName: p.name,
        sku: v.sku,
        name: v.name,
        casePrice: v.casePrice,
        vatRate: v.vatRate
      });
    }
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
    const net = priced.casePrice * line.quantity;
    const vat = net * priced.vatRate;
    subtotal += net;
    taxAmount += vat;
    prepared.push({
      variant,
      sku: priced.sku,
      name: priced.name,
      quantity: line.quantity,
      unitPrice: priced.casePrice,
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

    return orderRepo.findOne({
      where: { id: order.id },
      relations: ['lines', 'customer', 'organization']
    });
  });
}

export async function listPortalOrders(customerId: string) {
  const repo = AppDataSource.getRepository(Order);
  const orders = await repo.find({
    where: { customer: { id: customerId }, channel: 'b2b_portal' },
    relations: ['lines'],
    order: { createdAt: 'DESC' },
    take: 100
  });
  const { mapOrderToPortal } = await import('./b2bCatalog.service.js');
  const shipmentRepo = AppDataSource.getRepository(B2bShipment);
  const result = [];
  for (const o of orders) {
    const mapped = mapOrderToPortal(o);
    const shipment = await shipmentRepo.findOne({
      where: { order: { id: o.id } },
      relations: ['events'],
      order: { createdAt: 'DESC' }
    });
    if (shipment) {
      (mapped as any).trackingNumber = shipment.trackingNumber || undefined;
      (mapped as any).fulfillmentStatus = shipment.status;
      (mapped as any).shipment = {
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
    result.push(mapped);
  }
  return result;
}

export async function getPortalOrder(customerId: string, orderId: string) {
  const orders = await listPortalOrders(customerId);
  return orders.find((o) => o.id === orderId) || null;
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

    const customerRepo = manager.getRepository(Customer);
    const customer = await customerRepo.findOne({ where: { id: opts.customer.id } });
    if (!customer) {
      throw Object.assign(new Error('Customer not found'), { status: 404 });
    }

    const available = num(customer.creditLimit) - num(customer.creditUsed);
    const total = num(order.total);
    if (available + 0.0001 < total) {
      throw Object.assign(new Error('Insufficient trade credit'), { status: 400 });
    }

    customer.creditUsed = Number((num(customer.creditUsed) + total).toFixed(4));
    await customerRepo.save(customer);

    order.paymentStatus = 'authorized';
    order.status = 'processing';
    order.customerNotes = [order.customerNotes, 'Paid via Trade Credit'].filter(Boolean).join(' | ');
    await orderRepo.save(order);

    const payment = await manager.getRepository(Payment).save(
      manager.getRepository(Payment).create({
        organizationId: opts.organizationId,
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
        organization: { id: opts.organizationId } as any,
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
