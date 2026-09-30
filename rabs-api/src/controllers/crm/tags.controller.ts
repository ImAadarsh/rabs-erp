import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { CrmTag } from '@entities/crm/CrmTag.js';
import { orgIdFromReq } from '@services/crm/crmScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).max(100),
  color: z.string().max(32).optional().nullable()
});

export class TagsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const items = await AppDataSource.getRepository(CrmTag).find({
        where: { organizationId: orgId },
        order: { name: 'ASC' }
      });
      res.json({ data: items });
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
      const repo = AppDataSource.getRepository(CrmTag);
      const existing = await repo.findOne({ where: { organizationId: orgId, name: data.name.trim() } });
      if (existing) {
        res.json({ data: existing });
        return;
      }
      const saved = await repo.save(
        repo.create({
          organizationId: orgId,
          name: data.name.trim(),
          color: data.color ?? null
        })
      );
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
