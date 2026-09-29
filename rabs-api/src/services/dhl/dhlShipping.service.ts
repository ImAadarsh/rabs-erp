import { AppDataSource } from '@config/data-source.js';
import { env } from '@config/env.js';
import { Order } from '@entities/orders/Order.js';
import { OrderAddress } from '@entities/orders/OrderAddress.js';
import { OrderShipment } from '@entities/fulfillment/OrderShipment.js';
import { B2bShipment } from '@entities/b2b/B2bShipment.js';
import { B2bShipmentEvent } from '@entities/b2b/B2bShipmentEvent.js';
import { publicObjectUrl } from '@utils/storage.js';
import { S3Client, PutObjectCommand } from '@aws-sdk/client-s3';
import { v4 as uuidv4 } from 'uuid';
import {
  buildCreateShipmentBody,
  cancelDhlShipment,
  createDhlShipment,
  DhlAddress,
  DhlApiError,
  DhlParcel,
  extractLabelPdfBase64,
  extractTrackingNumber,
  getDefaultShipperFromEnv,
  getDhlCredentialsFromEnv,
  getDhlLabelImage,
  testDhlConnection,
  trackDhlShipment
} from './dhlClient.js';

const s3 = new S3Client({
  region: env.AWS_REGION,
  credentials: {
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY
  }
});

function requireCreds() {
  const creds = getDhlCredentialsFromEnv();
  if (!creds) {
    throw Object.assign(
      new Error(
        'DHL is not configured. Set DHL_API_KEY, DHL_API_SECRET, and DHL_ACCOUNT_NUMBER in rabs-api/.env (API Key + Secret from developer.dhl.com Apps → rabs_erp).'
      ),
      { status: 503 }
    );
  }
  if (!creds.accountNumber) {
    throw Object.assign(new Error('DHL_ACCOUNT_NUMBER is required to create shipments'), { status: 503 });
  }
  return creds;
}

function addressFromOrderAddress(a: OrderAddress, fallbackPhone?: string | null, fallbackEmail?: string | null): DhlAddress {
  const fullName = [a.firstName, a.lastName].filter(Boolean).join(' ').trim() || a.company || 'Customer';
  const phone = (a.phone || fallbackPhone || '').trim();
  if (!phone) {
    throw Object.assign(new Error('Receiver phone is required for DHL shipment'), { status: 400 });
  }
  return {
    fullName,
    companyName: a.company,
    phone,
    email: a.email || fallbackEmail,
    addressLine1: a.addressLine1,
    addressLine2: a.addressLine2,
    city: a.city,
    postalCode: a.postalCode,
    countryCode: a.countryCode,
    stateProvince: a.stateProvince
  };
}

async function uploadLabelPdf(opts: {
  organizationId: string;
  orderId: string;
  trackingNumber: string;
  base64: string;
}): Promise<{ url: string; key: string }> {
  if (!env.AWS_S3_BUCKET_NAME || !env.AWS_ACCESS_KEY_ID || !env.AWS_SECRET_ACCESS_KEY) {
    throw Object.assign(
      new Error('AWS S3 is not configured; cannot store DHL label. Set AWS_* env vars.'),
      { status: 503 }
    );
  }
  const buf = Buffer.from(opts.base64, 'base64');
  const org = String(opts.organizationId).replace(/[^0-9A-Za-z_-]/g, '');
  const key = `shipping/dhl/${org}/${opts.orderId}/${opts.trackingNumber}-${uuidv4()}.pdf`;
  const basePut = {
    Bucket: env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buf,
    ContentType: 'application/pdf',
    CacheControl: 'private, max-age=31536000'
  };
  try {
    try {
      await s3.send(new PutObjectCommand({ ...basePut, ACL: 'public-read' }));
    } catch (aclErr: any) {
      const combined = `${aclErr?.name || ''} ${aclErr?.message || ''}`;
      if (/AccessControlListNotSupported|InvalidArgument|AccessDenied/i.test(combined)) {
        await s3.send(new PutObjectCommand(basePut));
      } else {
        throw aclErr;
      }
    }
  } catch (err: any) {
    throw Object.assign(new Error(`Failed to upload DHL label to S3: ${err?.message || 'error'}`), {
      status: 502
    });
  }
  return { url: publicObjectUrl(key), key };
}

