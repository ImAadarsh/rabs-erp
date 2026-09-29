import { env } from '@config/env.js';
import { PaymentGateway } from '@entities/finance/PaymentGateway.js';
import { decryptJson, encryptJson, maskSecret } from '@utils/credentialCrypto.js';

export type WorldpayMode = 'test' | 'live';

export type WorldpayCredentials = {
  username: string;
  password: string;
  merchantEntity?: string;
};

export type WorldpayCardInput = {
  cardNumber: string;
  expiryMonth: number;
  expiryYear: number;
  cvc: string;
  cardHolderName?: string;
  billingAddress?: {
    address1: string;
    city: string;
    postalCode?: string;
    countryCode: string;
  };
};

export type WorldpayPaymentResult = {
  ok: boolean;
  status: 'completed' | 'pending' | 'failed' | 'requires_action';
  transactionReference: string;
  worldpayPaymentId?: string;
  outcome?: string;
  message: string;
  raw?: unknown;
  mode: WorldpayMode;
};

function baseUrl(mode: WorldpayMode): string {
  return mode === 'live' ? 'https://access.worldpay.com' : 'https://try.access.worldpay.com';
}

function basicAuthHeader(username: string, password: string): string {
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
}

export function encryptWorldpayCredentials(creds: WorldpayCredentials): {
  apiKeyEncrypted: string;
  apiSecretEncrypted: string;
} {
  return {
    apiKeyEncrypted: encryptJson({ username: creds.username, merchantEntity: creds.merchantEntity || 'default' }),
    apiSecretEncrypted: encryptJson({ password: creds.password })
  };
}

export function decryptWorldpayCredentials(gateway: PaymentGateway): WorldpayCredentials | null {
  if (!gateway.apiKeyEncrypted || !gateway.apiSecretEncrypted) return null;
  try {
    const keyPart = decryptJson<{ username?: string; merchantEntity?: string }>(gateway.apiKeyEncrypted);
    const secretPart = decryptJson<{ password?: string }>(gateway.apiSecretEncrypted);
    if (!keyPart.username || !secretPart.password) return null;
    return {
      username: keyPart.username,
      password: secretPart.password,
      merchantEntity: keyPart.merchantEntity || env.WORLDPAY_MERCHANT_ENTITY || 'default'
    };
  } catch {
    // Legacy plaintext fallback (dev only) — still never log values
    if (gateway.apiKeyEncrypted.length < 200 && gateway.apiSecretEncrypted.length < 500) {
      return {
        username: gateway.apiKeyEncrypted,
        password: gateway.apiSecretEncrypted,
        merchantEntity: env.WORLDPAY_MERCHANT_ENTITY || 'default'
      };
    }
    return null;
  }
}

export function maskGatewayForApi(gateway: PaymentGateway) {
  const creds = gateway.provider === 'worldpay' ? decryptWorldpayCredentials(gateway) : null;
  return {
    id: gateway.id,
    organizationId: gateway.organizationId,
    name: gateway.name,
    provider: gateway.provider,
    mode: gateway.mode,
    isDefault: gateway.isDefault,
    isActive: gateway.isActive,
    supportedCurrencies: gateway.supportedCurrencies,
    createdAt: gateway.createdAt,
    updatedAt: gateway.updatedAt,
    hasCredentials: Boolean(gateway.apiKeyEncrypted && gateway.apiSecretEncrypted),
    credentialHint: creds ? maskSecret(creds.username) : gateway.apiKeyEncrypted ? '••••••••' : null,
    webhookConfigured: Boolean(gateway.webhookSecret)
  };
}

export async function testWorldpayConnection(gateway: PaymentGateway): Promise<{
  ok: boolean;
  message: string;
  mode: WorldpayMode;
  httpStatus?: number;
}> {
  const mode = (gateway.mode === 'live' ? 'live' : 'test') as WorldpayMode;
  const creds = decryptWorldpayCredentials(gateway);
  if (!creds) {
    return { ok: false, message: 'Worldpay credentials are missing or could not be decrypted', mode };
  }

  const url = `${baseUrl(mode)}/payments`;
  try {
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: basicAuthHeader(creds.username, creds.password),
        Accept: 'application/json',
        'WP-Api-Version': '2024-06-01'
      }
    });

    // Auth success typically 200/404/405; 401/403 means invalid credentials
    if (res.status === 401 || res.status === 403) {
      const body = await res.text().catch(() => '');
      return {
        ok: false,
        message: `Worldpay rejected credentials (HTTP ${res.status}). ${body.slice(0, 180) || 'Check username/API password and mode (try vs live).'}`,
        mode,
        httpStatus: res.status
      };
    }

    if (res.status >= 500) {
      return {
        ok: false,
        message: `Worldpay API unavailable (HTTP ${res.status}). Try again later.`,
        mode,
        httpStatus: res.status
      };
    }

    return {
      ok: true,
      message: `Worldpay ${mode} endpoint reachable with provided credentials (HTTP ${res.status}).`,
      mode,
      httpStatus: res.status
    };
  } catch (err: any) {
    return {
      ok: false,
      message: `Could not reach Worldpay API: ${err.message || 'network error'}`,
      mode
    };
  }
}

function sanitizeCardNumber(value: string): string {
  return value.replace(/\s+/g, '');
}

