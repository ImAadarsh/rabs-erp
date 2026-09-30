import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { PmMilestone } from '@entities/pm/PmMilestone.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { assertOrgAccess, orgIdFromReq } from '@services/pm/pmScope.js';
import { computeAndPersistProgress } from '@services/pm/progress.service.js';

const statuses = ['pending', 'achieved', 'missed', 'cancelled'] as const;

const createSchema = z.object({
  projectId: z.string(),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  dueDate: z.string().optional().nullable(),
  status: z.enum(statuses).optional()
});

const updateSchema = createSchema.partial().omit({ projectId: true });

export class MilestonesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { projectId, status, upcoming, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(PmMilestone)
        .createQueryBuilder('m')
        .innerJoin('m.project', 'p')
        .where('p.organization_id = :orgId', { orgId })
        .orderBy('m.dueDate', 'ASC')
        .addOrderBy('m.id', 'ASC')
        .take(take)
        .skip(skip);

      if (projectId) qb.andWhere('m.project_id = :projectId', { projectId });
      if (status) qb.andWhere('m.status = :status', { status });
      if (upcoming === '1' || upcoming === 'true') {
        qb.andWhere("m.status = 'pending'")
          .andWhere('m.due_date IS NOT NULL')
          .andWhere('m.due_date >= CURDATE()');
      }

      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(PmMilestone).findOne({
        where: { id: req.params.id },
        relations: ['project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Milestone not found' } });
        return;
      }
      assertOrgAccess(req, item.project.organizationId);
      res.json({ data: item });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const orgId = orgIdFromReq(req);
      const project = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: data.projectId }
      });
      if (!project) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      if (orgId) assertOrgAccess(req, project.organizationId);
      else assertOrgAccess(req, project.organizationId);

      const status = data.status ?? 'pending';
      const repo = AppDataSource.getRepository(PmMilestone);
      const item = await repo.save(
        repo.create({
          projectId: data.projectId,
          title: data.title,
          description: data.description ?? null,
          dueDate: data.dueDate ?? null,
          status,
          completedAt: status === 'achieved' ? new Date() : null
        })
      );
      await computeAndPersistProgress(data.projectId);
      res.status(201).json({ data: item });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { message: 'Validation failed', details: error.errors } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(PmMilestone);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Milestone not found' } });
        return;
      }
      assertOrgAccess(req, item.project.organizationId);

      if (data.title !== undefined) item.title = data.title;
      if (data.description !== undefined) item.description = data.description;
      if (data.dueDate !== undefined) item.dueDate = data.dueDate;
      if (data.status !== undefined) {
        item.status = data.status;
        if (data.status === 'achieved') {
          item.completedAt = item.completedAt ?? new Date();
        } else {
          item.completedAt = null;
        }
      }

      const saved = await repo.save(item);
      await computeAndPersistProgress(item.projectId);
      res.json({ data: saved });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { message: 'Validation failed', details: error.errors } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PmMilestone);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Milestone not found' } });
        return;
      }
      assertOrgAccess(req, item.project.organizationId);
      const projectId = item.projectId;
      await repo.remove(item);
      await computeAndPersistProgress(projectId);
      res.json({ data: { ok: true } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
