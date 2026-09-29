import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { DataExport } from '@entities/analytics/DataExport.js';

const createSchema = z.object({
  organizationId: z.string(),
  exportName: z.string().min(1),
  entityType: z.string().min(1),
  exportFormat: z.enum(['csv', 'excel', 'json', 'xml']),
  filters: z.any().optional(),
  columns: z.any().optional()
});

const updateSchema = z.object({
  status: z.enum(['queued', 'processing', 'completed', 'failed']).optional(),
  fileUrl: z.string().optional(),
  rowCount: z.number().int().optional(),
  errorMessage: z.string().optional()
});

export class DataExportController {
  static async list(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(DataExport);
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
      const repo = AppDataSource.getRepository(DataExport);
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
      const repo = AppDataSource.getRepository(DataExport);
      const item = repo.create({
        ...data,
        status: 'queued',
        requestedById: (req as any).user?.id || data.organizationId // fallback for requested by
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
      const repo = AppDataSource.getRepository(DataExport);
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
      const repo = AppDataSource.getRepository(DataExport);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      await repo.remove(item);
      res.json({ data: { id: req.params.id } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
