import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { SocialPost } from '@entities/social/SocialPost.js';
import { sanitizeSocialAccount } from '@services/social/metaGraph.client.js';

const createSchema = z.object({
  organizationId: z.string(),
  socialAccountId: z.string(),
  campaignId: z.string().optional().nullable(),
  postType: z.enum(['text', 'image', 'video', 'carousel', 'story', 'reel', 'live']).optional(),
  content: z.string().min(1),
  mediaUrls: z.array(z.string().min(1)).optional().nullable(),
  hashtags: z.string().optional(),
  mentions: z.string().optional(),
  linkUrl: z.string().optional().or(z.literal('')),
  scheduledAt: z.string().datetime().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed', 'deleted']).optional()
});

const updateSchema = z.object({
  socialAccountId: z.string().optional(),
  campaignId: z.string().optional().nullable(),
  postType: z.enum(['text', 'image', 'video', 'carousel', 'story', 'reel', 'live']).optional(),
  content: z.string().min(1).optional(),
  mediaUrls: z.array(z.string().min(1)).optional().nullable(),
  hashtags: z.string().optional(),
  mentions: z.string().optional(),
  linkUrl: z.string().optional().or(z.literal('')),
  scheduledAt: z.string().datetime().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'published', 'failed', 'deleted']).optional()
});

export class SocialPostController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialPost);
      const orgId = (req as any).auth?.orgId;
      const qb = repo.createQueryBuilder('post')
        .leftJoinAndSelect('post.socialAccount', 'socialAccount')
        .leftJoinAndSelect('post.campaign', 'campaign');
        
      if (orgId) {
        qb.andWhere('post.organizationId = :orgId', { orgId });
      }
      qb.orderBy('post.createdAt', 'DESC');
      const items = await qb.getMany();
      res.json({
        data: items.map((p) => ({
          ...p,
          socialAccount: p.socialAccount ? sanitizeSocialAccount(p.socialAccount as any) : p.socialAccount
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialPost);
      const item = await repo.findOne({ 
        where: { id: req.params.id },
        relations: ['socialAccount', 'campaign']
      });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const data = createSchema.parse(req.body);
      const repo = AppDataSource.getRepository(SocialPost);
      const item = repo.create({
        ...data,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : undefined,
        organizationId: data.organizationId || (req as any).auth?.orgId || (req as any).user?.organizationId,
        createdById: (req as any).auth?.sub || (req as any).user?.id || null
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
      const repo = AppDataSource.getRepository(SocialPost);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      Object.assign(item, {
        ...data,
        scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : data.scheduledAt === null ? null : item.scheduledAt
      });
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      // Perform soft delete by setting status to deleted
      const repo = AppDataSource.getRepository(SocialPost);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      item.status = 'deleted';
      await repo.save(item);
      res.json({ data: { id: item.id, status: 'deleted' } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
