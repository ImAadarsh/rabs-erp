import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { PmScheduleBlock } from '@entities/pm/PmScheduleBlock.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { PmTask } from '@entities/pm/PmTask.js';
import { assertOrgAccess, orgIdFromReq } from '@services/pm/pmScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  userId: z.string(),
  projectId: z.string().optional().nullable(),
  taskId: z.string().optional().nullable(),
  startAt: z.string(),
  endAt: z.string(),
  notes: z.string().optional().nullable()
});

const updateSchema = createSchema.partial().omit({ organizationId: true });

export class ScheduleController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { userId, projectId, taskId, from, to, page = '1', limit = '100' } = req.query;
      const take = Math.min(Number(limit) || 100, 500);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(PmScheduleBlock)
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.user', 'user')
        .leftJoinAndSelect('s.project', 'project')
        .leftJoinAndSelect('s.task', 'task')
        .where('s.organization_id = :orgId', { orgId })
        .orderBy('s.startAt', 'ASC')
        .take(take)
        .skip(skip);

      if (userId) qb.andWhere('s.user_id = :userId', { userId });
      if (projectId) qb.andWhere('s.project_id = :projectId', { projectId });
      if (taskId) qb.andWhere('s.task_id = :taskId', { taskId });
      if (from) qb.andWhere('s.end_at >= :from', { from: String(from) });
      if (to) qb.andWhere('s.start_at <= :to', { to: String(to) });

      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(PmScheduleBlock).findOne({
        where: { id: req.params.id },
        relations: ['user', 'project', 'task']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Schedule block not found' } });
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
      const startAt = new Date(data.startAt);
      const endAt = new Date(data.endAt);
      if (!(startAt < endAt)) {
        res.status(400).json({ error: { message: 'startAt must be before endAt' } });
        return;
      }
      if (data.projectId) {
        const project = await AppDataSource.getRepository(PmProject).findOne({
          where: { id: data.projectId, organizationId: orgId }
        });
        if (!project) {
          res.status(400).json({ error: { message: 'Invalid projectId' } });
          return;
        }
      }
      if (data.taskId) {
        const task = await AppDataSource.getRepository(PmTask).findOne({
          where: { id: data.taskId, organizationId: orgId }
        });
        if (!task) {
          res.status(400).json({ error: { message: 'Invalid taskId' } });
          return;
        }
      }

      const repo = AppDataSource.getRepository(PmScheduleBlock);
      const item = await repo.save(
        repo.create({
          organizationId: orgId,
          userId: data.userId,
          projectId: data.projectId ?? null,
          taskId: data.taskId ?? null,
          startAt,
          endAt,
          notes: data.notes ?? null
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
      const repo = AppDataSource.getRepository(PmScheduleBlock);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Schedule block not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      if (data.userId !== undefined) item.userId = data.userId;
      if (data.projectId !== undefined) item.projectId = data.projectId;
      if (data.taskId !== undefined) item.taskId = data.taskId;
      if (data.startAt !== undefined) item.startAt = new Date(data.startAt);
      if (data.endAt !== undefined) item.endAt = new Date(data.endAt);
      if (data.notes !== undefined) item.notes = data.notes;

      if (!(item.startAt < item.endAt)) {
        res.status(400).json({ error: { message: 'startAt must be before endAt' } });
        return;
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
      const repo = AppDataSource.getRepository(PmScheduleBlock);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Schedule block not found' } });
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
