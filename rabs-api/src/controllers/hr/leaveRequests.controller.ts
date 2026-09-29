import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { LeaveRequest } from '@entities/hr/LeaveRequest.js';
import { z } from 'zod';
import { Employee } from '@entities/hr/Employee.js';
import { User } from '@entities/iam/User.js';

const createLeaveRequestSchema = z.object({
  employeeId: z.string(),
  leaveType: z.enum(['vacation', 'sick', 'personal', 'maternity', 'paternity', 'bereavement', 'unpaid', 'other']),
  leavePolicyId: z.string().optional().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  totalDays: z.coerce.number(),
  reason: z.string().optional(),
  notes: z.string().optional()
});

const updateLeaveRequestSchema = z.object({
  leaveType: z.enum(['vacation', 'sick', 'personal', 'maternity', 'paternity', 'bereavement', 'unpaid', 'other']).optional(),
  leavePolicyId: z.string().optional().nullable(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  totalDays: z.coerce.number().optional(),
  reason: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected', 'cancelled']).optional(),
  rejectionReason: z.string().optional(),
  notes: z.string().optional()
});

export class LeaveRequestsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(LeaveRequest);
      const { employeeId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('lr')
        .leftJoinAndSelect('lr.employee', 'emp')
        .leftJoinAndSelect('lr.approvedBy', 'user')
        .orderBy('lr.createdAt', 'DESC');

      if (employeeId) {
        queryBuilder.andWhere('lr.employee_id = :empId', { empId: employeeId });
      }

      if (status) {
        queryBuilder.andWhere('lr.status = :status', { status });
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
      const repo = AppDataSource.getRepository(LeaveRequest);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['employee', 'approvedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Leave Request not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createLeaveRequestSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const empRepo = AppDataSource.getRepository(Employee);
      const employee = await empRepo.findOne({ where: { id: parsed.data.employeeId } });
      if (!employee) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }

      const repo = AppDataSource.getRepository(LeaveRequest);
      const item = repo.create({
        employee,
        leaveType: parsed.data.leaveType,
        leavePolicyId: parsed.data.leavePolicyId ?? null,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        totalDays: parsed.data.totalDays,
        reason: parsed.data.reason ?? null,
        status: 'pending',
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'approvedBy']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateLeaveRequestSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(LeaveRequest);
      const item = await repo.findOne({
        where: { id },
        relations: ['employee', 'approvedBy']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Leave Request not found' } });
        return;
      }

      if (parsed.data.leaveType) item.leaveType = parsed.data.leaveType;
      if (parsed.data.leavePolicyId !== undefined) item.leavePolicyId = parsed.data.leavePolicyId;
      if (parsed.data.startDate) item.startDate = new Date(parsed.data.startDate);
      if (parsed.data.endDate) item.endDate = new Date(parsed.data.endDate);
      if (parsed.data.totalDays !== undefined) item.totalDays = parsed.data.totalDays;
      if (parsed.data.reason !== undefined) item.reason = parsed.data.reason ?? null;
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.rejectionReason !== undefined) item.rejectionReason = parsed.data.rejectionReason ?? null;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'approvedBy']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(LeaveRequest);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Leave Request not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

