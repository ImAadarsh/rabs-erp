import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { ScheduledReport } from '@entities/analytics/ScheduledReport.js';

const createSchema = z.object({
  reportDefinitionId: z.string().min(1),
  scheduleName: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  dayOfWeek: z.number().int().optional(),
  dayOfMonth: z.number().int().optional(),
  runTime: z.string().optional(),
  recipients: z.any(),
  parameters: z.any().optional(),
  isActive: z.boolean().default(true)
});

const updateSchema = z.object({
  scheduleName: z.string().min(1).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  dayOfWeek: z.number().int().optional(),
  dayOfMonth: z.number().int().optional(),
  runTime: z.string().optional(),
  recipients: z.any().optional(),
  parameters: z.any().optional(),
  isActive: z.boolean().optional()
});

export class ScheduledReportController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(ScheduledReport);
      const items = await repo.find({
        relations: ['reportDefinition'],
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(ScheduledReport);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['reportDefinition']
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
      const repo = AppDataSource.getRepository(ScheduledReport);
      const item = repo.create({
        ...data,
        createdById: (req as any).user?.id
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
      const repo = AppDataSource.getRepository(ScheduledReport);
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
      const repo = AppDataSource.getRepository(ScheduledReport);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: req.params.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
