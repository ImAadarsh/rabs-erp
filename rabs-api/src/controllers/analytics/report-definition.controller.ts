import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { ReportDefinition } from '@entities/analytics/ReportDefinition.js';
import { IsNull } from 'typeorm';

const createSchema = z.object({
  organizationId: z.string(),
  reportName: z.string().min(1),
  reportCode: z.string().min(1),
  reportCategory: z.enum(['sales', 'inventory', 'finance', 'operations', 'hr', 'marketing', 'customer', 'executive']),
  description: z.string().optional(),
  queryTemplate: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  outputFormat: z.enum(['pdf', 'excel', 'csv', 'html', 'json']).default('pdf'),
  isPublic: z.boolean().default(false)
});

const updateSchema = z.object({
  reportName: z.string().min(1).optional(),
  reportCategory: z.enum(['sales', 'inventory', 'finance', 'operations', 'hr', 'marketing', 'customer', 'executive']).optional(),
  description: z.string().optional(),
  queryTemplate: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  outputFormat: z.enum(['pdf', 'excel', 'csv', 'html', 'json']).optional(),
  isPublic: z.boolean().optional()
});

export class ReportDefinitionController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(ReportDefinition);
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
      const repo = AppDataSource.getRepository(ReportDefinition);
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
      const repo = AppDataSource.getRepository(ReportDefinition);
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
      const repo = AppDataSource.getRepository(ReportDefinition);
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
      const repo = AppDataSource.getRepository(ReportDefinition);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: req.params.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
