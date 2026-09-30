import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { SocialMessage } from '@entities/social/SocialMessage.js';
import { sanitizeSocialAccount } from '@services/social/metaGraph.client.js';

const createSchema = z.object({
  socialAccountId: z.string(),
  platformConversationId: z.string().min(1),
  senderName: z.string().optional(),
  senderHandle: z.string().optional(),
  senderId: z.string().optional(),
  messageText: z.string().min(1),
  direction: z.enum(['inbound', 'outbound']),
  isRead: z.boolean().optional()
});

export class SocialMessageController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialMessage);
      const orgId = (req as any).auth?.orgId;
      const qb = repo.createQueryBuilder('message')
        .leftJoinAndSelect('message.socialAccount', 'socialAccount');
        
      if (orgId) {
        qb.andWhere('socialAccount.organizationId = :orgId', { orgId });
      }
      qb.orderBy('message.createdAt', 'DESC');
      const items = await qb.getMany();
      res.json({
        data: items.map((m) => ({
          ...m,
          socialAccount: m.socialAccount ? sanitizeSocialAccount(m.socialAccount as any) : m.socialAccount
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialMessage);
      const item = await repo.findOne({ 
        where: { id: req.params.id },
        relations: ['socialAccount']
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
      const repo = AppDataSource.getRepository(SocialMessage);
      const item = repo.create({ 
        ...data,
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
      // Typically messages are just marked as read via updates
      const data = z.object({ isRead: z.boolean() }).parse(req.body);
      const repo = AppDataSource.getRepository(SocialMessage);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      
      item.isRead = data.isRead;
      if (data.isRead && !item.readAt) {
        item.readAt = new Date();
      }
      
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(SocialMessage);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
