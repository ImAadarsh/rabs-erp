import { env } from '@config/env.js';
import { randomUUID } from 'crypto';

export type DhlMode = 'test' | 'live';

export type DhlCredentials = {
  apiKey: string;
  apiSecret: string;
  accountNumber: string;
  mode: DhlMode;
};

export type DhlAddress = {
  fullName: string;
  companyName?: string | null;
  phone: string;
  email?: string | null;
  addressLine1: string;
  addressLine2?: string | null;
  city: string;
  postalCode: string;
  countryCode: string;
  stateProvince?: string | null;
};

export type DhlParcel = {
  weightKg: number;
  lengthCm?: number;
  widthCm?: number;
  heightCm?: number;
};

export class DhlApiError extends Error {
  status: number;
  details: unknown;

  constructor(message: string, status: number, details?: unknown) {
    super(message);
    this.name = 'DhlApiError';
    this.status = status;
    this.details = details ?? null;
  }
}

function baseUrl(mode: DhlMode): string {
  return mode === 'live'
    ? 'https://express.api.dhl.com/mydhlapi'
    : 'https://express.api.dhl.com/mydhlapi/test';
}

function basicAuth(apiKey: string, apiSecret: string): string {
  return `Basic ${Buffer.from(`${apiKey}:${apiSecret}`).toString('base64')}`;
}

function messageReference(): string {
  return randomUUID().replace(/-/g, '').slice(0, 28);
}

function messageReferenceDate(): string {
  return new Date().toUTCString();
}

export function getDhlCredentialsFromEnv(): DhlCredentials | null {
  const apiKey = (env.DHL_API_KEY || '').trim();
  const apiSecret = (env.DHL_API_SECRET || '').trim();
  const accountNumber = (env.DHL_ACCOUNT_NUMBER || '').trim();
  if (!apiKey || !apiSecret) return null;
  return {
    apiKey,
    apiSecret,
    accountNumber,
    mode: env.DHL_MODE === 'live' ? 'live' : 'test'
  };
}

export function getDefaultShipperFromEnv(): DhlAddress | null {
  const addressLine1 = (env.DHL_SHIPPER_ADDRESS1 || '').trim();
  const city = (env.DHL_SHIPPER_CITY || '').trim();
  const postalCode = (env.DHL_SHIPPER_POSTAL || '').trim();
  const countryCode = (env.DHL_SHIPPER_COUNTRY || 'GB').trim().toUpperCase();
  const phone = (env.DHL_SHIPPER_PHONE || '').trim();
  const fullName = (env.DHL_SHIPPER_NAME || env.DHL_SHIPPER_COMPANY || '').trim();
  if (!addressLine1 || !city || !postalCode || !phone || !fullName) return null;
  return {
    fullName,
    companyName: env.DHL_SHIPPER_COMPANY || fullName,
    phone,
    email: env.DHL_SHIPPER_EMAIL || null,
    addressLine1,
    addressLine2: env.DHL_SHIPPER_ADDRESS2 || null,
    city,
    postalCode,
    countryCode,
    stateProvince: env.DHL_SHIPPER_STATE || null
  };
}

function extractErrorMessage(body: unknown, fallback: string): string {
  if (!body || typeof body !== 'object') return fallback;
  const b = body as Record<string, any>;
  if (Array.isArray(b.detail) && b.detail[0]?.message) {
    return String(b.detail.map((d: any) => d.message).filter(Boolean).join('; ') || fallback);
  }
  if (typeof b.detail === 'string' && b.detail.trim()) return b.detail;
  if (typeof b.title === 'string' && b.title.trim()) return b.title;
  if (typeof b.message === 'string' && b.message.trim()) return b.message;
  if (Array.isArray(b.additionalDetails) && b.additionalDetails.length) {
    return b.additionalDetails.map(String).join('; ');
  }
  if (Array.isArray(b.reasons) && b.reasons[0]?.msg) {
    return String(b.reasons.map((r: any) => r.msg).filter(Boolean).join('; ') || fallback);
  }
  return fallback;
}

