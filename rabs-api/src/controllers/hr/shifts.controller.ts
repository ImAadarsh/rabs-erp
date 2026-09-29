import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Shift } from '@entities/hr/Shift.js';
import { z } from 'zod';
import { Employee } from '@entities/hr/Employee.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { User } from '@entities/iam/User.js';

const createShiftSchema = z.object({
  employeeId: z.string(),
  businessUnitId: z.string(),
  locationId: z.string().optional(),
  shiftDate: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  breakMinutes: z.coerce.number().optional(),
  shiftType: z.enum(['regular', 'opening', 'closing', 'split', 'on_call']).optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional()
});

const updateShiftSchema = z.object({
  locationId: z.string().optional(),
  shiftDate: z.string().optional(),
  startTime: z.string().optional(),
  endTime: z.string().optional(),
  breakMinutes: z.coerce.number().optional(),
  shiftType: z.enum(['regular', 'opening', 'closing', 'split', 'on_call']).optional(),
  notes: z.string().optional(),
  status: z.enum(['scheduled', 'confirmed', 'completed', 'cancelled', 'no_show']).optional()
});

export class ShiftsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Shift);
      const { employeeId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('s')
        .leftJoinAndSelect('s.employee', 'emp')
        .leftJoinAndSelect('s.businessUnit', 'bu')
        .leftJoinAndSelect('s.location', 'loc')
        .leftJoinAndSelect('s.createdBy', 'user')
        .orderBy('s.shiftDate', 'DESC');

      if (employeeId) {
        queryBuilder.andWhere('s.employee_id = :empId', { empId: employeeId });
      }

      if (status) {
        queryBuilder.andWhere('s.status = :status', { status });
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
      const repo = AppDataSource.getRepository(Shift);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['employee', 'businessUnit', 'location', 'createdBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Shift not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createShiftSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(Shift);
      let location = null;
      
      if (parsed.data.locationId) {
        const locRepo = AppDataSource.getRepository(Location);
        location = await locRepo.findOne({ where: { id: parsed.data.locationId } });
      }

      const item = repo.create({
        employee,
        businessUnit,
        location: location ?? undefined,
        shiftDate: new Date(parsed.data.shiftDate),
        startTime: parsed.data.startTime,
        endTime: parsed.data.endTime,
        breakMinutes: parsed.data.breakMinutes ?? 0,
        shiftType: parsed.data.shiftType ?? 'regular',
        notes: parsed.data.notes ?? null,
        status: parsed.data.status ?? 'scheduled'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'businessUnit', 'location', 'createdBy']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateShiftSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Shift);
      const item = await repo.findOne({
        where: { id },
        relations: ['employee', 'businessUnit', 'location', 'createdBy']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Shift not found' } });
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

      if (parsed.data.shiftDate) item.shiftDate = new Date(parsed.data.shiftDate);
      if (parsed.data.startTime) item.startTime = parsed.data.startTime;
      if (parsed.data.endTime) item.endTime = parsed.data.endTime;
      if (parsed.data.breakMinutes !== undefined) item.breakMinutes = parsed.data.breakMinutes ?? 0;
      if (parsed.data.shiftType) item.shiftType = parsed.data.shiftType;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'businessUnit', 'location', 'createdBy']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Shift);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Shift not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

