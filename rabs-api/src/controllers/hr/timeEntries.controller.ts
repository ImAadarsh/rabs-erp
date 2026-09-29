import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { TimeEntry } from '@entities/hr/TimeEntry.js';
import { z } from 'zod';
import { Employee } from '@entities/hr/Employee.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { User } from '@entities/iam/User.js';

const createTimeEntrySchema = z.object({
  employeeId: z.string(),
  businessUnitId: z.string(),
  locationId: z.string().optional(),
  entryDate: z.string(),
  clockInTime: z.string(),
  clockOutTime: z.string().optional(),
  totalHours: z.coerce.number().optional(),
  breakMinutes: z.coerce.number().optional(),
  overtimeHours: z.coerce.number().optional(),
  entryType: z.enum(['regular', 'overtime', 'holiday', 'sick', 'unpaid']).optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional()
});

const updateTimeEntrySchema = z.object({
  locationId: z.string().optional(),
  entryDate: z.string().optional(),
  clockInTime: z.string().optional(),
  clockOutTime: z.string().optional(),
  totalHours: z.coerce.number().optional(),
  breakMinutes: z.coerce.number().optional(),
  overtimeHours: z.coerce.number().optional(),
  entryType: z.enum(['regular', 'overtime', 'holiday', 'sick', 'unpaid']).optional(),
  notes: z.string().optional(),
  status: z.enum(['pending', 'approved', 'rejected']).optional()
});

export class TimeEntriesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(TimeEntry);
      const { employeeId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('te')
        .leftJoinAndSelect('te.employee', 'emp')
        .leftJoinAndSelect('te.businessUnit', 'bu')
        .leftJoinAndSelect('te.location', 'loc')
        .leftJoinAndSelect('te.approvedBy', 'user')
        .orderBy('te.entryDate', 'DESC');

      if (employeeId) {
        queryBuilder.andWhere('te.employee_id = :empId', { empId: employeeId });
      }

      if (status) {
        queryBuilder.andWhere('te.status = :status', { status });
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
      const repo = AppDataSource.getRepository(TimeEntry);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['employee', 'businessUnit', 'location', 'approvedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Time Entry not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createTimeEntrySchema.safeParse(req.body);
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

      const buRepo = AppDataSource.getRepository(BusinessUnit);
      const businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
      if (!businessUnit) {
        res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
        return;
      }

      const repo = AppDataSource.getRepository(TimeEntry);
      let location = null;
      
      if (parsed.data.locationId) {
        const locRepo = AppDataSource.getRepository(Location);
        location = await locRepo.findOne({ where: { id: parsed.data.locationId } });
      }

      const item = repo.create({
        employee,
        businessUnit,
        location: location ?? undefined,
        entryDate: new Date(parsed.data.entryDate),
        clockInTime: new Date(parsed.data.clockInTime),
        clockOutTime: parsed.data.clockOutTime ? new Date(parsed.data.clockOutTime) : null,
        totalHours: parsed.data.totalHours ?? null,
        breakMinutes: parsed.data.breakMinutes ?? 0,
        overtimeHours: parsed.data.overtimeHours ?? 0.00,
        entryType: parsed.data.entryType ?? 'regular',
        notes: parsed.data.notes ?? null,
        status: parsed.data.status ?? 'pending'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'businessUnit', 'location', 'approvedBy']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateTimeEntrySchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(TimeEntry);
      const item = await repo.findOne({
        where: { id },
        relations: ['employee', 'businessUnit', 'location', 'approvedBy']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Time Entry not found' } });
        return;
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

      if (parsed.data.entryDate) item.entryDate = new Date(parsed.data.entryDate);
      if (parsed.data.clockInTime) item.clockInTime = new Date(parsed.data.clockInTime);
      if (parsed.data.clockOutTime !== undefined) item.clockOutTime = parsed.data.clockOutTime ? new Date(parsed.data.clockOutTime) : null;
      if (parsed.data.totalHours !== undefined) item.totalHours = parsed.data.totalHours ?? null;
      if (parsed.data.breakMinutes !== undefined) item.breakMinutes = parsed.data.breakMinutes ?? 0;
      if (parsed.data.overtimeHours !== undefined) item.overtimeHours = parsed.data.overtimeHours ?? 0.00;
      if (parsed.data.entryType) item.entryType = parsed.data.entryType;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'businessUnit', 'location', 'approvedBy']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(TimeEntry);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Time Entry not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

