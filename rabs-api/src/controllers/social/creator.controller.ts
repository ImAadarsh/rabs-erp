import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { Creator } from '@entities/social/Creator.js';

const createSchema = z.object({
  organizationId: z.string(),
  creatorName: z.string().min(1),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  primaryPlatform: z.enum(['instagram', 'tiktok', 'youtube', 'twitter', 'other']),
  primaryHandle: z.string().optional(),
  followerCount: z.number().int().nonnegative().optional(),
  engagementRate: z.number().nonnegative().optional(),
  niche: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(['prospect', 'contacted', 'negotiating', 'active', 'inactive']).optional()
});

const updateSchema = z.object({
  creatorName: z.string().min(1).optional(),
  email: z.string().email().optional().or(z.literal('')),
  phone: z.string().optional(),
  primaryPlatform: z.enum(['instagram', 'tiktok', 'youtube', 'twitter', 'other']).optional(),
  primaryHandle: z.string().optional(),
  followerCount: z.number().int().nonnegative().optional(),
  engagementRate: z.number().nonnegative().optional(),
  niche: z.string().optional(),
  location: z.string().optional(),
  status: z.enum(['prospect', 'contacted', 'negotiating', 'active', 'inactive']).optional()
});

export class CreatorController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Creator);
      const orgId = (req as any).user?.organizationId;
      const qb = repo.createQueryBuilder('creator');
      if (orgId) {
        qb.andWhere('creator.organizationId = :orgId', { orgId });
      }
      qb.orderBy('creator.createdAt', 'DESC');
      const items = await qb.getMany();
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Creator);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const data = createSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Creator);
      const item = repo.create({ 
        ...data, 
        organizationId: data.organizationId || (req as any).user?.organizationId 
      });
      const saved = await repo.save(item);
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Creator);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      Object.assign(item, data);
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Creator);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