export async function dhlRequest<T = unknown>(opts: {
  credentials: DhlCredentials;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  path: string;
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
}): Promise<{ status: number; data: T }> {
  const url = new URL(`${baseUrl(opts.credentials.mode)}${opts.path.startsWith('/') ? opts.path : `/${opts.path}`}`);
  if (opts.query) {
    for (const [k, v] of Object.entries(opts.query)) {
      if (v === undefined || v === null || v === '') continue;
      url.searchParams.set(k, String(v));
    }
  }

  const headers: Record<string, string> = {
    Authorization: basicAuth(opts.credentials.apiKey, opts.credentials.apiSecret),
    Accept: 'application/json',
    'Message-Reference': messageReference(),
    'Message-Reference-Date': messageReferenceDate()
  };
  if (opts.body !== undefined) {
    headers['Content-Type'] = 'application/json';
  }

  let res: Response;
  try {
    res = await fetch(url.toString(), {
      method: opts.method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
    });
  } catch (err: any) {
    throw new DhlApiError(`DHL network error: ${err?.message || 'request failed'}`, 502);
  }

  const text = await res.text();
  let data: any = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = { raw: text.slice(0, 2000) };
    }
  }

  if (!res.ok) {
    throw new DhlApiError(
      extractErrorMessage(data, `DHL API error (HTTP ${res.status})`),
      res.status,
      data
    );
  }

  return { status: res.status, data: data as T };
}

function partyPayload(addr: DhlAddress) {
  return {
    postalAddress: {
      postalCode: addr.postalCode,
      cityName: addr.city,
      countryCode: addr.countryCode.toUpperCase(),
      addressLine1: addr.addressLine1,
      ...(addr.addressLine2 ? { addressLine2: addr.addressLine2 } : {}),
      ...(addr.stateProvince ? { provinceName: addr.stateProvince } : {})
    },
    contactInformation: {
      phone: addr.phone,
      companyName: addr.companyName || addr.fullName,
      fullName: addr.fullName,
      ...(addr.email ? { email: addr.email } : {})
    }
  };
}

export function buildCreateShipmentBody(opts: {
  accountNumber: string;
  productCode: string;
  shipper: DhlAddress;
  receiver: DhlAddress;
  parcels: DhlParcel[];
  description: string;
  plannedShippingDateAndTime: string;
  customerReference?: string;
  isCustomsDeclarable?: boolean;
  declaredValue?: number;
  currency?: string;
  pickupRequested?: boolean;
}) {
  const packages = opts.parcels.map((p, i) => ({
    weight: Number(p.weightKg) || 0.5,
    dimensions: {
      length: Number(p.lengthCm) || 20,
      width: Number(p.widthCm) || 15,
      height: Number(p.heightCm) || 10
    },
    customerReferences: opts.customerReference
      ? [{ value: `${opts.customerReference}-${i + 1}`.slice(0, 35), typeCode: 'CU' }]
      : undefined
  }));

  const totalWeight = packages.reduce((s, p) => s + p.weight, 0);
  void totalWeight;
  const domestic = opts.shipper.countryCode.toUpperCase() === opts.receiver.countryCode.toUpperCase();

  return {
    plannedShippingDateAndTime: opts.plannedShippingDateAndTime,
    pickup: {
      isRequested: opts.pickupRequested !== false
    },
    productCode: opts.productCode,
    getRateEstimates: false,
    accounts: [
      {
        typeCode: 'shipper',
        number: opts.accountNumber
      }
    ],
    customerDetails: {
      shipperDetails: partyPayload(opts.shipper),
      receiverDetails: partyPayload(opts.receiver)
    },
    content: {
      packages,
      isCustomsDeclarable: opts.isCustomsDeclarable ?? !domestic,
      description: (opts.description || 'Goods').slice(0, 70),
      unitOfMeasurement: 'metric',
      ...(opts.declaredValue != null
        ? {
            declaredValue: Number(opts.declaredValue),
            declaredValueCurrency: (opts.currency || 'GBP').toUpperCase()
          }
        : {}),
      ...(!domestic ? { incoterm: 'DAP' } : {})
    },
    customerReferences: opts.customerReference
      ? [{ value: opts.customerReference.slice(0, 35), typeCode: 'CU' }]
      : undefined,
    outputImageProperties: {
      printerDPI: 300,
      encodingFormat: 'pdf',
      imageOptions: [
        {
          typeCode: 'label',
          templateName: 'ECOM26_84_001',
          isRequested: true
        }
      ]
    },
    getTransliteratedResponse: false,
    estimatedDeliveryDate: {
      isRequested: true,
      typeCode: 'QDDC'
    }
  };
}

