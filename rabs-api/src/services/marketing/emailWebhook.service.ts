import crypto from 'crypto';
import { AppDataSource } from '@config/data-source.js';
import { MarketingEmailEvent } from '@entities/marketing/MarketingEmailEvent.js';
import { env } from '@config/env.js';
import { SendGridProvider } from './email/SendGridProvider.js';
import type { WebhookEvent } from './email/EmailProvider.js';

/**
 * Verify SendGrid Event Webhook.
 * Accepts either:
 * - Shared secret: `?token=` / header `X-Rabs-Webhook-Secret` matching SENDGRID_WEBHOOK_SECRET
 * - Or Signed Event Webhook (ECDSA) when SENDGRID_WEBHOOK_VERIFICATION_KEY is set
 */
export function verifySendGridWebhook(
  req: {
    query: Record<string, unknown>;
    headers: Record<string, string | string[] | undefined>;
    rawBody?: Buffer | string;
    body?: unknown;
  }
): boolean {
  const secret = env.SENDGRID_WEBHOOK_SECRET;
  if (secret) {
    const token =
      (typeof req.query.token === 'string' && req.query.token) ||
      headerValue(req.headers, 'x-rabs-webhook-secret') ||
      headerValue(req.headers, 'authorization')?.replace(/^Bearer\s+/i, '');
    if (token && timingSafeEqual(token, secret)) return true;
    // If secret is configured, require it (unless signed verification also passes)
  }

  const verifyKey = env.SENDGRID_WEBHOOK_VERIFICATION_KEY;
  if (verifyKey) {
    const signature = headerValue(req.headers, 'x-twilio-email-event-webhook-signature');
    const timestamp = headerValue(req.headers, 'x-twilio-email-event-webhook-timestamp');
    const payload =
      typeof req.rawBody === 'string'
        ? req.rawBody
        : Buffer.isBuffer(req.rawBody)
          ? req.rawBody.toString('utf8')
          : JSON.stringify(req.body ?? '');
    if (signature && timestamp && verifySignedEvent(payload, timestamp, signature, verifyKey)) {
      return true;
    }
  }

  // Dev convenience: if neither secret nor key configured, accept (log warning via caller)
  if (!secret && !verifyKey) return true;
  return false;
}

function headerValue(
  headers: Record<string, string | string[] | undefined>,
  name: string
): string | undefined {
  const v = headers[name] ?? headers[name.toLowerCase()];
  if (Array.isArray(v)) return v[0];
  return v;
}

function timingSafeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

/** SendGrid Signed Event Webhook (ECDSA P-256 + SHA256). */
function verifySignedEvent(
  payload: string,
  timestamp: string,
  signatureBase64: string,
  publicKeyPem: string
): boolean {
  try {
    const verifier = crypto.createVerify('SHA256');
    verifier.update(timestamp);
    verifier.update(payload);
    verifier.end();
    const key = publicKeyPem.includes('BEGIN PUBLIC KEY')
      ? publicKeyPem
      : `-----BEGIN PUBLIC KEY-----\n${publicKeyPem}\n-----END PUBLIC KEY-----`;
    return verifier.verify(key, Buffer.from(signatureBase64, 'base64'));
  } catch {
    return false;
  }
}

export async function ingestSendGridEvents(rawBody: unknown): Promise<{ inserted: number }> {
  const provider = new SendGridProvider({ useEnv: true });
  const events: WebhookEvent[] = provider.parseWebhook?.(rawBody) || [];
  if (!events.length) return { inserted: 0 };

  const repo = AppDataSource.getRepository(MarketingEmailEvent);
  const rows = events.map((e) =>
    repo.create({
      organizationId: e.organizationId || null,
      connectorId: null,
      campaignId: e.campaignId || null,
      sendId: e.sendId || null,
      email: e.email || null,
      eventType: e.eventType,
      providerEventId: e.providerEventId || null,
      sgMessageId: e.sgMessageId || null,
      payload: e.payload,
      occurredAt: e.occurredAt || null
    })
  );
  await repo.save(rows);
  return { inserted: rows.length };
}
