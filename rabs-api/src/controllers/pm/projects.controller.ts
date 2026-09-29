import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { PmDeliverable } from '@entities/pm/PmDeliverable.js';
import { PmProjectMember } from '@entities/pm/PmProjectMember.js';
import { PmTask } from '@entities/pm/PmTask.js';
import { PmMilestone } from '@entities/pm/PmMilestone.js';
import { PmWorkOrder } from '@entities/pm/PmWorkOrder.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/pm/pmScope.js';
import { computeAndPersistProgress } from '@services/pm/progress.service.js';

const projectStatuses = ['draft', 'active', 'on_hold', 'completed', 'cancelled'] as const;
const deliverableStatuses = ['pending', 'in_progress', 'done', 'cancelled'] as const;
const memberRoles = ['owner', 'manager', 'member', 'viewer'] as const;

const createProjectSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).max(255),
  code: z.string().max(64).optional().nullable(),
  customerId: z.string().optional().nullable(),
  orderId: z.string().optional().nullable(),
  scope: z.string().optional().nullable(),
  objectives: z.string().optional().nullable(),
  status: z.enum(projectStatuses).optional(),
  startDate: z.string().optional().nullable(),
  endDate: z.string().optional().nullable(),
  budget: z.number().optional(),
  currency: z.string().length(3).optional(),
  ownerUserId: z.string().optional().nullable()
});

const updateProjectSchema = createProjectSchema.partial().omit({ organizationId: true });

const deliverableSchema = z.object({
  title: z.string().min(1).max(255),
  description: z.string().optional().nullable(),
  status: z.enum(deliverableStatuses).optional(),
  dueDate: z.string().optional().nullable()
});

const memberSchema = z.object({
  userId: z.string(),
  role: z.enum(memberRoles).optional()
});

export class ProjectsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { status, ownerUserId, customerId, search, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(PmProject)
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.owner', 'owner')
        .leftJoinAndSelect('p.customer', 'customer')
        .where('p.organization_id = :orgId', { orgId })
        .orderBy('p.updatedAt', 'DESC')
        .take(take)
        .skip(skip);

