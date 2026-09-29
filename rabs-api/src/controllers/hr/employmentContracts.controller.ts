import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { EmploymentContract } from '@entities/hr/EmploymentContract.js';
import { z } from 'zod';
import { Employee } from '@entities/hr/Employee.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { CostCenter } from '@entities/finance/CostCenter.js';

const createEmploymentContractSchema = z.object({
  employeeId: z.string(),
  businessUnitId: z.string(),
  locationId: z.string().optional(),
  costCenterId: z.string().optional(),
  jobTitle: z.string().min(1),
  department: z.string().optional(),
  reportingTo: z.string().optional(),
  contractType: z.enum(['permanent', 'fixed_term', 'contract', 'zero_hours']),
  startDate: z.string(),
  endDate: z.string().optional(),
  salaryAmount: z.coerce.number(),
  salaryCurrency: z.string().length(3).optional(),
  salaryPeriod: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'annual']).optional(),
  workingHoursPerWeek: z.coerce.number().optional(),
  probationPeriodDays: z.coerce.number().optional(),
  noticePeriodDays: z.coerce.number().optional(),
  contractDocumentUrl: z.string().optional(),
  isCurrent: z.coerce.boolean().optional(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).optional()
});

const updateEmploymentContractSchema = z.object({
  businessUnitId: z.string().optional(),
  locationId: z.string().optional(),
  costCenterId: z.string().optional(),
  jobTitle: z.string().min(1).optional(),
  department: z.string().optional(),
  reportingTo: z.string().optional(),
  contractType: z.enum(['permanent', 'fixed_term', 'contract', 'zero_hours']).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  salaryAmount: z.coerce.number().optional(),
  salaryCurrency: z.string().length(3).optional(),
  salaryPeriod: z.enum(['hourly', 'daily', 'weekly', 'monthly', 'annual']).optional(),
  workingHoursPerWeek: z.coerce.number().optional(),
  probationPeriodDays: z.coerce.number().optional(),
  noticePeriodDays: z.coerce.number().optional(),
  contractDocumentUrl: z.string().optional(),
  isCurrent: z.coerce.boolean().optional(),
  status: z.enum(['draft', 'active', 'expired', 'terminated']).optional()
});

export class EmploymentContractsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(EmploymentContract);
      const { employeeId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('ec')
        .leftJoinAndSelect('ec.employee', 'emp')
        .leftJoinAndSelect('ec.businessUnit', 'bu')
        .leftJoinAndSelect('ec.location', 'loc')
        .leftJoinAndSelect('ec.costCenter', 'cc')
        .leftJoinAndSelect('ec.reportingTo', 'rt')
        .orderBy('ec.createdAt', 'DESC');

      if (employeeId) {
        queryBuilder.andWhere('ec.employee_id = :empId', { empId: employeeId });
      }

      if (status) {
        queryBuilder.andWhere('ec.status = :status', { status });
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
      const repo = AppDataSource.getRepository(EmploymentContract);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['employee', 'businessUnit', 'location', 'costCenter', 'reportingTo']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Employment Contract not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createEmploymentContractSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(EmploymentContract);
      let location = null;
      let costCenter = null;
      let reportingTo = null;
      
      if (parsed.data.locationId) {
        const locRepo = AppDataSource.getRepository(Location);
        location = await locRepo.findOne({ where: { id: parsed.data.locationId } });
      }

      if (parsed.data.costCenterId) {
        const ccRepo = AppDataSource.getRepository(CostCenter);
        costCenter = await ccRepo.findOne({ where: { id: parsed.data.costCenterId } });
      }

      if (parsed.data.reportingTo) {
        reportingTo = await empRepo.findOne({ where: { id: parsed.data.reportingTo } });
      }

      const item = repo.create({
        employee,
        businessUnit,
        location: location ?? undefined,
        costCenter: costCenter ?? undefined,
        reportingTo: reportingTo ?? undefined,
        jobTitle: parsed.data.jobTitle,
        department: parsed.data.department ?? null,
        contractType: parsed.data.contractType,
        startDate: new Date(parsed.data.startDate),
        endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
        salaryAmount: parsed.data.salaryAmount,
        salaryCurrency: parsed.data.salaryCurrency ?? 'GBP',
        salaryPeriod: parsed.data.salaryPeriod ?? 'annual',
        workingHoursPerWeek: parsed.data.workingHoursPerWeek ?? null,
        probationPeriodDays: parsed.data.probationPeriodDays ?? null,
        noticePeriodDays: parsed.data.noticePeriodDays ?? null,
        contractDocumentUrl: parsed.data.contractDocumentUrl ?? null,
        isCurrent: parsed.data.isCurrent ?? true,
        status: parsed.data.status ?? 'draft'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'businessUnit', 'location', 'costCenter', 'reportingTo']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateEmploymentContractSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(EmploymentContract);
      const item = await repo.findOne({
        where: { id },
        relations: ['employee', 'businessUnit', 'location', 'costCenter', 'reportingTo']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Employment Contract not found' } });
        return;
      }

      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        const businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
        if (businessUnit) item.businessUnit = businessUnit;
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

      if (parsed.data.costCenterId !== undefined) {
        if (parsed.data.costCenterId) {
          const ccRepo = AppDataSource.getRepository(CostCenter);
          const costCenter = await ccRepo.findOne({ where: { id: parsed.data.costCenterId } });
          item.costCenter = costCenter ?? null;
        } else {
          item.costCenter = null;
        }
      }

      if (parsed.data.reportingTo !== undefined) {
        if (parsed.data.reportingTo) {
          const empRepo = AppDataSource.getRepository(Employee);
          const reportingTo = await empRepo.findOne({ where: { id: parsed.data.reportingTo } });
          item.reportingTo = reportingTo ?? null;
        } else {
          item.reportingTo = null;
        }
      }

      if (parsed.data.jobTitle) item.jobTitle = parsed.data.jobTitle;
      if (parsed.data.department !== undefined) item.department = parsed.data.department ?? null;
      if (parsed.data.contractType) item.contractType = parsed.data.contractType;
      if (parsed.data.startDate) item.startDate = new Date(parsed.data.startDate);
      if (parsed.data.endDate !== undefined) item.endDate = parsed.data.endDate ? new Date(parsed.data.endDate) : null;
      if (parsed.data.salaryAmount !== undefined) item.salaryAmount = parsed.data.salaryAmount;
      if (parsed.data.salaryCurrency) item.salaryCurrency = parsed.data.salaryCurrency;
      if (parsed.data.salaryPeriod) item.salaryPeriod = parsed.data.salaryPeriod;
      if (parsed.data.workingHoursPerWeek !== undefined) item.workingHoursPerWeek = parsed.data.workingHoursPerWeek ?? null;
      if (parsed.data.probationPeriodDays !== undefined) item.probationPeriodDays = parsed.data.probationPeriodDays ?? null;
      if (parsed.data.noticePeriodDays !== undefined) item.noticePeriodDays = parsed.data.noticePeriodDays ?? null;
      if (parsed.data.contractDocumentUrl !== undefined) item.contractDocumentUrl = parsed.data.contractDocumentUrl ?? null;
      if (parsed.data.isCurrent !== undefined) item.isCurrent = parsed.data.isCurrent;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['employee', 'businessUnit', 'location', 'costCenter', 'reportingTo']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(EmploymentContract);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Employment Contract not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

