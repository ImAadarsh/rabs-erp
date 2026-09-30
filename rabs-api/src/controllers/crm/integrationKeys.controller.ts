import crypto from 'crypto';
import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { CrmIntegrationKey } from '@entities/crm/CrmIntegrationKey.js';
import { hashIntegrationKey } from '@middlewares/integrationApiKey.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(2).max(150),
  source: z.enum(['salesforce', 'hubspot', 'zapier', 'generic']).optional()
});

function serializeKey(k: CrmIntegrationKey, rawKey?: string) {
  return {
    id: k.id,
    organizationId: k.organizationId,
    name: k.name,
    keyPrefix: k.keyPrefix,
    source: k.source,
    active: k.active,
    lastUsedAt: k.lastUsedAt,
    createdAt: k.createdAt,
    updatedAt: k.updatedAt,
    ...(rawKey ? { key: rawKey } : {})
  };
}

export class IntegrationKeysController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const keys = await AppDataSource.getRepository(CrmIntegrationKey).find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: keys.map((k) => serializeKey(k)) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const keyPrefix = `rabs_${data.source || 'generic'}_${crypto.randomBytes(3).toString('hex')}`;
      const raw = `${keyPrefix}.${crypto.randomBytes(24).toString('hex')}`;
      const repo = AppDataSource.getRepository(CrmIntegrationKey);
      const entity = await repo.save(
        repo.create({
          organizationId: orgId,
          name: data.name,
          source: data.source || 'generic',
          keyPrefix,
          keyHash: hashIntegrationKey(raw),
          active: true,
          createdById: userIdFromReq(req) ?? null
        })
      );
      res.status(201).json({ data: serializeKey(entity, raw) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /** Regenerate: deactivate old key and issue a new one with same name/source. */
  static async regenerate(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CrmIntegrationKey);
      const existing = await repo.findOne({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { message: 'Key not found' } });
        return;
      }
      assertOrgAccess(req, existing.organizationId);
      existing.active = false;
      await repo.save(existing);

      const keyPrefix = `rabs_${existing.source}_${crypto.randomBytes(3).toString('hex')}`;
      const raw = `${keyPrefix}.${crypto.randomBytes(24).toString('hex')}`;
      const entity = await repo.save(
        repo.create({
          organizationId: existing.organizationId,
          name: existing.name,
          source: existing.source,
          keyPrefix,
          keyHash: hashIntegrationKey(raw),
          active: true,
          createdById: userIdFromReq(req) ?? null
        })
      );
      res.status(201).json({ data: serializeKey(entity, raw), meta: { replacedKeyId: existing.id } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async deactivate(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CrmIntegrationKey);
      const existing = await repo.findOne({ where: { id: req.params.id } });
      if (!existing) {
        res.status(404).json({ error: { message: 'Key not found' } });
        return;
      }
      assertOrgAccess(req, existing.organizationId);
      existing.active = false;
      await repo.save(existing);
      res.json({ data: serializeKey(existing) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