async function syncB2bShipment(opts: {
  order: Order;
  trackingNumber: string;
  status: B2bShipment['status'];
  labelUrl?: string | null;
  message: string;
}) {
  const repo = AppDataSource.getRepository(B2bShipment);
  const existing = await repo.findOne({
    where: { order: { id: opts.order.id } },
    relations: ['order', 'customer', 'organization']
  });
  if (!existing) return;
  existing.carrier = 'DHL';
  existing.trackingNumber = opts.trackingNumber;
  existing.status = opts.status;
  if (opts.status === 'dispatched' || opts.status === 'in_transit') {
    existing.dispatchedAt = existing.dispatchedAt || new Date();
  }
  if (opts.status === 'delivered') {
    existing.deliveredAt = existing.deliveredAt || new Date();
  }
  if (opts.status === 'cancelled') {
    // keep timestamps
  }
  if (opts.labelUrl) {
    existing.notes = [existing.notes, `DHL label: ${opts.labelUrl}`].filter(Boolean).join('\n').slice(0, 2000);
  }
  await repo.save(existing);
  await AppDataSource.getRepository(B2bShipmentEvent).save(
    AppDataSource.getRepository(B2bShipmentEvent).create({
      shipment: existing,
      status: opts.status,
      message: opts.message
    })
  );
}

function serializeShipment(s: OrderShipment) {
  return {
    id: s.id,
    orderId: (s.order as any)?.id || undefined,
    organizationId: (s.organization as any)?.id || undefined,
    carrier: s.carrier,
    serviceCode: s.serviceCode,
    trackingNumber: s.trackingNumber,
    labelUrl: s.labelUrl,
    status: s.status,
    carrierStatus: s.carrierStatus,
    weightKg: s.weightKg != null ? Number(s.weightKg) : null,
    pieces: s.pieces,
    plannedPickupAt: s.plannedPickupAt,
    dispatchedAt: s.dispatchedAt,
    deliveredAt: s.deliveredAt,
    cancelledAt: s.cancelledAt,
    lastError: s.lastError,
    notes: s.notes,
    createdAt: s.createdAt,
    updatedAt: s.updatedAt,
    trackingUrl: s.trackingNumber
      ? `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(s.trackingNumber)}`
      : null
  };
}

export async function getDhlStatus() {
  const creds = getDhlCredentialsFromEnv();
  const shipper = getDefaultShipperFromEnv();
  if (!creds) {
    return {
      configured: false,
      ok: false,
      mode: env.DHL_MODE === 'live' ? 'live' : 'test',
      hasAccountNumber: Boolean((env.DHL_ACCOUNT_NUMBER || '').trim()),
      shipperConfigured: Boolean(shipper),
      message:
        'Missing DHL_API_KEY / DHL_API_SECRET. Portal username/password cannot call MyDHL API — create API keys under Apps → rabs_erp on developer.dhl.com.'
    };
  }
  const probe = await testDhlConnection(creds);
  return {
    configured: true,
    ok: probe.ok,
    mode: creds.mode,
    hasAccountNumber: Boolean(creds.accountNumber),
    shipperConfigured: Boolean(shipper),
    message: probe.message,
    httpStatus: probe.httpStatus
  };
}

