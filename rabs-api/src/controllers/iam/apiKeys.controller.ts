import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { ApiKey } from '@entities/iam/ApiKey.js';
import crypto from 'crypto';
import { Organization } from '@entities/iam/Organization.js';
import { z } from 'zod';
import { hashApiKey } from '@middlewares/apiKeyAuth.js';

const createSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(3),
  scopes: z.array(z.string()).optional()
});

const updateSchema = z.object({
  name: z.string().min(3).optional(),
  scopes: z.array(z.string().max(100)).nullable().optional()
});

const hashKey = hashApiKey;

export class ApiKeysController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(ApiKey);
      const keys = await repo.find({
        relations: ['organization', 'createdBy'],
        order: { id: 'DESC' }
      });
      
      // Don't expose the key hash, only the prefix
      const safeKeys = keys.map(key => ({
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        status: key.status,
        lastUsedAt: key.lastUsedAt ? new Date(key.lastUsedAt).toISOString() : null,
        expiresAt: key.expiresAt ? new Date(key.expiresAt).toISOString() : null,
        organization: key.organization ? {
          id: key.organization.id,
          name: key.organization.name
        } : null,
        createdBy: key.createdBy ? {
          id: key.createdBy.id,
          email: key.createdBy.email
        } : null,
        createdAt: key.createdAt ? key.createdAt.toISOString() : null,
        updatedAt: key.updatedAt ? key.updatedAt.toISOString() : null
      }));
      
      res.json({ data: safeKeys });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message || 'Failed to list API keys' } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: `Invalid payload: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, details: parsed.error.issues } });
      return;
    }
    const org = await AppDataSource.getRepository(Organization).findOne({ where: { id: parsed.data.organizationId } });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }
    const keyPrefix = 'zk_' + crypto.randomBytes(3).toString('hex');
    const raw = `${keyPrefix}.${crypto.randomBytes(24).toString('hex')}`;
    const repo = AppDataSource.getRepository(ApiKey);
    const entity = repo.create({
      organization: org,
      name: parsed.data.name,
      keyPrefix,
      keyHash: hashKey(raw),
      scopes: parsed.data.scopes ?? null,
      createdBy: (req as any).auth?.sub ? ({ id: String((req as any).auth.sub) } as any) : null
    });
    await repo.save(entity);
    res.status(201).json({ data: { id: entity.id, name: entity.name, key: raw, keyPrefix } });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const parsed = updateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: `Invalid payload: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`, details: parsed.error.issues } });
      return;
    }
    const repo = AppDataSource.getRepository(ApiKey);
    const key = await repo.findOne({ where: { id: req.params.id }, relations: ['organization'] });
    if (!key) {
      res.status(404).json({ error: { message: 'API key not found' } });
      return;
    }
    if (parsed.data.name !== undefined) key.name = parsed.data.name;
    if (parsed.data.scopes !== undefined) {
      const scopes = Array.from(new Set((parsed.data.scopes ?? []).map((s) => s.trim()).filter(Boolean)));
      key.scopes = scopes.length ? scopes : null;
    }
    await repo.save(key);
    res.json({
      data: {
        id: key.id,
        name: key.name,
        keyPrefix: key.keyPrefix,
        scopes: key.scopes,
        organization: key.organization ? { id: key.organization.id, name: key.organization.name } : null
      }
    });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(ApiKey);
      const key = await repo.findOne({ where: { id } });
      
      if (!key) {
        res.status(404).json({ error: { message: 'API key not found' } });
        return;
      }
      
      await repo.remove(key);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message || 'Failed to delete API key' } });
    }
  }
}


