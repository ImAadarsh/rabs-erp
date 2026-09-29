import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { PmTask } from '@entities/pm/PmTask.js';
import { PmTaskDependency } from '@entities/pm/PmTaskDependency.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { PmWorkOrder } from '@entities/pm/PmWorkOrder.js';
import { assertOrgAccess, orgIdFromReq } from '@services/pm/pmScope.js';
import { computeAndPersistProgress } from '@services/pm/progress.service.js';

const statuses = ['todo', 'in_progress', 'blocked', 'done', 'cancelled'] as const;
const priorities = ['low', 'medium', 'high', 'urgent'] as const;

const createSchema = z.object({
  organizationId: z.string().optional(),
  projectId: z.string(),
  workOrderId: z.string().optional().nullable(),
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  assigneeUserId: z.string().optional().nullable(),
  status: z.enum(statuses).optional(),
  priority: z.enum(priorities).optional(),
  dueDate: z.string().optional().nullable(),
  estimateHours: z.number().optional(),
  loggedHours: z.number().optional(),
  progressPct: z.number().min(0).max(100).optional()
});

const updateSchema = createSchema.partial().omit({ organizationId: true, projectId: true });

const depSchema = z.object({
  dependsOnTaskId: z.string()
});

export class TasksController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const {
        projectId,
        workOrderId,
        status,
        assigneeUserId,
        priority,
        overdue,
        page = '1',
        limit = '50'
      } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(PmTask)
        .createQueryBuilder('t')
        .leftJoinAndSelect('t.assignee', 'assignee')
        .leftJoinAndSelect('t.workOrder', 'workOrder')
        .where('t.organization_id = :orgId', { orgId })
        .orderBy('t.dueDate', 'ASC')
        .addOrderBy('t.id', 'ASC')
        .take(take)
        .skip(skip);

      if (projectId) qb.andWhere('t.project_id = :projectId', { projectId });
      if (workOrderId) qb.andWhere('t.work_order_id = :workOrderId', { workOrderId });
      if (status) qb.andWhere('t.status = :status', { status });
      if (assigneeUserId) qb.andWhere('t.assignee_user_id = :assigneeUserId', { assigneeUserId });
      if (priority) qb.andWhere('t.priority = :priority', { priority });
      if (overdue === '1' || overdue === 'true') {
        qb.andWhere('t.due_date IS NOT NULL')
          .andWhere('t.due_date < CURDATE()')
          .andWhere("t.status NOT IN ('done', 'cancelled')");
      }

      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(PmTask).findOne({
        where: { id: req.params.id },
        relations: ['assignee', 'workOrder', 'project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const deps = await AppDataSource.getRepository(PmTaskDependency).find({
        where: { taskId: item.id },
        relations: ['dependsOn']
      });
      const dependents = await AppDataSource.getRepository(PmTaskDependency).find({
        where: { dependsOnTaskId: item.id },
        relations: ['task']
      });
      res.json({ data: { ...item, dependencies: deps, dependents } });
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
      if (data.workOrderId) {
        const wo = await AppDataSource.getRepository(PmWorkOrder).findOne({
          where: { id: data.workOrderId, projectId: data.projectId }
        });
        if (!wo) {
          res.status(400).json({ error: { message: 'Invalid workOrderId for project' } });
          return;
        }
      }

      const status = data.status ?? 'todo';
      const repo = AppDataSource.getRepository(PmTask);
      const item = await repo.save(
        repo.create({
          organizationId: orgId,
          projectId: data.projectId,
          workOrderId: data.workOrderId ?? null,
          title: data.title,
          description: data.description ?? null,
          assigneeUserId: data.assigneeUserId ?? null,
          status,
          priority: data.priority ?? 'medium',
          dueDate: data.dueDate ?? null,
          estimateHours: data.estimateHours ?? 0,
          loggedHours: data.loggedHours ?? 0,
          progressPct: status === 'done' ? 100 : (data.progressPct ?? 0),
          completedAt: status === 'done' ? new Date() : null
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
      const repo = AppDataSource.getRepository(PmTask);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      if (data.workOrderId !== undefined) item.workOrderId = data.workOrderId;
      if (data.title !== undefined) item.title = data.title;
      if (data.description !== undefined) item.description = data.description;
      if (data.assigneeUserId !== undefined) item.assigneeUserId = data.assigneeUserId;
      if (data.priority !== undefined) item.priority = data.priority;
      if (data.dueDate !== undefined) item.dueDate = data.dueDate;
      if (data.estimateHours !== undefined) item.estimateHours = data.estimateHours;
      if (data.loggedHours !== undefined) item.loggedHours = data.loggedHours;
      if (data.progressPct !== undefined) item.progressPct = data.progressPct;
      if (data.status !== undefined) {
        item.status = data.status;
        if (data.status === 'done') {
          item.progressPct = 100;
          item.completedAt = item.completedAt ?? new Date();
        } else if (data.status === 'cancelled') {
          // keep progress
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
      const repo = AppDataSource.getRepository(PmTask);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const projectId = item.projectId;
      await repo.remove(item);
      await computeAndPersistProgress(projectId);
      res.json({ data: { ok: true } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async complete(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PmTask);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      item.status = 'done';
      item.progressPct = 100;
      item.completedAt = new Date();
      const saved = await repo.save(item);
      await computeAndPersistProgress(item.projectId);
      res.json({ data: saved });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async addDependency(req: Request, res: Response): Promise<void> {
    try {
      const data = depSchema.parse(req.body);
      const task = await AppDataSource.getRepository(PmTask).findOne({
        where: { id: req.params.id }
      });
      if (!task) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }
      assertOrgAccess(req, task.organizationId);

      if (data.dependsOnTaskId === task.id) {
        res.status(400).json({ error: { message: 'Task cannot depend on itself' } });
        return;
      }

      const depOn = await AppDataSource.getRepository(PmTask).findOne({
        where: { id: data.dependsOnTaskId, projectId: task.projectId }
      });
      if (!depOn) {
        res.status(400).json({ error: { message: 'dependsOnTaskId must be in the same project' } });
        return;
      }

      const repo = AppDataSource.getRepository(PmTaskDependency);
      let dep = await repo.findOne({
        where: { taskId: task.id, dependsOnTaskId: data.dependsOnTaskId },
        relations: ['dependsOn']
      });
      if (!dep) {
        dep = await repo.save(
          repo.create({ taskId: task.id, dependsOnTaskId: data.dependsOnTaskId })
        );
        dep = await repo.findOne({ where: { id: dep.id }, relations: ['dependsOn'] });
      }
      res.status(201).json({ data: dep });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { message: 'Validation failed', details: error.errors } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async removeDependency(req: Request, res: Response): Promise<void> {
    try {
      const task = await AppDataSource.getRepository(PmTask).findOne({
        where: { id: req.params.id }
      });
      if (!task) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }
      assertOrgAccess(req, task.organizationId);

      const repo = AppDataSource.getRepository(PmTaskDependency);
      const dep = await repo.findOne({
        where: { taskId: task.id, dependsOnTaskId: req.params.dependsOnTaskId }
      });
      if (!dep) {
        res.status(404).json({ error: { message: 'Dependency not found' } });
        return;
      }
      await repo.remove(dep);
      res.json({ data: { ok: true } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
