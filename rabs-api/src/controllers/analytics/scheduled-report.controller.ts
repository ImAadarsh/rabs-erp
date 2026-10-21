import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { z } from 'zod';
import { ScheduledReport } from '@entities/analytics/ScheduledReport.js';
import { ReportExecution } from '@entities/analytics/ReportExecution.js';
import { computeNextRun, recipientEmails, runScheduledReport } from '@services/analytics/reportScheduler.service.js';
import { userIdFromReq } from '@services/crm/crmScope.js';

const recipientsSchema = z
  .any()
  .transform((v) => ({ emailList: recipientEmails(v) }));

function badRecipients(v: unknown): string | null {
  const raw: unknown[] = Array.isArray(v)
    ? v
    : v && typeof v === 'object' && Array.isArray((v as any).emailList)
      ? (v as any).emailList
      : typeof v === 'string'
        ? v.split(/[,;\s]+/)
        : [];
  const invalid = raw.map((r) => String(r ?? '').trim()).filter((r) => r && !recipientEmails([r]).length);
  return invalid.length ? `Invalid recipient email: ${invalid.join(', ')}` : null;
}

const createSchema = z.object({
  reportDefinitionId: z.string().min(1),
  scheduleName: z.string().min(1),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  dayOfWeek: z.number().int().optional(),
  dayOfMonth: z.number().int().optional(),
  runTime: z.string().optional(),
  recipients: recipientsSchema,
  parameters: z.any().optional(),
  isActive: z.boolean().default(true)
});

const updateSchema = z.object({
  scheduleName: z.string().min(1).optional(),
  frequency: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  dayOfWeek: z.number().int().optional(),
  dayOfMonth: z.number().int().optional(),
  runTime: z.string().optional(),
  recipients: recipientsSchema.optional(),
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
      const lastById = new Map<string, ReportExecution>();
      if (items.length) {
        const execs = await AppDataSource.getRepository(ReportExecution)
          .createQueryBuilder('e')
          .where('e.scheduled_report_id IN (:...ids)', { ids: items.map((i) => i.id) })
          .orderBy('e.id', 'DESC')
          .getMany();
        for (const e of execs) {
          const key = String(e.scheduledReportId);
          if (!lastById.has(key)) lastById.set(key, e);
        }
      }
      res.json({
        data: items.map((i) => {
          const e = lastById.get(String(i.id));
          return {
            ...i,
            lastExecution: e
              ? {
                  id: e.id,
                  status: e.status,
                  completedAt: e.completedAt,
                  rowCount: e.rowCount,
                  outputUrl: e.outputUrl,
                  errorMessage: e.errorMessage,
                  delivery: e.parameters?.delivery ?? null
                }
              : null
          };
        })
      });
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
      const bad = badRecipients(req.body?.recipients);
      if (bad) return res.status(400).json({ error: { message: bad } });
      const data = createSchema.parse(req.body);
      const repo = AppDataSource.getRepository(ScheduledReport);
      const item = repo.create({
        ...data,
        createdById: userIdFromReq(req) ?? undefined
      });
      item.nextRunAt = item.isActive ? computeNextRun(item) : undefined;
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
      if (req.body?.recipients !== undefined) {
        const bad = badRecipients(req.body.recipients);
        if (bad) return res.status(400).json({ error: { message: bad } });
      }
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(ScheduledReport);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });

      Object.assign(item, data);
      item.nextRunAt = item.isActive ? computeNextRun(item) : (null as any);
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /** POST /api/analytics/scheduled-reports/:id/run — run a schedule immediately (does not move next_run_at). */
  static async runNow(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(ScheduledReport).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      const result = await runScheduledReport(item, { trigger: 'manual', requestedById: userIdFromReq(req) });
      res.json({ data: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
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
