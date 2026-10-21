import fs from 'fs/promises';
import path from 'path';
import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { DataExport } from '@entities/analytics/DataExport.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';
import { exportsRoot } from '@services/analytics/reportEngine.service.js';
import { exportFileName, processExport, processPendingExports } from '@services/analytics/dataExport.service.js';

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
      const orgId = orgIdFromReq(req);
      const repo = AppDataSource.getRepository(DataExport);
      const items = await repo.find({
        where: orgId ? { organizationId: orgId } : {},
        order: { createdAt: 'DESC' }
      });
      // The background worker also picks these up; this just avoids waiting for its next tick.
      if (items.some((it) => it.status === 'queued' || it.status === 'processing')) {
        void processPendingExports(orgId).catch(() => undefined);
      }
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
      assertOrgAccess(req, item.organizationId);
      res.json({ data: item });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const data = createSchema.parse(req.body);
      const requestedById = userIdFromReq(req);
      if (!requestedById) {
        return res.status(401).json({ error: { message: 'Unauthorized' } });
      }
      const repo = AppDataSource.getRepository(DataExport);
      const item = repo.create({
        ...data,
        status: 'queued',
        requestedById
      });
      const saved = await repo.save(item);
      void processExport(String(saved.id));
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          error: {
            message: error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; '),
            details: error.issues
          }
        });
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /** GET /api/analytics/exports/:id/download — authenticated, org-scoped file download */
  static async download(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(DataExport).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      if (item.status !== 'completed') {
        return res.status(409).json({ error: { message: `Export is ${item.status}, not ready for download` } });
      }
      if (item.expiresAt && new Date(item.expiresAt).getTime() < Date.now()) {
        return res.status(410).json({ error: { message: 'Export file has expired. Start a new export.' } });
      }
      const filePath = path.join(exportsRoot, exportFileName(item));
      try {
        await fs.access(filePath);
      } catch {
        return res.status(410).json({ error: { message: 'Export file is no longer available. Start a new export.' } });
      }
      const ext = path.extname(filePath);
      const base = item.exportName.replace(/[^A-Za-z0-9._-]+/g, '_').slice(0, 80) || `export-${item.id}`;
      res.download(filePath, `${base}${ext}`);
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(DataExport);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);

      Object.assign(item, data);
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(DataExport);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      await fs.unlink(path.join(exportsRoot, exportFileName(item))).catch(() => undefined);
      await repo.remove(item);
      res.json({ data: { id: req.params.id } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
