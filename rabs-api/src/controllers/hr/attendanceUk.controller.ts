import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { HrAttendance } from '@entities/hr/HrAttendance.js';
import { HrOvertime } from '@entities/hr/HrOvertime.js';
import { HrSickEpisode } from '@entities/hr/HrSickEpisode.js';
import { HrPension } from '@entities/hr/HrPension.js';
import { userIdFromReq } from '@services/hr/hrScope.js';
import { getPayrollRates } from '@services/hr/payrollCalc.service.js';
import { IsNull } from 'typeorm';

const attendanceSchema = z.object({
  employeeId: z.string(),
  workDate: z.string(),
  status: z.enum(['present', 'absent', 'late', 'half_day', 'holiday', 'sick', 'remote']).optional(),
  clockIn: z.string().optional().nullable(),
  clockOut: z.string().optional().nullable(),
  hoursWorked: z.coerce.number().optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

const overtimeSchema = z.object({
  employeeId: z.string(),
  workDate: z.string(),
  hours: z.coerce.number().positive(),
  rateMultiplier: z.coerce.number().optional(),
  reason: z.string().max(500).optional().nullable(),
  status: z.enum(['pending', 'approved', 'rejected', 'paid']).optional()
});

const sickSchema = z.object({
  employeeId: z.string(),
  startDate: z.string(),
  endDate: z.string().optional().nullable(),
  waitingDays: z.coerce.number().optional(),
  qualifyingDays: z.coerce.number().optional(),
  sspDaysPaid: z.coerce.number().optional(),
  sspRate: z.coerce.number().optional().nullable(),
  sspTotal: z.coerce.number().optional(),
  linkedToPrevious: z.boolean().optional(),
  fitNoteReceived: z.boolean().optional(),
  fitNoteS3Key: z.string().optional().nullable(),
  status: z.enum(['open', 'closed', 'cancelled']).optional(),
  notes: z.string().optional().nullable()
});

const pensionSchema = z.object({
  employeeId: z.string(),
  eligible: z.boolean().optional(),
  enrolled: z.boolean().optional(),
  schemeName: z.string().max(255).optional().nullable(),
  contributionPct: z.coerce.number().optional().nullable(),
  employerContributionPct: z.coerce.number().optional().nullable(),
  deferralDate: z.string().optional().nullable(),
  enrolmentDate: z.string().optional().nullable(),
  optOutDate: z.string().optional().nullable(),
  notes: z.string().max(500).optional().nullable()
});

async function requireEmployee(id: string): Promise<Employee | null> {
  return AppDataSource.getRepository(Employee).findOne({ where: { id, deletedAt: IsNull() } });
}

export class AttendanceController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, from, to, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrAttendance)
        .createQueryBuilder('a')
        .leftJoinAndSelect('a.employee', 'emp')
        .orderBy('a.workDate', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('a.employee_id = :employeeId', { employeeId });
      if (from) qb.andWhere('a.work_date >= :from', { from });
      if (to) qb.andWhere('a.work_date <= :to', { to });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async upsert(req: Request, res: Response): Promise<void> {
    try {
      const parsed = attendanceSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      if (!(await requireEmployee(parsed.data.employeeId))) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrAttendance);
      let item = await repo.findOne({
        where: { employeeId: parsed.data.employeeId, workDate: parsed.data.workDate }
      });
      const d = parsed.data;
      if (!item) {
        item = repo.create({
          employeeId: d.employeeId,
          workDate: d.workDate,
          status: d.status ?? 'present',
          clockIn: d.clockIn ?? null,
          clockOut: d.clockOut ?? null,
          hoursWorked: d.hoursWorked ?? null,
          notes: d.notes ?? null,
          recordedById: userIdFromReq(req) ?? null
        });
      } else {
        if (d.status) item.status = d.status;
        if (d.clockIn !== undefined) item.clockIn = d.clockIn;
        if (d.clockOut !== undefined) item.clockOut = d.clockOut;
        if (d.hoursWorked !== undefined) item.hoursWorked = d.hoursWorked;
        if (d.notes !== undefined) item.notes = d.notes;
        item.recordedById = userIdFromReq(req) ?? item.recordedById;
      }
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrAttendance);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Attendance not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class OvertimeController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, status, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrOvertime)
        .createQueryBuilder('o')
        .leftJoinAndSelect('o.employee', 'emp')
        .orderBy('o.workDate', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('o.employee_id = :employeeId', { employeeId });
      if (status) qb.andWhere('o.status = :status', { status });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = overtimeSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      if (!(await requireEmployee(parsed.data.employeeId))) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrOvertime);
      const item = await repo.save(
        repo.create({
          employeeId: parsed.data.employeeId,
          workDate: parsed.data.workDate,
          hours: parsed.data.hours,
          rateMultiplier: parsed.data.rateMultiplier ?? 1.5,
          reason: parsed.data.reason ?? null,
          status: parsed.data.status ?? 'pending'
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = overtimeSchema.partial().omit({ employeeId: true }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrOvertime);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Overtime not found' } });
        return;
      }
      const d = parsed.data;
      if (d.workDate) item.workDate = d.workDate;
      if (d.hours !== undefined) item.hours = d.hours;
      if (d.rateMultiplier !== undefined) item.rateMultiplier = d.rateMultiplier;
      if (d.reason !== undefined) item.reason = d.reason;
      if (d.status) {
        item.status = d.status;
        if (d.status === 'approved' || d.status === 'rejected') {
          item.approvedById = userIdFromReq(req) ?? null;
          item.approvedAt = new Date();
        }
      }
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrOvertime);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Overtime not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class SickEpisodesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, status, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrSickEpisode)
        .createQueryBuilder('s')
        .leftJoinAndSelect('s.employee', 'emp')
        .orderBy('s.startDate', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('s.employee_id = :employeeId', { employeeId });
      if (status) qb.andWhere('s.status = :status', { status });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = sickSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      if (!(await requireEmployee(parsed.data.employeeId))) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const rates = getPayrollRates();
      const repo = AppDataSource.getRepository(HrSickEpisode);
      const d = parsed.data;
      const sspDays = d.sspDaysPaid ?? 0;
      const sspRate = d.sspRate ?? rates.sspWeeklyRate / 7;
      const item = await repo.save(
        repo.create({
          employeeId: d.employeeId,
          startDate: d.startDate,
          endDate: d.endDate ?? null,
          waitingDays: d.waitingDays ?? 3,
          qualifyingDays: d.qualifyingDays ?? 0,
          sspDaysPaid: sspDays,
          sspRate,
          sspTotal: d.sspTotal ?? Math.round(sspDays * sspRate * 100) / 100,
          linkedToPrevious: d.linkedToPrevious ?? false,
          fitNoteReceived: d.fitNoteReceived ?? false,
          fitNoteS3Key: d.fitNoteS3Key ?? null,
          status: d.status ?? 'open',
          notes: d.notes ?? null
        })
      );
      res.status(201).json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = sickSchema.partial().omit({ employeeId: true }).safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const repo = AppDataSource.getRepository(HrSickEpisode);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Sick episode not found' } });
        return;
      }
      const d = parsed.data;
      if (d.startDate) item.startDate = d.startDate;
      if (d.endDate !== undefined) item.endDate = d.endDate;
      if (d.waitingDays !== undefined) item.waitingDays = d.waitingDays;
      if (d.qualifyingDays !== undefined) item.qualifyingDays = d.qualifyingDays;
      if (d.sspDaysPaid !== undefined) item.sspDaysPaid = d.sspDaysPaid;
      if (d.sspRate !== undefined) item.sspRate = d.sspRate;
      if (d.sspTotal !== undefined) item.sspTotal = d.sspTotal;
      if (d.linkedToPrevious !== undefined) item.linkedToPrevious = d.linkedToPrevious;
      if (d.fitNoteReceived !== undefined) item.fitNoteReceived = d.fitNoteReceived;
      if (d.fitNoteS3Key !== undefined) item.fitNoteS3Key = d.fitNoteS3Key;
      if (d.status) item.status = d.status;
      if (d.notes !== undefined) item.notes = d.notes;
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(HrSickEpisode);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Sick episode not found' } });
        return;
      }
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

