import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { ReportDefinition } from '@entities/analytics/ReportDefinition.js';
import { ReportExecution } from '@entities/analytics/ReportExecution.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';
import { listDatasets, resolveDatasetKey, runDataset } from '@services/analytics/reportEngine.service.js';

const categories = ['sales', 'inventory', 'finance', 'operations', 'hr', 'marketing', 'customer', 'executive'] as const;

const createSchema = z.object({
  organizationId: z.string(),
  reportName: z.string().min(1),
  reportCode: z.string().min(1),
  reportCategory: z.enum(categories),
  description: z.string().optional(),
  queryTemplate: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  outputFormat: z.enum(['pdf', 'excel', 'csv', 'html', 'json']).default('pdf'),
  isPublic: z.boolean().default(false)
});

const updateSchema = z.object({
  reportName: z.string().min(1).optional(),
  reportCategory: z.enum(categories).optional(),
  description: z.string().optional(),
  queryTemplate: z.string().optional(),
  parameters: z.record(z.any()).optional(),
  outputFormat: z.enum(['pdf', 'excel', 'csv', 'html', 'json']).optional(),
  isPublic: z.boolean().optional()
});

const runSchema = z.object({
  from: z.string().optional().nullable(),
  to: z.string().optional().nullable()
});

function zodMessage(error: z.ZodError): string {
  return error.issues.map((i) => `${i.path.join('.') || 'body'}: ${i.message}`).join('; ');
}

export class ReportDefinitionController {
  static async list(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      const repo = AppDataSource.getRepository(ReportDefinition);
      const items = await repo.find({
        where: orgId ? { organizationId: orgId } : {},
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /** GET /api/analytics/reports/datasets — built-in datasets a report can run */
  static async datasets(_req: Request, res: Response) {
    res.json({ data: listDatasets() });
  }

  static async get(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(ReportDefinition);
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
      const repo = AppDataSource.getRepository(ReportDefinition);
      const item = repo.create({
        ...data,
        createdById: userIdFromReq(req)
      });
      const saved = await repo.save(item);
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: zodMessage(error), details: error.issues } });
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
      assertOrgAccess(req, item.organizationId);

      Object.assign(item, data);
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: zodMessage(error), details: error.issues } });
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /** POST /api/analytics/reports/:id/run — execute the report's dataset against live, org-scoped data */
  static async run(req: Request, res: Response) {
    const execRepo = AppDataSource.getRepository(ReportExecution);
    let execution: ReportExecution | null = null;
    const started = Date.now();
    try {
      const range = runSchema.parse(req.body || {});
      const item = await AppDataSource.getRepository(ReportDefinition).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);

      const datasetKey = resolveDatasetKey(item.reportCategory, item.parameters);
      try {
        execution = await execRepo.save(
          execRepo.create({
            reportDefinitionId: item.id,
            parameters: { dataset: datasetKey, from: range.from ?? null, to: range.to ?? null },
            status: 'running',
            startedAt: new Date(),
            requestedById: userIdFromReq(req)
          })
        );
      } catch {
        execution = null;
      }

      const result = await runDataset(datasetKey, String(item.organizationId), range);

      if (execution) {
        execution.status = 'completed';
        execution.completedAt = new Date();
        execution.executionTimeSeconds = Math.round((Date.now() - started) / 1000);
        execution.rowCount = result.rows.length;
        await execRepo.save(execution).catch(() => undefined);
      }

      res.json({
        data: {
          report: { id: item.id, reportName: item.reportName, reportCode: item.reportCode, outputFormat: item.outputFormat },
          ...result,
          executionId: execution?.id ?? null,
          ranAt: new Date().toISOString()
        }
      });
    } catch (error: any) {
      if (execution) {
        execution.status = 'failed';
        execution.completedAt = new Date();
        execution.errorMessage = String(error.message || 'Execution failed').slice(0, 2000);
        await execRepo.save(execution).catch(() => undefined);
      }
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: zodMessage(error), details: error.issues } });
      }
      res.status(error.status || 500).json({ error: { message: `Report execution failed: ${error.message}` } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(ReportDefinition);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { id: req.params.id } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
