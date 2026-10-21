import { In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Order } from '@entities/orders/Order.js';
import { OrderLine } from '@entities/orders/OrderLine.js';
import { OrderShipment } from '@entities/fulfillment/OrderShipment.js';
import { B2bShipment } from '@entities/b2b/B2bShipment.js';
import { B2bShipmentEvent } from '@entities/b2b/B2bShipmentEvent.js';
import { serializeShipment, syncB2bShipment } from '@services/dhl/dhlShipping.service.js';

const PICKABLE_ORDER_STATUSES = ['confirmed', 'processing'] as const;
const OPEN_FULFILLMENT = ['pending', 'processing', 'partially_fulfilled'] as const;

type PickStage = 'to_pick' | 'picked' | 'packed';

function httpError(message: string, status: number) {
  return Object.assign(new Error(message), { status });
}

function pickStage(lines: OrderLine[]): PickStage {
  const active = lines.filter((l) => l.fulfillmentStatus !== 'cancelled');
  if (active.length > 0 && active.every((l) => l.fulfillmentStatus === 'packed' || l.fulfillmentStatus === 'shipped')) {
    return 'packed';
  }
  if (active.length > 0 && active.every((l) => ['picked', 'packed', 'shipped'].includes(l.fulfillmentStatus))) {
    return 'picked';
  }
  return 'to_pick';
}

async function loadOrder(orderId: string, organizationId: string) {
  const order = await AppDataSource.getRepository(Order).findOne({
    where: { id: orderId, organization: { id: organizationId } },
    relations: ['lines', 'organization']
  });
  if (!order) throw httpError('Order not found', 404);
  return order;
}

async function updateB2bStage(order: Order, status: B2bShipment['status'], message: string) {
  const repo = AppDataSource.getRepository(B2bShipment);
  const shipment = await repo.findOne({ where: { order: { id: order.id } } });
  if (!shipment || ['dispatched', 'in_transit', 'delivered', 'cancelled'].includes(shipment.status)) return;
  shipment.status = status;
  await repo.save(shipment);
  await AppDataSource.getRepository(B2bShipmentEvent).save(
    AppDataSource.getRepository(B2bShipmentEvent).create({ shipment, status, message })
  );
}

/** Bin locations holding stock for each variant, best-stocked first, for pick lists. */
async function binLocationsByVariant(organizationId: string, variantIds: string[]) {
  const out = new Map<string, string[]>();
  if (!variantIds.length) return out;
  const rows: Array<{ variant_id: string; bin_code: string | null; warehouse_name: string; qty: number }> =
    await AppDataSource.query(
      `SELECT si.variant_id, b.code AS bin_code, w.name AS warehouse_name, SUM(si.quantity_on_hand) AS qty
         FROM stock_items si
         JOIN warehouses w ON w.id = si.warehouse_id
         JOIN locations loc ON loc.id = w.location_id
         JOIN business_units bu ON bu.id = loc.business_unit_id AND bu.organization_id = ?
         LEFT JOIN bins b ON b.id = si.bin_id
        WHERE si.variant_id IN (?) AND si.quantity_on_hand > 0
        GROUP BY si.variant_id, b.code, w.name
        ORDER BY qty DESC`,
      [organizationId, variantIds]
    );
  for (const r of rows) {
    const key = String(r.variant_id);
    const label = r.bin_code ? `${r.bin_code} · ${r.warehouse_name}` : r.warehouse_name;
    out.set(key, [...(out.get(key) ?? []), label]);
  }
  return out;
}

