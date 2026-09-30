import { AppDataSource } from '@config/data-source.js';
import { B2bShippingMethod } from '@entities/b2b/B2bShippingMethod.js';
import { B2bShipment } from '@entities/b2b/B2bShipment.js';
import { B2bShipmentEvent } from '@entities/b2b/B2bShipmentEvent.js';
import { Order } from '@entities/orders/Order.js';
import { Organization } from '@entities/iam/Organization.js';

/** Sensible UK B2B defaults — inserted only when the code is missing for the org. */
const DEFAULT_METHODS = [
  {
    code: 'next-day',
    name: 'Next Working Day Pallet Freight',
    description: 'Guaranteed next working day pallet delivery with tail-lift unloading.',
    price: 85,
    freeOverAmount: 1500,
    etaLabel: 'Next working day',
    icon: 'truck',
    sortOrder: 1
  },
  {
    code: 'standard-2-3',
    name: 'Standard 2–3 Day Pallet',
    description: 'Scheduled multi-drop pallet freight for routine restocking.',
    price: 55,
    freeOverAmount: 1000,
    etaLabel: '2–3 working days',
    icon: 'clock',
    sortOrder: 2
  },
  {
    code: 'economy-5',
    name: 'Economy 5 Day Freight',
    description: 'Lowest-cost consolidated freight when lead time is flexible.',
    price: 35,
    freeOverAmount: 750,
    etaLabel: 'Up to 5 working days',
    icon: 'clock',
    sortOrder: 3
  },
  {
    code: 'click-collect',
    name: 'Click & Collect',
    description: 'Collect from the assigned warehouse hub — no freight charge.',
    price: 0,
    freeOverAmount: null as number | null,
    etaLabel: 'Ready in 2–4 hours',
    icon: 'store',
    sortOrder: 4
  }
];

export function resolveShippingPrice(method: B2bShippingMethod, orderAmount: number): number {
  const base = Number(method.price) || 0;
  const freeOver = method.freeOverAmount != null ? Number(method.freeOverAmount) : null;
  if (freeOver != null && orderAmount >= freeOver) return 0;
  return base;
}

export async function ensureDefaultShippingMethods(organizationId: string) {
  const repo = AppDataSource.getRepository(B2bShippingMethod);
  const org = await AppDataSource.getRepository(Organization).findOne({ where: { id: organizationId } });
  if (!org) return;
  for (const m of DEFAULT_METHODS) {
    const existing = await repo.findOne({
      where: { organization: { id: organizationId }, code: m.code }
    });
    if (existing) {
      // Upgrade legacy £0 defaults (except click & collect) once — never overwrite priced methods.
      if (
        m.code !== 'click-collect' &&
        Number(existing.price) === 0 &&
        existing.freeOverAmount == null &&
        m.price > 0
      ) {
        existing.price = m.price;
        existing.freeOverAmount = m.freeOverAmount;
        existing.name = m.name;
        existing.description = m.description;
        existing.etaLabel = m.etaLabel;
        await repo.save(existing);
      }
      continue;
    }
    await repo.save(
      repo.create({
        organization: org,
        code: m.code,
        name: m.name,
        description: m.description,
        price: m.price,
        freeOverAmount: m.freeOverAmount,
        etaLabel: m.etaLabel,
        icon: m.icon,
        isActive: true,
        sortOrder: m.sortOrder
      })
    );
  }

  // Retire superseded free placeholder from earlier seed (non-destructive: disable only).
  const legacy = await repo.findOne({
    where: { organization: { id: organizationId }, code: 'economy-48h' }
  });
  if (legacy && Number(legacy.price) === 0 && legacy.isActive) {
    legacy.isActive = false;
    await repo.save(legacy);
  }
}

export async function listShippingOptions(organizationId: string, orderAmount = 0) {
  await ensureDefaultShippingMethods(organizationId);
  const methods = await AppDataSource.getRepository(B2bShippingMethod).find({
    where: { organization: { id: organizationId }, isActive: true },
    order: { sortOrder: 'ASC' }
  });
  return methods
    .filter((m) => m.minOrderAmount == null || orderAmount >= Number(m.minOrderAmount))
    .map((m) => {
      const price = resolveShippingPrice(m, orderAmount);
      return {
        id: m.code,
        code: m.code,
        name: m.name,
        description: m.description,
        price,
        listPrice: Number(m.price) || 0,
        freeOverAmount: m.freeOverAmount != null ? Number(m.freeOverAmount) : null,
        estimatedDate: m.etaLabel,
        icon: m.icon
      };
    });
}

