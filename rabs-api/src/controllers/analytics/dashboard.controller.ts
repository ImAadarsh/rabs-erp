import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { Dashboard } from '@entities/analytics/Dashboard.js';

const createSchema = z.object({
  organizationId: z.string(),
  dashboardName: z.string().min(1),
  dashboardType: z.enum(['executive', 'operations', 'sales', 'finance', 'warehouse', 'custom']),
  layout: z.any(),
  widgets: z.any(),
  isDefault: z.boolean().default(false),
  isPublic: z.boolean().default(false)
});

const updateSchema = z.object({
  dashboardName: z.string().min(1).optional(),
  dashboardType: z.enum(['executive', 'operations', 'sales', 'finance', 'warehouse', 'custom']).optional(),
  layout: z.any().optional(),
  widgets: z.any().optional(),
  isDefault: z.boolean().optional(),
  isPublic: z.boolean().optional()
});

export class DashboardController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Dashboard);
      const items = await repo.find({
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Dashboard);
      const item = await repo.findOne({
        where: { id: req.params.id }
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
      const repo = AppDataSource.getRepository(Dashboard);
      const item = repo.create({
        ...data,
        userId: (req as any).user?.id
      });
      const saved = await repo.save(item);
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Dashboard);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      
      Object.assign(item, data);
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Dashboard);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: req.params.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