export async function listPickPackQueue(organizationId: string) {
  const orders = await AppDataSource.getRepository(Order).find({
    where: {
      organization: { id: organizationId },
      status: In([...PICKABLE_ORDER_STATUSES]),
      fulfillmentStatus: In([...OPEN_FULFILLMENT])
    },
    relations: ['lines', 'lines.variant', 'customer', 'addresses'],
    order: { orderDate: 'ASC' },
    take: 300
  });
  const variantIds = [
    ...new Set(orders.flatMap((o) => (o.lines || []).map((l) => l.variant?.id).filter((id): id is string => !!id)))
  ];
  const bins = await binLocationsByVariant(organizationId, variantIds);
  // Orders with nothing to pick (no live lines) cannot be picked or packed, so keep them out of the queue.
  const pickable = orders.filter((o) => (o.lines || []).some((l) => l.fulfillmentStatus !== 'cancelled'));
  return pickable.map((o) => {
    const lines = (o.lines || []).filter((l) => l.fulfillmentStatus !== 'cancelled');
    const shipping = (o.addresses || []).find((a) => a.addressType === 'shipping') || o.addresses?.[0] || null;
    return {
      id: o.id,
      orderNumber: o.orderNumber,
      channel: o.channel,
      status: o.status,
      fulfillmentStatus: o.fulfillmentStatus,
      orderDate: o.orderDate,
      total: Number(o.total || 0),
      currency: o.currency,
      customerName:
        o.customer?.companyName ||
        [o.customer?.firstName, o.customer?.lastName].filter(Boolean).join(' ') ||
        o.customerEmail,
      customerEmail: o.customerEmail,
      shippingMethod: o.shippingMethod,
      shipTo: shipping
        ? [shipping.addressLine1, shipping.city, shipping.postalCode, shipping.countryCode].filter(Boolean).join(', ')
        : null,
      shippingAddress: shipping
        ? {
            name: [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || null,
            company: shipping.company,
            lines: [shipping.addressLine1, shipping.addressLine2, shipping.city, shipping.stateProvince, shipping.postalCode, shipping.countryCode]
              .filter(Boolean),
            phone: shipping.phone
          }
        : null,
      customerNotes: o.customerNotes,
      itemCount: lines.reduce((sum, l) => sum + Number(l.quantity || 0), 0),
      stage: pickStage(lines),
      lines: lines.map((l) => ({
        id: l.id,
        sku: l.sku,
        name: l.name,
        quantity: Number(l.quantity || 0),
        fulfillmentStatus: l.fulfillmentStatus,
        variantId: l.variant?.id ?? null,
        variantSku: l.variant?.variantSku ?? null,
        bins: l.variant ? (bins.get(String(l.variant.id)) ?? []) : []
      }))
    };
  });
}

export async function markOrderStage(opts: { organizationId: string; orderId: string; stage: 'picked' | 'packed' }) {
  const order = await loadOrder(opts.orderId, opts.organizationId);
  if (!PICKABLE_ORDER_STATUSES.includes(order.status as any)) {
    throw httpError(`Order is ${order.status}; only confirmed or processing orders can be picked/packed`, 400);
  }
  const lines = (order.lines || []).filter((l) => !['cancelled', 'shipped'].includes(l.fulfillmentStatus));
  if ((order.lines || []).length === 0) {
    throw httpError('Order has no order lines. Add the items on the order (Order Lines → Add Line) before picking.', 400);
  }
  if (lines.length === 0) throw httpError('All lines on this order are already shipped or cancelled', 400);
  if (opts.stage === 'packed' && pickStage(order.lines || []) === 'to_pick') {
    throw httpError('Mark the order as picked before packing', 400);
  }

  await AppDataSource.getRepository(OrderLine).update(
    { id: In(lines.map((l) => l.id)) },
    { fulfillmentStatus: opts.stage }
  );
  await AppDataSource.getRepository(Order).update(order.id, {
    fulfillmentStatus: 'processing',
    status: 'processing'
  });
  await updateB2bStage(
    order,
    opts.stage === 'picked' ? 'picking' : 'packed',
    opts.stage === 'picked' ? 'Items picked in warehouse' : 'Order packed — ready to dispatch'
  );
  return { orderId: order.id, stage: opts.stage };
}

export async function listShipments(opts: { organizationId: string; from?: string; to?: string; carrier?: string }) {
  const qb = AppDataSource.getRepository(OrderShipment)
    .createQueryBuilder('s')
    .leftJoinAndSelect('s.order', 'o')
    .leftJoinAndSelect('s.organization', 'org')
    .where('org.id = :oid', { oid: opts.organizationId })
    .orderBy('s.createdAt', 'DESC')
    .take(1000);
  if (opts.carrier) qb.andWhere('s.carrier = :carrier', { carrier: opts.carrier });
  if (opts.from) qb.andWhere('s.created_at >= :from', { from: `${opts.from} 00:00:00` });
  if (opts.to) qb.andWhere('s.created_at <= :to', { to: `${opts.to} 23:59:59` });
  const rows = await qb.getMany();
  return rows.map(serializeShipment);
}

interface ShipmentEvent {
  at: string | null;
  status: string;
  description: string;
  location?: string | null;
  source: 'erp' | 'carrier' | 'b2b';
}

/** DHL tracking payload → flat event list (newest first). */
function carrierEvents(raw: Record<string, any> | null): ShipmentEvent[] {
  if (!raw) return [];
  const events: any[] = raw.shipments?.[0]?.events || raw.events || raw.shipmentTracking?.events || [];
  if (!Array.isArray(events)) return [];
  return events.map((e) => ({
    at: e.timestamp || (e.date ? `${e.date}${e.time ? `T${e.time}` : ''}` : null),
    status: String(e.typeCode || e.statusCode || e.status || 'update'),
    description: String(e.description || e.status || e.typeCode || 'Tracking update'),
    location:
      e.location?.address?.addressLocality ||
      e.serviceArea?.[0]?.description ||
      e.location?.description ||
      null,
    source: 'carrier' as const
  }));
}

export async function getShipmentDetail(opts: { organizationId: string; shipmentId: string }) {
  const s = await AppDataSource.getRepository(OrderShipment).findOne({
    where: { id: opts.shipmentId },
    relations: ['order', 'order.customer', 'order.addresses', 'order.lines', 'organization']
  });
  if (!s || String(s.organization?.id) !== String(opts.organizationId)) throw httpError('Shipment not found', 404);

  const order = s.order;
  const shipping = order?.addresses?.find((a) => a.addressType === 'shipping') || order?.addresses?.[0] || null;

  const events: ShipmentEvent[] = [...carrierEvents(s.rawTracking as Record<string, any> | null)];
  if (order) {
    const b2b = await AppDataSource.getRepository(B2bShipment).findOne({
      where: { order: { id: order.id } },
      relations: ['events']
    });
    for (const e of b2b?.events ?? []) {
      events.push({ at: new Date(e.createdAt).toISOString(), status: e.status, description: e.message, source: 'b2b' });
    }
  }
  const milestone = (at: Date | null, status: string, description: string) => {
    if (at) events.push({ at: new Date(at).toISOString(), status, description, source: 'erp' });
  };
  milestone(s.createdAt, 'created', `Shipment created with ${s.carrier}`);
  milestone(s.dispatchedAt, 'dispatched', `Dispatched${s.trackingNumber ? ` · tracking ${s.trackingNumber}` : ''}`);
  milestone(s.deliveredAt, 'delivered', 'Delivered');
  milestone(s.cancelledAt, 'cancelled', 'Shipment cancelled');
  events.sort((a, b) => new Date(b.at || 0).getTime() - new Date(a.at || 0).getTime());

  const created = (s.rawCreateResponse || {}) as Record<string, any>;
  const createdPackages: any[] = Array.isArray(created.packages) ? created.packages : [];
  const pieces = Math.max(1, Number(s.pieces) || 1);
  const perPieceWeight = s.weightKg != null ? Number(s.weightKg) / pieces : null;
  const packages = createdPackages.length
    ? createdPackages.map((p, i) => ({
        number: i + 1,
        trackingNumber: p.trackingNumber || null,
        weightKg: p.weight != null ? Number(p.weight) : perPieceWeight,
        dimensions: p.dimensions || null
      }))
    : Array.from({ length: pieces }, (_, i) => ({
        number: i + 1,
        trackingNumber: i === 0 ? s.trackingNumber : null,
        weightKg: perPieceWeight,
        dimensions: null
      }));

  return {
    ...serializeShipment(s),
    labelUrl: s.labelUrl,
    events,
    packages,
    order: order
      ? {
          id: order.id,
          orderNumber: order.orderNumber,
          channel: order.channel,
          status: order.status,
          fulfillmentStatus: order.fulfillmentStatus,
          orderDate: order.orderDate,
          total: Number(order.total || 0),
          currency: order.currency,
          shippingMethod: order.shippingMethod,
          customerName:
            order.customer?.companyName ||
            [order.customer?.firstName, order.customer?.lastName].filter(Boolean).join(' ') ||
            null,
          customerEmail: order.customerEmail,
          customerPhone: order.customerPhone,
          lines: (order.lines || [])
            .filter((l) => l.fulfillmentStatus !== 'cancelled')
            .map((l) => ({ id: l.id, sku: l.sku, name: l.name, quantity: Number(l.quantity || 0) }))
        }
      : null,
    shippingAddress: shipping
      ? {
          name: [shipping.firstName, shipping.lastName].filter(Boolean).join(' ') || null,
          company: shipping.company,
          addressLine1: shipping.addressLine1,
          addressLine2: shipping.addressLine2,
          city: shipping.city,
          stateProvince: shipping.stateProvince,
          postalCode: shipping.postalCode,
          countryCode: shipping.countryCode,
          phone: shipping.phone,
          email: shipping.email
        }
      : null
  };
}

export async function createManualShipment(opts: {
  organizationId: string;
  orderId: string;
  carrier: string;
  trackingNumber: string;
  serviceCode?: string | null;
  weightKg?: number | null;
  pieces?: number | null;
  notes?: string | null;
}) {
  const carrier = opts.carrier.trim();
  const trackingNumber = opts.trackingNumber.trim();
  if (!carrier || !trackingNumber) throw httpError('Carrier and tracking number are required', 400);

  const order = await loadOrder(opts.orderId, opts.organizationId);
  if (['cancelled', 'refunded'].includes(order.status)) {
    throw httpError(`Order is ${order.status}; it cannot be shipped`, 400);
  }

  const repo = AppDataSource.getRepository(OrderShipment);
  const existing = await repo.findOne({
    where: { order: { id: order.id }, trackingNumber, carrier },
    relations: ['order', 'organization']
  });
  if (existing && !['cancelled', 'failed'].includes(existing.status)) return serializeShipment(existing);

  const shipment = await repo.save(
    repo.create({
      organization: order.organization,
      order,
      carrier,
      serviceCode: opts.serviceCode || null,
      trackingNumber,
      status: 'in_transit',
      carrierStatus: 'Dispatched',
      weightKg: opts.weightKg ?? null,
      pieces: Math.max(1, Number(opts.pieces) || 1),
      dispatchedAt: new Date(),
      notes: opts.notes || null
    })
  );

  const lineIds = (order.lines || []).filter((l) => l.fulfillmentStatus !== 'cancelled').map((l) => l.id);
  if (lineIds.length) {
    await AppDataSource.getRepository(OrderLine).update({ id: In(lineIds) }, { fulfillmentStatus: 'shipped' });
  }
  await AppDataSource.getRepository(Order).update(order.id, {
    fulfillmentStatus: 'fulfilled',
    status: order.status === 'completed' ? 'completed' : 'processing',
    shippingMethod: order.shippingMethod || carrier
  });
  await syncB2bShipment({
    order,
    carrier,
    trackingNumber,
    status: 'dispatched',
    message: `Shipped with ${carrier} · ${trackingNumber}`
  });

  const saved = await repo.findOne({ where: { id: shipment.id }, relations: ['order', 'organization'] });
  return serializeShipment(saved || shipment);
}

export async function updateShipmentStatus(opts: {
  organizationId: string;
  shipmentId: string;
  status: 'in_transit' | 'delivered' | 'cancelled';
}) {
  const repo = AppDataSource.getRepository(OrderShipment);
  const s = await repo.findOne({ where: { id: opts.shipmentId }, relations: ['order', 'organization'] });
  if (!s || String(s.organization?.id) !== String(opts.organizationId)) throw httpError('Shipment not found', 404);
  if (s.status === 'cancelled') throw httpError('Shipment is cancelled', 400);

  s.status = opts.status;
  s.carrierStatus = opts.status === 'in_transit' ? 'In transit' : opts.status === 'delivered' ? 'Delivered' : 'Cancelled';
  if (opts.status === 'delivered') s.deliveredAt = s.deliveredAt || new Date();
  if (opts.status === 'cancelled') s.cancelledAt = new Date();
  await repo.save(s);

  if (s.order) {
    if (opts.status === 'delivered' && !['cancelled', 'refunded'].includes(s.order.status)) {
      await AppDataSource.getRepository(Order).update(s.order.id, { status: 'completed', completedAt: new Date() });
    }
    if (opts.status === 'cancelled' && !['cancelled', 'refunded', 'completed'].includes(s.order.status)) {
      await AppDataSource.getRepository(OrderLine)
        .createQueryBuilder()
        .update(OrderLine)
        .set({ fulfillmentStatus: 'packed' })
        .where('order_id = :orderId AND fulfillment_status = :st', { orderId: s.order.id, st: 'shipped' })
        .execute();
      await AppDataSource.getRepository(Order).update(s.order.id, { fulfillmentStatus: 'processing' });
    }
    if (s.trackingNumber) {
      await syncB2bShipment({
        order: s.order,
        carrier: s.carrier,
        trackingNumber: s.trackingNumber,
        status: opts.status,
        message: `${s.carrier} shipment ${s.carrierStatus?.toLowerCase()} · ${s.trackingNumber}`
      });
    }
  }
  return serializeShipment(s);
}
