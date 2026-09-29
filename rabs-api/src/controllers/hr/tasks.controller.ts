import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Task } from '@entities/hr/Task.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';

const createTaskSchema = z.object({
  organizationId: z.string(),
  title: z.string().min(1),
  description: z.string().optional(),
  taskType: z.enum(['order', 'project', 'maintenance', 'support', 'other']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().optional(),
  assignedBy: z.string().optional(),
  businessUnitId: z.string().optional(),
  locationId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.coerce.number().optional(),
  notes: z.string().optional()
});

const updateTaskSchema = z.object({
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  taskType: z.enum(['order', 'project', 'maintenance', 'support', 'other']).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignedTo: z.string().optional(),
  businessUnitId: z.string().optional(),
  locationId: z.string().optional(),
  relatedEntityType: z.string().optional(),
  relatedEntityId: z.string().optional(),
  dueDate: z.string().optional(),
  estimatedHours: z.coerce.number().optional(),
  actualHours: z.coerce.number().optional(),
  status: z.enum(['pending', 'in_progress', 'blocked', 'completed', 'cancelled']).optional(),
  notes: z.string().optional()
});

export class TasksController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Task);
      const { organizationId, status, assignedTo, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('t')
        .leftJoinAndSelect('t.organization', 'org')
        .leftJoinAndSelect('t.assignedTo', 'assigned')
        .leftJoinAndSelect('t.assignedBy', 'assigner')
        .leftJoinAndSelect('t.businessUnit', 'bu')
        .leftJoinAndSelect('t.location', 'loc')
        .orderBy('t.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('t.organization_id = :orgId', { orgId: organizationId });
      }

      if (status) {
        queryBuilder.andWhere('t.status = :status', { status });
      }

      if (assignedTo) {
        queryBuilder.andWhere('t.assigned_to = :assignedTo', { assignedTo });
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      queryBuilder.skip(skip).take(parseInt(limit as string));

      const [items, total] = await queryBuilder.getManyAndCount();
      
      res.json({ 
        data: items, 
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Task);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'assignedTo', 'assignedBy', 'businessUnit', 'location']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createTaskSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const orgRepo = AppDataSource.getRepository(Organization);
      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const repo = AppDataSource.getRepository(Task);
      let assignedTo = null;
      let assignedBy = null;
      let businessUnit = null;
      let location = null;
      
      if (parsed.data.assignedTo) {
        const userRepo = AppDataSource.getRepository(User);
        assignedTo = await userRepo.findOne({ where: { id: parsed.data.assignedTo } });
      }

      if (parsed.data.assignedBy) {
        const userRepo = AppDataSource.getRepository(User);
        assignedBy = await userRepo.findOne({ where: { id: parsed.data.assignedBy } });
      }

      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
      }

      if (parsed.data.locationId) {
        const locRepo = AppDataSource.getRepository(Location);
        location = await locRepo.findOne({ where: { id: parsed.data.locationId } });
      }

      const item = repo.create({
        organization: org,
        title: parsed.data.title,
        description: parsed.data.description ?? null,
        taskType: parsed.data.taskType ?? 'other',
        priority: parsed.data.priority ?? 'medium',
        assignedTo: assignedTo ?? undefined,
        assignedBy: assignedBy ?? undefined,
        businessUnit: businessUnit ?? undefined,
        location: location ?? undefined,
        relatedEntityType: parsed.data.relatedEntityType ?? null,
        relatedEntityId: parsed.data.relatedEntityId ?? null,
        dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        estimatedHours: parsed.data.estimatedHours ?? null,
        status: 'pending',
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'assignedTo', 'assignedBy', 'businessUnit', 'location']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateTaskSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Task);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'assignedTo', 'assignedBy', 'businessUnit', 'location']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }

      if (parsed.data.assignedTo !== undefined) {
        if (parsed.data.assignedTo) {
          const userRepo = AppDataSource.getRepository(User);
          const assignedTo = await userRepo.findOne({ where: { id: parsed.data.assignedTo } });
          item.assignedTo = assignedTo ?? null;
        } else {
          item.assignedTo = null;
        }
      }

      if (parsed.data.businessUnitId !== undefined) {
        if (parsed.data.businessUnitId) {
          const buRepo = AppDataSource.getRepository(BusinessUnit);
          const businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
          item.businessUnit = businessUnit ?? null;
        } else {
          item.businessUnit = null;
        }
      }

      if (parsed.data.locationId !== undefined) {
        if (parsed.data.locationId) {
          const locRepo = AppDataSource.getRepository(Location);
          const location = await locRepo.findOne({ where: { id: parsed.data.locationId } });
          item.location = location ?? null;
        } else {
          item.location = null;
        }
      }

      if (parsed.data.title) item.title = parsed.data.title;
      if (parsed.data.description !== undefined) item.description = parsed.data.description ?? null;
      if (parsed.data.taskType) item.taskType = parsed.data.taskType;
      if (parsed.data.priority) item.priority = parsed.data.priority;
      if (parsed.data.relatedEntityType !== undefined) item.relatedEntityType = parsed.data.relatedEntityType ?? null;
      if (parsed.data.relatedEntityId !== undefined) item.relatedEntityId = parsed.data.relatedEntityId ?? null;
      if (parsed.data.dueDate !== undefined) item.dueDate = parsed.data.dueDate ? new Date(parsed.data.dueDate) : null;
      if (parsed.data.estimatedHours !== undefined) item.estimatedHours = parsed.data.estimatedHours ?? null;
      if (parsed.data.actualHours !== undefined) item.actualHours = parsed.data.actualHours ?? null;
      if (parsed.data.status) {
        item.status = parsed.data.status;
        if (parsed.data.status === 'completed' && !item.completedAt) {
          item.completedAt = new Date();
        }
      }
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'assignedTo', 'assignedBy', 'businessUnit', 'location']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Task);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Task not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

