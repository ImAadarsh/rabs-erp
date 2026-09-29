import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { HrLeavePolicy } from '@entities/hr/HrLeavePolicy.js';
import { HrLeaveBalance } from '@entities/hr/HrLeaveBalance.js';
import { LeaveRequest } from '@entities/hr/LeaveRequest.js';
import { User } from '@entities/iam/User.js';
import { orgIdFromReq, userIdFromReq } from '@services/hr/hrScope.js';
import { IsNull } from 'typeorm';

const leaveTypes = [
  'vacation',
  'sick',
  'personal',
  'maternity',
  'paternity',
  'bereavement',
  'unpaid',
  'other'
] as const;

const policySchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).max(150),
  leaveType: z.enum(leaveTypes).optional(),
  entitlementDays: z.coerce.number().optional(),
  carriesOver: z.boolean().optional(),
  maxCarryDays: z.coerce.number().optional().nullable(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional().nullable()
});

const balanceSchema = z.object({
  employeeId: z.string(),
  leavePolicyId: z.string(),
  year: z.coerce.number().int(),
  entitledDays: z.coerce.number().optional(),
  usedDays: z.coerce.number().optional(),
  pendingDays: z.coerce.number().optional(),
  carriedDays: z.coerce.number().optional()
});

export class LeavePoliciesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const items = await AppDataSource.getRepository(HrLeavePolicy).find({
        where: { organizationId: orgId },
        order: { name: 'ASC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = policySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const orgId = parsed.data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrLeavePolicy);
      const item = await repo.save(
        repo.create({
          organizationId: orgId,
          name: parsed.data.name,
          leaveType: parsed.data.leaveType ?? 'vacation',
          entitlementDays: parsed.data.entitlementDays ?? 28,
          carriesOver: parsed.data.carriesOver ?? false,
          maxCarryDays: parsed.data.maxCarryDays ?? null,
          isActive: parsed.data.isActive ?? true,
          notes: parsed.data.notes ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = policySchema.partial().safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrLeavePolicy);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Leave policy not found' } });
        return;
      }
      Object.assign(item, {
        ...(parsed.data.name !== undefined ? { name: parsed.data.name } : {}),
        ...(parsed.data.leaveType ? { leaveType: parsed.data.leaveType } : {}),
        ...(parsed.data.entitlementDays !== undefined
          ? { entitlementDays: parsed.data.entitlementDays }
          : {}),
        ...(parsed.data.carriesOver !== undefined ? { carriesOver: parsed.data.carriesOver } : {}),
        ...(parsed.data.maxCarryDays !== undefined ? { maxCarryDays: parsed.data.maxCarryDays } : {}),
        ...(parsed.data.isActive !== undefined ? { isActive: parsed.data.isActive } : {}),
        ...(parsed.data.notes !== undefined ? { notes: parsed.data.notes } : {})
      });
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrLeavePolicy);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Leave policy not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class LeaveBalancesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, year, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrLeaveBalance)
        .createQueryBuilder('b')
        .leftJoinAndSelect('b.leavePolicy', 'policy')
        .leftJoinAndSelect('b.employee', 'emp')
        .orderBy('b.year', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('b.employee_id = :employeeId', { employeeId });
      if (year) qb.andWhere('b.year = :year', { year: Number(year) });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async upsert(req: Request, res: Response): Promise<void> {
    try {
      const parsed = balanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const emp = await AppDataSource.getRepository(Employee).findOne({
        where: { id: parsed.data.employeeId, deletedAt: IsNull() }
      });
      if (!emp) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const policy = await AppDataSource.getRepository(HrLeavePolicy).findOne({
        where: { id: parsed.data.leavePolicyId }
      });
      if (!policy) {
        res.status(400).json({ error: { message: 'Invalid leavePolicyId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrLeaveBalance);
      let item = await repo.findOne({
        where: {
          employeeId: parsed.data.employeeId,
          leavePolicyId: parsed.data.leavePolicyId,
          year: parsed.data.year
        }
      });
      if (!item) {
        item = repo.create({
          employeeId: parsed.data.employeeId,
          leavePolicyId: parsed.data.leavePolicyId,
          year: parsed.data.year,
          entitledDays: parsed.data.entitledDays ?? policy.entitlementDays,
          usedDays: parsed.data.usedDays ?? 0,
          pendingDays: parsed.data.pendingDays ?? 0,
          carriedDays: parsed.data.carriedDays ?? 0
        });
      } else {
        if (parsed.data.entitledDays !== undefined) item.entitledDays = parsed.data.entitledDays;
        if (parsed.data.usedDays !== undefined) item.usedDays = parsed.data.usedDays;
        if (parsed.data.pendingDays !== undefined) item.pendingDays = parsed.data.pendingDays;
        if (parsed.data.carriedDays !== undefined) item.carriedDays = parsed.data.carriedDays;
      }
      await repo.save(item);
      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['leavePolicy', 'employee']
      });
      res.json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

/** Approve / reject leave — extends legacy leave_requests. */
export class LeaveActionsController {
  static async approve(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(LeaveRequest);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['employee', 'approvedBy']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Leave Request not found' } });
        return;
      }
      if (item.status !== 'pending') {
        res.status(400).json({ error: { message: `Cannot approve leave in status ${item.status}` } });
        return;
      }
      const uid = userIdFromReq(req);
      item.status = 'approved';
      item.approvedAt = new Date();
      item.rejectionReason = null;
      if (uid) {
        const user = await AppDataSource.getRepository(User).findOne({ where: { id: uid } });
        item.approvedBy = user ?? null;
      }
      await repo.save(item);

      if (item.leavePolicyId) {
        const year = new Date(item.startDate).getFullYear();
        const balRepo = AppDataSource.getRepository(HrLeaveBalance);
        const bal = await balRepo.findOne({
          where: {
            employeeId: item.employee.id,
            leavePolicyId: item.leavePolicyId,
            year
          }
        });
        if (bal) {
          const days = Number(item.totalDays) || 0;
          bal.pendingDays = Math.max(0, Number(bal.pendingDays) - days);
          bal.usedDays = Number(bal.usedDays) + days;
          await balRepo.save(bal);
        }
      }

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'approvedBy']
      });
      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async reject(req: Request, res: Response): Promise<void> {
    try {
      const reason = typeof req.body?.rejectionReason === 'string' ? req.body.rejectionReason : null;
      const repo = AppDataSource.getRepository(LeaveRequest);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['employee', 'approvedBy']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Leave Request not found' } });
        return;
      }
      if (item.status !== 'pending') {
        res.status(400).json({ error: { message: `Cannot reject leave in status ${item.status}` } });
        return;
      }
      const uid = userIdFromReq(req);
      item.status = 'rejected';
      item.rejectionReason = reason;
      item.approvedAt = new Date();
      if (uid) {
        const user = await AppDataSource.getRepository(User).findOne({ where: { id: uid } });
        item.approvedBy = user ?? null;
      }
      await repo.save(item);

      if (item.leavePolicyId) {
        const year = new Date(item.startDate).getFullYear();
        const balRepo = AppDataSource.getRepository(HrLeaveBalance);
        const bal = await balRepo.findOne({
          where: {
            employeeId: item.employee.id,
            leavePolicyId: item.leavePolicyId,
            year
          }
        });
        if (bal) {
          const days = Number(item.totalDays) || 0;
          bal.pendingDays = Math.max(0, Number(bal.pendingDays) - days);
          await balRepo.save(bal);
        }
      }

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'approvedBy']
      });
      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