export async function listOrderShipments(opts: {
  organizationId?: string;
  orderId?: string;
  carrier?: string;
  limit?: number;
}) {
  const repo = AppDataSource.getRepository(OrderShipment);
  const qb = repo
    .createQueryBuilder('s')
    .leftJoinAndSelect('s.order', 'o')
    .leftJoinAndSelect('s.organization', 'org')
    .orderBy('s.createdAt', 'DESC')
    .take(Math.min(opts.limit || 100, 200));

  if (opts.organizationId) qb.andWhere('org.id = :oid', { oid: opts.organizationId });
  if (opts.orderId) qb.andWhere('o.id = :orderId', { orderId: opts.orderId });
  if (opts.carrier) qb.andWhere('s.carrier = :carrier', { carrier: opts.carrier });

  const rows = await qb.getMany();
  return rows.map(serializeShipment);
}

export async function createShipmentForOrder(opts: {
  orderId: string;
  organizationId?: string;
  productCode?: string;
  weightKg?: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
  pieces?: number;
  description?: string;
  plannedShippingDateAndTime?: string;
  pickupRequested?: boolean;
  shipperOverride?: Partial<DhlAddress>;
}) {
  const creds = requireCreds();
  const shipperBase = getDefaultShipperFromEnv();
  if (!shipperBase && !opts.shipperOverride?.addressLine1) {
    throw Object.assign(
      new Error(
        'Shipper address incomplete. Set DHL_SHIPPER_* env vars (name, phone, address1, city, postal, country).'
      ),
      { status: 503 }
    );
  }

  const orderRepo = AppDataSource.getRepository(Order);
  const order = await orderRepo.findOne({
    where: { id: opts.orderId },
    relations: ['organization', 'customer', 'addresses']
  });
  if (!order) throw Object.assign(new Error('Order not found'), { status: 404 });
  if (opts.organizationId && String(order.organization?.id) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Order does not belong to organization'), { status: 403 });
  }

  let shipping =
    (order.addresses || []).find((a) => a.addressType === 'shipping') ||
    (await AppDataSource.getRepository(OrderAddress).findOne({
      where: { order: { id: order.id }, addressType: 'shipping' }
    }));
  if (!shipping) {
    shipping = await AppDataSource.getRepository(OrderAddress).findOne({
      where: { order: { id: order.id } }
    });
  }
  if (!shipping) {
    throw Object.assign(new Error('Order has no shipping address'), { status: 400 });
  }

  const receiver = addressFromOrderAddress(shipping, order.customerPhone, order.customerEmail);
  const shipper: DhlAddress = {
    ...(shipperBase as DhlAddress),
    ...(opts.shipperOverride || {})
  } as DhlAddress;

  const pieces = Math.max(1, Number(opts.pieces) || 1);
  const weightEach = Number(opts.weightKg) > 0 ? Number(opts.weightKg) / pieces : 1;
  const parcels: DhlParcel[] = Array.from({ length: pieces }, () => ({
    weightKg: weightEach,
    lengthCm: opts.lengthCm,
    widthCm: opts.widthCm,
    heightCm: opts.heightCm
  }));

  const productCode = (opts.productCode || env.DHL_DEFAULT_PRODUCT_CODE || 'N').trim();
  // MyDHL expects local datetime with GMT offset, e.g. 2026-08-23T14:00:00GMT+01:00
  const planned =
    opts.plannedShippingDateAndTime ||
    (() => {
      const d = new Date(Date.now() + 2 * 60 * 60 * 1000);
      const pad = (n: number) => String(n).padStart(2, '0');
      const offsetMin = -d.getTimezoneOffset();
      const sign = offsetMin >= 0 ? '+' : '-';
      const oh = pad(Math.floor(Math.abs(offsetMin) / 60));
      const om = pad(Math.abs(offsetMin) % 60);
      return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}:00GMT${sign}${oh}:${om}`;
    })();

  const body = buildCreateShipmentBody({
    accountNumber: creds.accountNumber,
    productCode,
    shipper,
    receiver,
    parcels,
    description: opts.description || `Order ${order.orderNumber}`,
    plannedShippingDateAndTime: planned,
    customerReference: order.orderNumber,
    declaredValue: Number(order.total) || undefined,
    currency: order.currency || 'GBP',
    pickupRequested: opts.pickupRequested
  });

  const shipmentRepo = AppDataSource.getRepository(OrderShipment);
  const draft = await shipmentRepo.save(
    shipmentRepo.create({
      organization: order.organization,
      order,
      carrier: 'DHL',
      serviceCode: productCode,
      status: 'draft',
      weightKg: parcels.reduce((s, p) => s + p.weightKg, 0),
      pieces,
      plannedPickupAt: new Date()
    })
  );

  try {
    const { data } = await createDhlShipment(creds, body);
    const trackingNumber = extractTrackingNumber(data);
    if (!trackingNumber) {
      throw new DhlApiError('DHL create shipment succeeded but no tracking number was returned', 502, data);
    }
    const labelB64 = extractLabelPdfBase64(data);
    let labelUrl: string | null = null;
    let labelS3Key: string | null = null;
    if (labelB64) {
      const uploaded = await uploadLabelPdf({
        organizationId: String(order.organization.id),
        orderId: String(order.id),
        trackingNumber,
        base64: labelB64
      });
      labelUrl = uploaded.url;
      labelS3Key = uploaded.key;
    }

    draft.trackingNumber = trackingNumber;
    draft.labelUrl = labelUrl;
    draft.labelS3Key = labelS3Key;
    draft.status = labelUrl ? 'label_ready' : 'created';
    draft.carrierStatus = 'Shipment created';
    draft.dispatchedAt = new Date();
    draft.rawCreateResponse = data as any;
    draft.lastError = null;
    await shipmentRepo.save(draft);

    order.fulfillmentStatus = 'fulfilled';
    order.shippingMethod = order.shippingMethod || `DHL ${productCode}`;
    await orderRepo.save(order);

    await syncB2bShipment({
      order,
      trackingNumber,
      status: 'dispatched',
      labelUrl,
      message: `Shipped with DHL · ${trackingNumber}`
    });

    return serializeShipment(draft);
  } catch (err: any) {
    const message =
      err instanceof DhlApiError
        ? err.message
        : err?.message || 'DHL create shipment failed';
    draft.status = 'failed';
    draft.lastError = message;
    await shipmentRepo.save(draft);
    throw Object.assign(new Error(message), {
      status: err instanceof DhlApiError ? (err.status >= 400 && err.status < 600 ? err.status : 502) : err?.status || 502,
      details: err instanceof DhlApiError ? err.details : undefined
    });
  }
}

export async function getShipmentLabel(shipmentId: string) {
  const repo = AppDataSource.getRepository(OrderShipment);
  const s = await repo.findOne({ where: { id: shipmentId }, relations: ['order', 'organization'] });
  if (!s) throw Object.assign(new Error('Shipment not found'), { status: 404 });

  if (s.labelUrl) return serializeShipment(s);
  if (!s.trackingNumber) throw Object.assign(new Error('Shipment has no tracking number'), { status: 400 });

  const creds = requireCreds();
  try {
    const { data } = await getDhlLabelImage(creds, s.trackingNumber);
    const content =
      data.documents?.find((d) => String(d.typeCode || '').toLowerCase() === 'label')?.content ||
      data.documents?.[0]?.content;
    if (!content) {
      throw Object.assign(new Error('DHL did not return a label image for this shipment'), { status: 404 });
    }
    const uploaded = await uploadLabelPdf({
      organizationId: String((s.organization as any).id),
      orderId: String((s.order as any).id),
      trackingNumber: s.trackingNumber,
      base64: content
    });
    s.labelUrl = uploaded.url;
    s.labelS3Key = uploaded.key;
    s.status = s.status === 'created' ? 'label_ready' : s.status;
    await repo.save(s);
    return serializeShipment(s);
  } catch (err: any) {
    const message = err instanceof DhlApiError ? err.message : err?.message || 'Failed to fetch label';
    throw Object.assign(new Error(message), {
      status: err instanceof DhlApiError ? err.status : err?.status || 502,
      details: err instanceof DhlApiError ? err.details : undefined
    });
  }
}

export async function trackShipment(opts: { shipmentId?: string; trackingNumber?: string }) {
  const creds = requireCreds();
  const repo = AppDataSource.getRepository(OrderShipment);
  let s: OrderShipment | null = null;
  let trackingNumber = opts.trackingNumber || '';

  if (opts.shipmentId) {
    s = await repo.findOne({ where: { id: opts.shipmentId }, relations: ['order', 'organization'] });
    if (!s) throw Object.assign(new Error('Shipment not found'), { status: 404 });
    trackingNumber = s.trackingNumber || trackingNumber;
  }
  if (!trackingNumber) throw Object.assign(new Error('trackingNumber is required'), { status: 400 });

  try {
    const { data } = await trackDhlShipment(creds, trackingNumber);
    const events =
      (data as any)?.shipments?.[0]?.events ||
      (data as any)?.events ||
      (data as any)?.shipmentTracking?.events ||
      [];
    const latest =
      Array.isArray(events) && events[0]
        ? events[0].description || events[0].status || events[0].typeCode
        : (data as any)?.status || null;

    if (s) {
      s.rawTracking = data as any;
      s.carrierStatus = latest ? String(latest) : s.carrierStatus;
      const statusText = String(latest || '').toLowerCase();
      if (/delivered|ok/.test(statusText)) {
        s.status = 'delivered';
        s.deliveredAt = s.deliveredAt || new Date();
      } else if (/transit|departed|arrival|customs|facility/.test(statusText)) {
        s.status = 'in_transit';
      }
      await repo.save(s);
      if (s.order) {
        await syncB2bShipment({
          order: s.order as Order,
          trackingNumber,
          status: s.status === 'delivered' ? 'delivered' : 'in_transit',
          message: `DHL tracking update: ${latest || 'updated'}`
        });
      }
    }

    return {
      trackingNumber,
      carrier: 'DHL',
      carrierStatus: latest ? String(latest) : null,
      events,
      raw: data,
      shipment: s ? serializeShipment(s) : null,
      trackingUrl: `https://www.dhl.com/gb-en/home/tracking.html?tracking-id=${encodeURIComponent(trackingNumber)}`
    };
  } catch (err: any) {
    const message = err instanceof DhlApiError ? err.message : err?.message || 'DHL tracking failed';
    throw Object.assign(new Error(message), {
      status: err instanceof DhlApiError ? err.status : 502,
      details: err instanceof DhlApiError ? err.details : undefined
    });
  }
}

