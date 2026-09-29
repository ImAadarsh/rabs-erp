import crypto from 'crypto';
import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CrmIntegrationKey } from '@entities/crm/CrmIntegrationKey.js';
import { env } from '@config/env.js';

export function hashIntegrationKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

function extractRawKey(req: Request): string | null {
  const headerKey = req.headers['x-rabs-api-key'];
  if (typeof headerKey === 'string' && headerKey.trim()) {
    return headerKey.trim();
  }
  const auth = req.headers.authorization;
  if (auth?.startsWith('Bearer ')) {
    return auth.substring(7).trim() || null;
  }
  return null;
}

/**
 * Auth for external lead ingest — integration API key, NOT staff JWT.
 * Accepts X-Rabs-Api-Key or Authorization: Bearer <integration_key>.
 * Sets req.integration = { organizationId, source, keyId }.
 */
export async function integrationApiKeyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  const raw = extractRawKey(req);
  if (!raw) {
    res.status(401).json({ error: { message: 'Missing integration API key' } });
    return;
  }

  // MVP fallback: env CRM_LEAD_INGEST_API_KEY (single-tenant org 1)
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
    const key = await repo.findOne({ where: { keyHash: hash, active: true } });
    if (!key) {
      res.status(401).json({ error: { message: 'Invalid integration API key' } });
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