export async function createWorldpayCardPayment(opts: {
  gateway: PaymentGateway;
  amountMinor: number;
  currency: string;
  transactionReference: string;
  orderReference?: string;
  narrativeLine1: string;
  card: WorldpayCardInput;
}): Promise<WorldpayPaymentResult> {
  const mode = (opts.gateway.mode === 'live' ? 'live' : 'test') as WorldpayMode;
  const creds = decryptWorldpayCredentials(opts.gateway);
  if (!creds) {
    return {
      ok: false,
      status: 'failed',
      transactionReference: opts.transactionReference,
      message: 'Worldpay credentials are not configured or could not be decrypted',
      mode
    };
  }

  if (!opts.card.cardNumber || !opts.card.cvc || !opts.card.expiryMonth || !opts.card.expiryYear) {
    return {
      ok: false,
      status: 'failed',
      transactionReference: opts.transactionReference,
      message: 'Card details are required for Worldpay card payment',
      mode
    };
  }

  const body = {
    transactionReference: opts.transactionReference,
    orderReference: opts.orderReference,
    merchant: {
      entity: creds.merchantEntity || 'default'
    },
    instruction: {
      method: 'card',
      paymentInstrument: {
        type: 'plain',
        cardNumber: sanitizeCardNumber(opts.card.cardNumber),
        cardHolderName: opts.card.cardHolderName,
        expiryDate: {
          month: opts.card.expiryMonth,
          year: opts.card.expiryYear
        },
        cvc: opts.card.cvc,
        ...(opts.card.billingAddress
          ? {
              billingAddress: {
                address1: opts.card.billingAddress.address1,
                city: opts.card.billingAddress.city,
                postalCode: opts.card.billingAddress.postalCode,
                countryCode: opts.card.billingAddress.countryCode
              }
            }
          : {})
      },
      narrative: {
        line1: opts.narrativeLine1.slice(0, 24)
      },
      value: {
        currency: opts.currency.toUpperCase(),
        amount: opts.amountMinor
      }
    }
  };

  try {
    const res = await fetch(`${baseUrl(mode)}/api/payments`, {
      method: 'POST',
      headers: {
        Authorization: basicAuthHeader(creds.username, creds.password),
        'Content-Type': 'application/json',
        'WP-Api-Version': '2024-06-01'
      },
      body: JSON.stringify(body)
    });

    const rawText = await res.text();
    let raw: any = null;
    try {
      raw = rawText ? JSON.parse(rawText) : null;
    } catch {
      raw = { raw: rawText.slice(0, 500) };
    }

    if (!res.ok) {
      const msg =
        raw?.message ||
        raw?.error?.message ||
        raw?.description ||
        (typeof raw?.raw === 'string' ? raw.raw : null) ||
        `Worldpay payment failed (HTTP ${res.status})`;
      return {
        ok: false,
        status: 'failed',
        transactionReference: opts.transactionReference,
        message: String(msg).slice(0, 400),
        raw: sanitizeWorldpayResponse(raw),
        mode
      };
    }

    const outcome = String(raw?.outcome || raw?.payment?.outcome || '').toLowerCase();
    const paymentId = raw?.paymentId || raw?.id || raw?._links?.self?.href;

    if (outcome.includes('authenticated') || outcome === 'authorized' || outcome === 'sent for settlement' || outcome === 'sentForSettlement' || outcome === 'success') {
      return {
        ok: true,
        status: 'completed',
        transactionReference: opts.transactionReference,
        worldpayPaymentId: paymentId ? String(paymentId) : undefined,
        outcome,
        message: mode === 'test' ? `Worldpay TEST payment ${outcome || 'accepted'}` : `Worldpay payment ${outcome || 'accepted'}`,
        raw: sanitizeWorldpayResponse(raw),
        mode
      };
    }

    if (outcome.includes('3ds') || outcome.includes('challenged') || raw?._links?.['3ds:authenticate']) {
      return {
        ok: false,
        status: 'requires_action',
        transactionReference: opts.transactionReference,
        worldpayPaymentId: paymentId ? String(paymentId) : undefined,
        outcome,
        message: 'Worldpay requires 3DS authentication. Complete the challenge before the payment can be confirmed.',
        raw: sanitizeWorldpayResponse(raw),
        mode
      };
    }

    if (outcome.includes('refused') || outcome.includes('failed') || outcome.includes('error')) {
      return {
        ok: false,
        status: 'failed',
        transactionReference: opts.transactionReference,
        worldpayPaymentId: paymentId ? String(paymentId) : undefined,
        outcome,
        message: `Worldpay declined payment: ${outcome || 'refused'}`,
        raw: sanitizeWorldpayResponse(raw),
        mode
      };
    }

    // Unknown success-ish response — keep pending, never auto-complete without clear outcome
    return {
      ok: false,
      status: 'pending',
      transactionReference: opts.transactionReference,
      worldpayPaymentId: paymentId ? String(paymentId) : undefined,
      outcome: outcome || 'unknown',
      message: `Worldpay returned an inconclusive outcome (${outcome || 'unknown'}). Payment left pending until confirmed.`,
      raw: sanitizeWorldpayResponse(raw),
      mode
    };
  } catch (err: any) {
    return {
      ok: false,
      status: 'failed',
      transactionReference: opts.transactionReference,
      message: `Worldpay request error: ${err.message || 'network failure'}`,
      mode
    };
  }
}

function sanitizeWorldpayResponse(raw: any): unknown {
  if (!raw || typeof raw !== 'object') return raw;
  const clone = JSON.parse(JSON.stringify(raw));
  // Strip any accidental card/cvc fields if echoed
  if (clone?.instruction?.paymentInstrument) {
    delete clone.instruction.paymentInstrument.cardNumber;
    delete clone.instruction.paymentInstrument.cvc;
  }
  return clone;
}

export function credentialsFromEnv(): WorldpayCredentials | null {
  const username = process.env.WORLDPAY_USERNAME || '';
  const password = process.env.WORLDPAY_API_PASSWORD || '';
  if (!username || !password) return null;
  return {
    username,
    password,
    merchantEntity: process.env.WORLDPAY_MERCHANT_ENTITY || 'default'
  };
}