export async function listCustomerShipments(customerId: string) {
  const rows = await AppDataSource.getRepository(B2bShipment).find({
    where: { customer: { id: customerId } },
    relations: ['order', 'events'],
    order: { createdAt: 'DESC' },
    take: 100
  });
  return rows.map((s) => ({
    id: s.id,
    orderId: s.order?.id,
    orderNumber: s.order?.orderNumber,
    status: s.status,
    carrier: s.carrier,
    trackingNumber: s.trackingNumber,
    shippingMethodName: s.shippingMethodName,
    estimatedDeliveryAt: s.estimatedDeliveryAt,
    dispatchedAt: s.dispatchedAt,
    deliveredAt: s.deliveredAt,
    events: (s.events || [])
      .sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt))
      .map((e) => ({ id: e.id, status: e.status, message: e.message, createdAt: e.createdAt }))
  }));
}

export async function adminListShipments(organizationId: string) {
  return AppDataSource.getRepository(B2bShipment).find({
    where: { organization: { id: organizationId } },
    relations: ['order', 'customer', 'events'],
    order: { createdAt: 'DESC' },
    take: 200
  });
}

export async function adminUpdateShipment(opts: {
  organizationId: string;
  shipmentId: string;
  status?: B2bShipment['status'];
  carrier?: string | null;
  trackingNumber?: string | null;
  notes?: string | null;
  userId?: string;
}) {
  const repo = AppDataSource.getRepository(B2bShipment);
  const shipment = await repo.findOne({
    where: { id: opts.shipmentId },
    relations: ['organization', 'order']
  });
  if (!shipment || shipment.organization.id !== opts.organizationId) {
    throw Object.assign(new Error('Shipment not found'), { status: 404 });
  }
  if (opts.status) {
    shipment.status = opts.status;
    if (opts.status === 'dispatched' || opts.status === 'in_transit') {
      shipment.dispatchedAt = shipment.dispatchedAt || new Date();
      if (shipment.order) {
        shipment.order.fulfillmentStatus = 'fulfilled';
        shipment.order.status = 'processing';
        await AppDataSource.getRepository(Order).save(shipment.order);
      }
    }
    if (opts.status === 'delivered') {
      shipment.deliveredAt = new Date();
      if (shipment.order) {
        shipment.order.fulfillmentStatus = 'fulfilled';
        shipment.order.status = 'completed';
        shipment.order.completedAt = new Date();
        await AppDataSource.getRepository(Order).save(shipment.order);
      }
    }
  }
  if (opts.carrier !== undefined) shipment.carrier = opts.carrier;
  if (opts.trackingNumber !== undefined) shipment.trackingNumber = opts.trackingNumber;
  if (opts.notes !== undefined) shipment.notes = opts.notes;
  await repo.save(shipment);

  await AppDataSource.getRepository(B2bShipmentEvent).save(
    AppDataSource.getRepository(B2bShipmentEvent).create({
      shipment,
      status: shipment.status,
      message: opts.trackingNumber
        ? `Status ${shipment.status}; tracking ${opts.trackingNumber}`
        : `Status updated to ${shipment.status}`,
      createdByUserId: opts.userId || null
    })
  );
  return repo.findOne({ where: { id: shipment.id }, relations: ['order', 'customer', 'events'] });
}

export async function adminUpsertShippingMethod(opts: {
  organizationId: string;
  id?: string;
  data: Partial<B2bShippingMethod> & { code: string; name: string };
}) {
  const repo = AppDataSource.getRepository(B2bShippingMethod);
  let row: B2bShippingMethod | null = null;
  if (opts.id) {
    row = await repo.findOne({ where: { id: opts.id }, relations: ['organization'] });
    if (!row || row.organization.id !== opts.organizationId) {
      throw Object.assign(new Error('Shipping method not found'), { status: 404 });
    }
  } else {
    row = repo.create({ organization: { id: opts.organizationId } as any });
  }
  Object.assign(row, {
    code: opts.data.code,
    name: opts.data.name,
    description: opts.data.description ?? row.description,
    price: opts.data.price ?? row.price ?? 0,
    etaLabel: opts.data.etaLabel ?? row.etaLabel,
    icon: opts.data.icon ?? row.icon ?? 'truck',
    minOrderAmount: opts.data.minOrderAmount !== undefined ? opts.data.minOrderAmount : row.minOrderAmount,
    freeOverAmount: opts.data.freeOverAmount !== undefined ? opts.data.freeOverAmount : row.freeOverAmount,
    isActive: opts.data.isActive ?? row.isActive ?? true,
    sortOrder: opts.data.sortOrder ?? row.sortOrder ?? 0
  });
  return repo.save(row);
}