      if (status) qb.andWhere('p.status = :status', { status });
      if (ownerUserId) qb.andWhere('p.owner_user_id = :ownerUserId', { ownerUserId });
      if (customerId) qb.andWhere('p.customer_id = :customerId', { customerId });
      if (search) {
        qb.andWhere('(p.name LIKE :q OR p.code LIKE :q)', { q: `%${String(search)}%` });
      }

      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: req.params.id },
        relations: ['owner', 'customer']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      const [deliverables, members, tasks, milestones, workOrders] = await Promise.all([
        AppDataSource.getRepository(PmDeliverable).find({
          where: { projectId: item.id },
          order: { dueDate: 'ASC', id: 'ASC' }
        }),
        AppDataSource.getRepository(PmProjectMember).find({
          where: { projectId: item.id },
          relations: ['user']
        }),
        AppDataSource.getRepository(PmTask).find({
          where: { projectId: item.id },
          relations: ['assignee'],
          order: { dueDate: 'ASC', id: 'ASC' }
        }),
        AppDataSource.getRepository(PmMilestone).find({
          where: { projectId: item.id },
          order: { dueDate: 'ASC', id: 'ASC' }
        }),
        AppDataSource.getRepository(PmWorkOrder).find({
          where: { projectId: item.id },
          relations: ['assignee', 'stage'],
          order: { id: 'ASC' }
        })
      ]);

      res.json({
        data: { ...item, deliverables, members, tasks, milestones, workOrders }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createProjectSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const repo = AppDataSource.getRepository(PmProject);
      const ownerUserId = data.ownerUserId ?? userIdFromReq(req) ?? null;
      const item = await repo.save(
        repo.create({
          organizationId: orgId,
          name: data.name,
          code: data.code ?? null,
          customerId: data.customerId ?? null,
          orderId: data.orderId ?? null,
          scope: data.scope ?? null,
          objectives: data.objectives ?? null,
          status: data.status ?? 'draft',
          startDate: data.startDate ?? null,
          endDate: data.endDate ?? null,
          budget: data.budget ?? 0,
          currency: data.currency ?? 'GBP',
          ownerUserId,
          progressPct: 0,
          productionReady: false,
          completedAt: null
        })
      );

      if (ownerUserId) {
        const memRepo = AppDataSource.getRepository(PmProjectMember);
        const existing = await memRepo.findOne({ where: { projectId: item.id, userId: ownerUserId } });
        if (!existing) {
          await memRepo.save(
            memRepo.create({ projectId: item.id, userId: ownerUserId, role: 'owner' })
          );
        }
      }

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
      const data = updateProjectSchema.parse(req.body);
      const repo = AppDataSource.getRepository(PmProject);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      Object.assign(item, {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.code !== undefined && { code: data.code }),
        ...(data.customerId !== undefined && { customerId: data.customerId }),
        ...(data.orderId !== undefined && { orderId: data.orderId }),
        ...(data.scope !== undefined && { scope: data.scope }),
        ...(data.objectives !== undefined && { objectives: data.objectives }),
        ...(data.status !== undefined && { status: data.status }),
        ...(data.startDate !== undefined && { startDate: data.startDate }),
        ...(data.endDate !== undefined && { endDate: data.endDate }),
        ...(data.budget !== undefined && { budget: data.budget }),
        ...(data.currency !== undefined && { currency: data.currency }),
        ...(data.ownerUserId !== undefined && { ownerUserId: data.ownerUserId })
      });

      if (data.status === 'completed' && !item.completedAt) {
        item.completedAt = new Date();
      }
      if (data.status && data.status !== 'completed') {
        item.completedAt = null;
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
      const repo = AppDataSource.getRepository(PmProject);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { ok: true } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async progress(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: req.params.id }
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const progress = await computeAndPersistProgress(item.id);
      res.json({ data: progress });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async markProductionReady(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PmProject);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      item.productionReady = true;
      if (item.status === 'draft') item.status = 'active';
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async complete(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PmProject);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      item.status = 'completed';
      item.completedAt = new Date();
      item.progressPct = 100;
      item.productionReady = true;
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  // --- Deliverables (nested under project) ---
  static async listDeliverables(req: Request, res: Response): Promise<void> {
    try {
      const project = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: req.params.id }
      });
      if (!project) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, project.organizationId);
      const items = await AppDataSource.getRepository(PmDeliverable).find({
        where: { projectId: project.id },
        order: { dueDate: 'ASC', id: 'ASC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async createDeliverable(req: Request, res: Response): Promise<void> {
    try {
      const data = deliverableSchema.parse(req.body);
      const project = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: req.params.id }
      });
      if (!project) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, project.organizationId);
      const repo = AppDataSource.getRepository(PmDeliverable);
      const item = await repo.save(
        repo.create({
          projectId: project.id,
          title: data.title,
          description: data.description ?? null,
          status: data.status ?? 'pending',
          dueDate: data.dueDate ?? null
        })
      );
      await computeAndPersistProgress(project.id);
      res.status(201).json({ data: item });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { message: 'Validation failed', details: error.errors } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async updateDeliverable(req: Request, res: Response): Promise<void> {
    try {
      const data = deliverableSchema.partial().parse(req.body);
      const repo = AppDataSource.getRepository(PmDeliverable);
      const item = await repo.findOne({
        where: { id: req.params.deliverableId },
        relations: ['project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Deliverable not found' } });
        return;
      }
      assertOrgAccess(req, item.project.organizationId);
      Object.assign(item, data);
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

  static async removeDeliverable(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PmDeliverable);
      const item = await repo.findOne({
        where: { id: req.params.deliverableId },
        relations: ['project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Deliverable not found' } });
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

  // --- Members ---
  static async listMembers(req: Request, res: Response): Promise<void> {
    try {
      const project = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: req.params.id }
      });
      if (!project) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, project.organizationId);
      const items = await AppDataSource.getRepository(PmProjectMember).find({
        where: { projectId: project.id },
        relations: ['user']
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async addMember(req: Request, res: Response): Promise<void> {
    try {
      const data = memberSchema.parse(req.body);
      const project = await AppDataSource.getRepository(PmProject).findOne({
        where: { id: req.params.id }
      });
      if (!project) {
        res.status(404).json({ error: { message: 'Project not found' } });
        return;
      }
      assertOrgAccess(req, project.organizationId);
      const repo = AppDataSource.getRepository(PmProjectMember);
      let item = await repo.findOne({
        where: { projectId: project.id, userId: data.userId },
        relations: ['user']
      });
      if (item) {
        if (data.role) {
          item.role = data.role;
          item = await repo.save(item);
        }
        res.json({ data: item });
        return;
      }
      item = await repo.save(
        repo.create({
          projectId: project.id,
          userId: data.userId,
          role: data.role ?? 'member'
        })
      );
      const withUser = await repo.findOne({ where: { id: item.id }, relations: ['user'] });
      res.status(201).json({ data: withUser });
    } catch (error: any) {
      if (error.name === 'ZodError') {
        res.status(400).json({ error: { message: 'Validation failed', details: error.errors } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async updateMember(req: Request, res: Response): Promise<void> {
    try {
      const data = z.object({ role: z.enum(memberRoles) }).parse(req.body);
      const repo = AppDataSource.getRepository(PmProjectMember);
      const item = await repo.findOne({
        where: { id: req.params.memberId },
        relations: ['project', 'user']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Member not found' } });
        return;
      }
      assertOrgAccess(req, item.project.organizationId);
      item.role = data.role;
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

  static async removeMember(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PmProjectMember);
      const item = await repo.findOne({
        where: { id: req.params.memberId },
        relations: ['project']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Member not found' } });
        return;
      }
      assertOrgAccess(req, item.project.organizationId);
      await repo.remove(item);
      res.json({ data: { ok: true } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
