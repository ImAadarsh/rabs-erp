import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { PmWorkOrder } from '@entities/pm/PmWorkOrder.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { PmWorkStage } from '@entities/pm/PmWorkStage.js';
import { assertOrgAccess, orgIdFromReq } from '@services/pm/pmScope.js';

const statuses = ['draft', 'scheduled', 'in_progress', 'done', 'cancelled'] as const;

const createSchema = z.object({
  organizationId: z.string().optional(),
  projectId: z.string(),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  status: z.enum(statuses).optional(),
  assigneeUserId: z.string().optional().nullable(),
  stageId: z.string().optional().nullable(),
  scheduledStart: z.string().optional().nullable(),
  scheduledEnd: z.string().optional().nullable()
});

const updateSchema = createSchema.partial().omit({ organizationId: true, projectId: true });

export class WorkOrdersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { projectId, status, assigneeUserId, stageId, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(PmWorkOrder)
        .createQueryBuilder('w')
        .leftJoinAndSelect('w.assignee', 'assignee')
        .leftJoinAndSelect('w.stage', 'stage')
        .leftJoinAndSelect('w.project', 'project')
        .where('w.organization_id = :orgId', { orgId })
        .orderBy('w.updatedAt', 'DESC')
        .take(take)
        .skip(skip);

      if (projectId) qb.andWhere('w.project_id = :projectId', { projectId });
      if (status) qb.andWhere('w.status = :status', { status });
      if (assigneeUserId) qb.andWhere('w.assignee_user_id = :assigneeUserId', { assigneeUserId });
      if (stageId) qb.andWhere('w.stage_id = :stageId', { stageId });

      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(PmWorkOrder).findOne({
        where: { id: req.params.id },
        relations: ['assignee', 'stage', 'project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Work order not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      res.json({ data: item });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const project = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: data.projectId, organizationId: orgId }
      });
      if (!project) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      if (data.stageId) {
        const stage = await AppDataSource.getRepository(PmWorkStage).findOne({
          where: { id: data.stageId, organizationId: orgId }
        });
        if (!stage) {
          res.status(400).json({ error: { message: 'Invalid stageId' } });
          return;
        }
      }

      const repo = AppDataSource.getRepository(PmWorkOrder);
      const item = await repo.save(
        repo.create({
          organizationId: orgId,
          projectId: data.projectId,
          title: data.title,
          description: data.description ?? null,
          status: data.status ?? 'draft',
          assigneeUserId: data.assigneeUserId ?? null,
          stageId: data.stageId ?? null,
          scheduledStart: data.scheduledStart ? new Date(data.scheduledStart) : null,
          scheduledEnd: data.scheduledEnd ? new Date(data.scheduledEnd) : null
        })
      );
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
      const repo = AppDataSource.getRepository(PmWorkOrder);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Work order not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      if (data.title !== undefined) item.title = data.title;
      if (data.description !== undefined) item.description = data.description;
      if (data.status !== undefined) item.status = data.status;
      if (data.assigneeUserId !== undefined) item.assigneeUserId = data.assigneeUserId;
      if (data.stageId !== undefined) item.stageId = data.stageId;
      if (data.scheduledStart !== undefined) {
        item.scheduledStart = data.scheduledStart ? new Date(data.scheduledStart) : null;
      }
      if (data.scheduledEnd !== undefined) {
        item.scheduledEnd = data.scheduledEnd ? new Date(data.scheduledEnd) : null;
      }

      const saved = await repo.save(item);
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
      const repo = AppDataSource.getRepository(PmWorkOrder);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Work order not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { ok: true } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
