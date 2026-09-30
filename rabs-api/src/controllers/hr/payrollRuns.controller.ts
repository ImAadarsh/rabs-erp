import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PayrollRun } from '@entities/hr/PayrollRun.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { User } from '@entities/iam/User.js';

const createPayrollRunSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  payrollNumber: z.string().min(1),
  periodStart: z.string(),
  periodEnd: z.string(),
  paymentDate: z.string(),
  currency: z.string().length(3).optional(),
  status: z.enum(['draft', 'calculated', 'approved', 'paid', 'posted']).optional()
});

const updatePayrollRunSchema = z.object({
  businessUnitId: z.string().optional(),
  payrollNumber: z.string().min(1).optional(),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
  paymentDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(['draft', 'calculated', 'approved', 'paid', 'posted']).optional()
});

export class PayrollRunsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PayrollRun);
      const { organizationId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('pr')
        .leftJoinAndSelect('pr.organization', 'org')
        .leftJoinAndSelect('pr.businessUnit', 'bu')
        .leftJoinAndSelect('pr.approvedBy', 'user')
        .leftJoinAndSelect('pr.createdBy', 'creator')
        .orderBy('pr.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('pr.organization_id = :orgId', { orgId: organizationId });
      }

      if (status) {
        queryBuilder.andWhere('pr.status = :status', { status });
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
      const repo = AppDataSource.getRepository(PayrollRun);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'businessUnit', 'approvedBy', 'createdBy', 'payrollLines', 'payrollLines.employee']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Payroll Run not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createPayrollRunSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(PayrollRun);
      let businessUnit = null;
      
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
      }

      const item = repo.create({
        organization: org,
        businessUnit: businessUnit ?? undefined,
        payrollNumber: parsed.data.payrollNumber,
        periodStart: new Date(parsed.data.periodStart),
        periodEnd: new Date(parsed.data.periodEnd),
        paymentDate: new Date(parsed.data.paymentDate),
        currency: parsed.data.currency ?? 'GBP',
        status: parsed.data.status ?? 'draft'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updatePayrollRunSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(PayrollRun);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'businessUnit']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Payroll Run not found' } });
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

      if (parsed.data.payrollNumber) item.payrollNumber = parsed.data.payrollNumber;
      if (parsed.data.periodStart) item.periodStart = new Date(parsed.data.periodStart);
      if (parsed.data.periodEnd) item.periodEnd = new Date(parsed.data.periodEnd);
      if (parsed.data.paymentDate) item.paymentDate = new Date(parsed.data.paymentDate);
      if (parsed.data.currency) item.currency = parsed.data.currency;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(PayrollRun);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Payroll Run not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