export class PensionController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const { employeeId, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;
      const qb = AppDataSource.getRepository(HrPension)
        .createQueryBuilder('p')
        .leftJoinAndSelect('p.employee', 'emp')
        .orderBy('p.updatedAt', 'DESC')
        .take(take)
        .skip(skip);
      if (employeeId) qb.andWhere('p.employee_id = :employeeId', { employeeId });
      const [items, total] = await qb.getManyAndCount();
      res.json({ data: items, meta: { total, page: Number(page) || 1, limit: take } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async upsert(req: Request, res: Response): Promise<void> {
    try {
      const parsed = pensionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      if (!(await requireEmployee(parsed.data.employeeId))) {
        res.status(400).json({ error: { message: 'Invalid employeeId' } });
        return;
      }
      const repo = AppDataSource.getRepository(HrPension);
      let item = await repo.findOne({ where: { employeeId: parsed.data.employeeId } });
      const d = parsed.data;
      if (!item) {
        item = repo.create({
          employeeId: d.employeeId,
          eligible: d.eligible ?? true,
          enrolled: d.enrolled ?? false,
          schemeName: d.schemeName ?? null,
          contributionPct: d.contributionPct ?? null,
          employerContributionPct: d.employerContributionPct ?? null,
          deferralDate: d.deferralDate ?? null,
          enrolmentDate: d.enrolmentDate ?? null,
          optOutDate: d.optOutDate ?? null,
          notes: d.notes ?? null
        });
      } else {
        if (d.eligible !== undefined) item.eligible = d.eligible;
        if (d.enrolled !== undefined) item.enrolled = d.enrolled;
        if (d.schemeName !== undefined) item.schemeName = d.schemeName;
        if (d.contributionPct !== undefined) item.contributionPct = d.contributionPct;
        if (d.employerContributionPct !== undefined) {
          item.employerContributionPct = d.employerContributionPct;
        }
        if (d.deferralDate !== undefined) item.deferralDate = d.deferralDate;
        if (d.enrolmentDate !== undefined) item.enrolmentDate = d.enrolmentDate;
        if (d.optOutDate !== undefined) item.optOutDate = d.optOutDate;
        if (d.notes !== undefined) item.notes = d.notes;
      }
      await repo.save(item);
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
