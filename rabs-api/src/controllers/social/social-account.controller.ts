import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { sanitizeSocialAccount } from '@services/social/metaGraph.client.js';

const createSchema = z.object({
  organizationId: z.string(),
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'whatsapp', 'other']),
  accountName: z.string().min(1),
  accountHandle: z.string().optional(),
  accountId: z.string().optional(),
  profileUrl: z.string().url().optional().or(z.literal('')),
  followerCount: z.number().int().nonnegative().optional(),
  isVerified: z.boolean().optional(),
  isActive: z.boolean().optional()
});

const updateSchema = z.object({
  platform: z.enum(['facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'whatsapp', 'other']).optional(),
  accountName: z.string().min(1).optional(),
  accountHandle: z.string().optional(),
  accountId: z.string().optional(),
  profileUrl: z.string().url().optional().or(z.literal('')),
  followerCount: z.number().int().nonnegative().optional(),
  isVerified: z.boolean().optional(),
  isActive: z.boolean().optional()
});

function orgIdFromReq(req: Request): string | undefined {
  return (req as any).auth?.orgId || (req as any).user?.organizationId;
}

function userIdFromReq(req: Request): string | null {
  return (req as any).auth?.sub || (req as any).user?.id || null;
}

export class SocialAccountController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialAccount);
      const orgId = orgIdFromReq(req);
      const qb = repo.createQueryBuilder('account');
      if (orgId) {
        qb.andWhere('account.organizationId = :orgId', { orgId });
      }
      qb.orderBy('account.createdAt', 'DESC');
      const items = await qb.getMany();
      res.json({ data: items.map((a) => sanitizeSocialAccount(a as any)) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialAccount);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      res.json({ data: sanitizeSocialAccount(item as any) });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const data = createSchema.parse(req.body);
      const repo = AppDataSource.getRepository(SocialAccount);
      const item = repo.create({
        ...data,
        organizationId: data.organizationId || orgIdFromReq(req),
        connectedById: userIdFromReq(req)
      });
      const saved = await repo.save(item);
      res.status(201).json({ data: sanitizeSocialAccount(saved as any) });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(SocialAccount);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      Object.assign(item, data);
      const saved = await repo.save(item);
      res.json({ data: sanitizeSocialAccount(saved as any) });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialAccount);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