export async function cancelShipment(shipmentId: string) {
  const creds = requireCreds();
  const repo = AppDataSource.getRepository(OrderShipment);
  const s = await repo.findOne({ where: { id: shipmentId }, relations: ['order', 'organization'] });
  if (!s) throw Object.assign(new Error('Shipment not found'), { status: 404 });
  if (!s.trackingNumber) throw Object.assign(new Error('Shipment has no tracking number to cancel'), { status: 400 });
  if (s.status === 'cancelled') return serializeShipment(s);

  try {
    await cancelDhlShipment(creds, s.trackingNumber);
    s.status = 'cancelled';
    s.cancelledAt = new Date();
    s.carrierStatus = 'Cancelled';
    s.lastError = null;
    await repo.save(s);
    if (s.order) {
      await syncB2bShipment({
        order: s.order as Order,
        trackingNumber: s.trackingNumber,
        status: 'cancelled',
        message: `DHL shipment cancelled · ${s.trackingNumber}`
      });
    }
    return serializeShipment(s);
  } catch (err: any) {
    const message =
      err instanceof DhlApiError
        ? err.message
        : err?.message || 'DHL cancel/void is not available for this shipment';
    s.lastError = message;
    await repo.save(s);
    throw Object.assign(new Error(message), {
      status: err instanceof DhlApiError ? err.status : 502,
      details: err instanceof DhlApiError ? err.details : undefined
    });
  }
}
