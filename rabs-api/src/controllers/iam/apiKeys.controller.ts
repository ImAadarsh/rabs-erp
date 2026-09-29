import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { ApiKey } from '@entities/iam/ApiKey.js';
import crypto from 'crypto';
import { Organization } from '@entities/iam/Organization.js';
import { z } from 'zod';

const createSchema = z.object({
  organizationId: z.string(),
  name: z.string().min(3),
  scopes: z.array(z.string()).optional()
});

function hashKey(key: string): string {
  return crypto.createHash('sha256').update(key).digest('hex');
}

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
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
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
      createdBy: (req as any).user || null
    });
    await repo.save(entity);
    res.status(201).json({ data: { id: entity.id, name: entity.name, key: raw, keyPrefix } });
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


