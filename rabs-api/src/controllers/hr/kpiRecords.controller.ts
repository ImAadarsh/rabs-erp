import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { KpiRecord } from '@entities/hr/KpiRecord.js';
import { z } from 'zod';
import { KpiDefinition } from '@entities/hr/KpiDefinition.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { Employee } from '@entities/hr/Employee.js';

const createKpiRecordSchema = z.object({
  kpiDefinitionId: z.string(),
  businessUnitId: z.string().optional(),
  locationId: z.string().optional(),
  employeeId: z.string().optional(),
  periodType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']),
  periodStart: z.string(),
  periodEnd: z.string(),
  actualValue: z.coerce.number(),
  targetValue: z.coerce.number().optional(),
  variancePercent: z.coerce.number().optional(),
  notes: z.string().optional()
});

const updateKpiRecordSchema = z.object({
  businessUnitId: z.string().optional(),
  locationId: z.string().optional(),
  employeeId: z.string().optional(),
  periodType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'yearly']).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  actualValue: z.coerce.number().optional(),
  targetValue: z.coerce.number().optional(),
  variancePercent: z.coerce.number().optional(),
  notes: z.string().optional()
});

export class KpiRecordsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(KpiRecord);
      const { kpiDefinitionId, employeeId, businessUnitId, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('kr')
        .leftJoinAndSelect('kr.kpiDefinition', 'kd')
        .leftJoinAndSelect('kr.businessUnit', 'bu')
        .leftJoinAndSelect('kr.location', 'loc')
        .leftJoinAndSelect('kr.employee', 'emp')
        .orderBy('kr.createdAt', 'DESC');

      if (kpiDefinitionId) {
        queryBuilder.andWhere('kr.kpi_definition_id = :kpiDefId', { kpiDefId: kpiDefinitionId });
      }

      if (employeeId) {
        queryBuilder.andWhere('kr.employee_id = :empId', { empId: employeeId });
      }

      if (businessUnitId) {
        queryBuilder.andWhere('kr.business_unit_id = :buId', { buId: businessUnitId });
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
      const repo = AppDataSource.getRepository(KpiRecord);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['kpiDefinition', 'businessUnit', 'location', 'employee']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'KPI Record not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createKpiRecordSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const kpiDefRepo = AppDataSource.getRepository(KpiDefinition);
      const kpiDefinition = await kpiDefRepo.findOne({ where: { id: parsed.data.kpiDefinitionId } });
      if (!kpiDefinition) {
        res.status(400).json({ error: { message: 'Invalid kpiDefinitionId' } });
        return;
      }

      const repo = AppDataSource.getRepository(KpiRecord);
      let businessUnit = null;
      let location = null;
      let employee = null;
      
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
      }

      if (parsed.data.locationId) {
        const locRepo = AppDataSource.getRepository(Location);
        location = await locRepo.findOne({ where: { id: parsed.data.locationId } });
      }

      if (parsed.data.employeeId) {
        const empRepo = AppDataSource.getRepository(Employee);
        employee = await empRepo.findOne({ where: { id: parsed.data.employeeId } });
      }

      const item = repo.create({
        kpiDefinition,
        businessUnit: businessUnit ?? undefined,
        location: location ?? undefined,
        employee: employee ?? undefined,
        periodType: parsed.data.periodType,
        periodStart: new Date(parsed.data.periodStart),
        periodEnd: new Date(parsed.data.periodEnd),
        actualValue: parsed.data.actualValue,
        targetValue: parsed.data.targetValue ?? null,
        variancePercent: parsed.data.variancePercent ?? null,
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['kpiDefinition', 'businessUnit', 'location', 'employee']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateKpiRecordSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(KpiRecord);
      const item = await repo.findOne({
        where: { id },
        relations: ['kpiDefinition', 'businessUnit', 'location', 'employee']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'KPI Record not found' } });
        return;
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

      if (parsed.data.employeeId !== undefined) {
        if (parsed.data.employeeId) {
          const empRepo = AppDataSource.getRepository(Employee);
          const employee = await empRepo.findOne({ where: { id: parsed.data.employeeId } });
          item.employee = employee ?? null;
        } else {
          item.employee = null;
        }
      }

      if (parsed.data.periodType) item.periodType = parsed.data.periodType;
      if (parsed.data.periodStart) item.periodStart = new Date(parsed.data.periodStart);
      if (parsed.data.periodEnd) item.periodEnd = new Date(parsed.data.periodEnd);
      if (parsed.data.actualValue !== undefined) item.actualValue = parsed.data.actualValue;
      if (parsed.data.targetValue !== undefined) item.targetValue = parsed.data.targetValue ?? null;
      if (parsed.data.variancePercent !== undefined) item.variancePercent = parsed.data.variancePercent ?? null;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['kpiDefinition', 'businessUnit', 'location', 'employee']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(KpiRecord);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'KPI Record not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