export type DhlCreateShipmentResponse = {
  shipmentTrackingNumber?: string;
  trackingNumber?: string;
  packages?: Array<{ trackingNumber?: string; referenceNumber?: number }>;
  documents?: Array<{
    imageFormat?: string;
    content?: string;
    typeCode?: string;
  }>;
  shipmentDetails?: Array<{
    shipmentTrackingNumber?: string;
  }>;
  [key: string]: unknown;
};

export function extractTrackingNumber(res: DhlCreateShipmentResponse): string | null {
  return (
    res.shipmentTrackingNumber ||
    res.trackingNumber ||
    res.shipmentDetails?.[0]?.shipmentTrackingNumber ||
    res.packages?.[0]?.trackingNumber ||
    null
  );
}

export function extractLabelPdfBase64(res: DhlCreateShipmentResponse): string | null {
  const docs = res.documents || [];
  const label =
    docs.find((d) => String(d.typeCode || '').toLowerCase() === 'label') ||
    docs.find((d) => String(d.imageFormat || '').toLowerCase() === 'pdf') ||
    docs[0];
  return label?.content || null;
}

export async function createDhlShipment(
  credentials: DhlCredentials,
  body: ReturnType<typeof buildCreateShipmentBody>
) {
  return dhlRequest<DhlCreateShipmentResponse>({
    credentials,
    method: 'POST',
    path: '/shipments',
    body
  });
}

export async function trackDhlShipment(credentials: DhlCredentials, trackingNumber: string) {
  return dhlRequest({
    credentials,
    method: 'GET',
    path: `/shipments/${encodeURIComponent(trackingNumber)}/tracking`
  });
}

/** Attempt void/cancel. MyDHL support varies by region; surface API errors as-is. */
export async function cancelDhlShipment(credentials: DhlCredentials, trackingNumber: string) {
  return dhlRequest({
    credentials,
    method: 'DELETE',
    path: `/shipments/${encodeURIComponent(trackingNumber)}`
  });
}

export async function getDhlLabelImage(
  credentials: DhlCredentials,
  trackingNumber: string,
  typeCode: string = 'label'
) {
  return dhlRequest<{
    documents?: Array<{ content?: string; typeCode?: string; imageFormat?: string }>;
  }>({
    credentials,
    method: 'GET',
    path: `/shipments/${encodeURIComponent(trackingNumber)}/get-image`,
    query: {
      typeCode,
      pickupAccount: credentials.accountNumber || undefined
    }
  });
}

export async function testDhlConnection(credentials: DhlCredentials): Promise<{
  ok: boolean;
  message: string;
  mode: DhlMode;
  httpStatus?: number;
}> {
  try {
    // Lightweight authenticated call — tracking a dummy number should 401 on bad creds
    // or 404/400 on good creds (never treat 401 as success).
    await dhlRequest({
      credentials,
      method: 'GET',
      path: '/shipments/0000000000/tracking'
    });
    return { ok: true, message: 'DHL credentials accepted', mode: credentials.mode };
  } catch (err: any) {
    const status = err instanceof DhlApiError ? err.status : 0;
    if (status === 401 || status === 403) {
      return {
        ok: false,
        message:
          'Invalid DHL API credentials. Use API Key + API Secret from developer.dhl.com → Apps → rabs_erp (portal login is not API auth).',
        mode: credentials.mode,
        httpStatus: status
      };
    }
    if (status === 404 || status === 400 || status === 422) {
      return {
        ok: true,
        message: 'DHL credentials accepted (probe shipment not found, as expected)',
        mode: credentials.mode,
        httpStatus: status
      };
    }
    return {
      ok: false,
      message: err?.message || 'DHL connection failed',
      mode: credentials.mode,
      httpStatus: status || undefined
    };
  }
}
