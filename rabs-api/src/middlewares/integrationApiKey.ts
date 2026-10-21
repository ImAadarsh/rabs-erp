import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CrmIntegrationKey } from '@entities/crm/CrmIntegrationKey.js';
import { env } from '@config/env.js';

export function hashIntegrationKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function cleanKey(v: unknown): string | null {
  if (typeof v !== 'string') return null;
  const k = v.trim().replace(/^["']|["']$/g, '').trim();
  return k || null;
}

function extractRawKey(req: Request): string | null {
  const headerKey =
    cleanKey(req.headers['x-rabs-api-key']) ||
    cleanKey(req.headers['x-api-key']);
  if (headerKey) return headerKey;
  const auth = cleanKey(req.headers.authorization);
  if (auth) {
    const m = auth.match(/^(?:bearer|token|apikey)\s+(.+)$/i);
    return cleanKey(m ? m[1] : auth);
  }
  return cleanKey(req.query.api_key) || cleanKey(req.query.apiKey);
}

const HOW_TO_AUTH =
  'Send the full key (format rabs_<source>_<id>.<secret>) in header X-Rabs-Api-Key, ' +
  'or Authorization: Bearer <key>, or as ?api_key=<key> on the webhook URL.';

/**
 * Auth for external lead ingest — integration API key, NOT staff JWT.
 * Accepts X-Rabs-Api-Key / X-Api-Key, Authorization: Bearer <key>, or ?api_key=<key>.
 */
export async function integrationApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const raw = extractRawKey(req);
  if (!raw) {
    res.status(401).json({ error: { message: `Missing integration API key. ${HOW_TO_AUTH}` } });
    return;
  }

  if (env.CRM_LEAD_INGEST_API_KEY && raw === env.CRM_LEAD_INGEST_API_KEY) {
    (req as any).integration = {
      organizationId: env.CRM_LEAD_INGEST_ORG_ID || '1',
      source: 'generic',
      keyId: null,
      via: 'env'
    };
    next();
    return;
  }

  try {
    const hash = hashIntegrationKey(raw);
    const repo = AppDataSource.getRepository(CrmIntegrationKey);
    const key = await repo.findOne({ where: { keyHash: hash } });
    if (!key) {
      const prefix = raw.split('.')[0];
      const byPrefix = await repo.findOne({ where: { keyPrefix: prefix } });
      let message = `Invalid integration API key. ${HOW_TO_AUTH}`;
      if (byPrefix && !raw.includes('.')) {
        message =
          'Only the key prefix was sent. Use the full secret shown once when the key was created ' +
          '(rabs_<source>_<id>.<secret>); if it was lost, regenerate the key in CRM → Integrations.';
      } else if (byPrefix) {
        message = 'Integration API key secret does not match. Regenerate the key in CRM → Integrations and update the sender.';
      }
      res.status(401).json({ error: { message } });
      return;
    }
    if (!key.active) {
      res.status(401).json({
        error: { message: 'This integration API key has been revoked. Use the active key or regenerate one in CRM → Integrations.' }
      });
      return;
    }
    key.lastUsedAt = new Date();
    await repo.save(key);
    (req as any).integration = {
      organizationId: key.organizationId,
      source: key.source,
      keyId: key.id,
      via: 'db'
    };
    next();
  } catch (err: any) {
    res.status(500).json({ error: { message: err.message || 'Auth failed' } });
  }
}
