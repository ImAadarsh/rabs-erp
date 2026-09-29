import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { FiscalPeriod } from '@entities/finance/FiscalPeriod.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';

const createFiscalPeriodSchema = z.object({
  organizationId: z.string(),
  periodName: z.string().min(1),
  periodType: z.enum(['month', 'quarter', 'year']),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  fiscalYear: z.coerce.number().int().positive()
});

const updateFiscalPeriodSchema = z.object({
  periodName: z.string().min(1).optional(),
  periodType: z.enum(['month', 'quarter', 'year']).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  fiscalYear: z.coerce.number().int().positive().optional(),
  isClosed: z.coerce.boolean().optional()
});

export class FiscalPeriodsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(FiscalPeriod);
      const { organizationId, fiscalYear, isClosed, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('fp')
        .leftJoinAndSelect('fp.organization', 'org')
        .leftJoinAndSelect('fp.closedBy', 'closedBy')
        .orderBy('fp.startDate', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('fp.organization_id = :orgId', { orgId: organizationId });
      }

      if (fiscalYear) {
        queryBuilder.andWhere('fp.fiscal_year = :fiscalYear', { fiscalYear });
      }

      if (isClosed !== undefined) {
        queryBuilder.andWhere('fp.is_closed = :isClosed', { isClosed: isClosed === 'true' });
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
      const repo = AppDataSource.getRepository(FiscalPeriod);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'closedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Fiscal Period not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createFiscalPeriodSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(FiscalPeriod);
      
      // Check for overlapping periods
      const overlapping = await repo.findOne({
        where: { 
          organization: { id: parsed.data.organizationId }
        }
      });
      
      if (overlapping) {
        // Check date overlap logic if needed
        const startDate = new Date(parsed.data.startDate);
        const endDate = new Date(parsed.data.endDate);
        
        if (startDate >= endDate) {
          res.status(400).json({ error: { message: 'Start date must be before end date' } });
          return;
        }
      }

      const item = repo.create({
        organization: org,
        periodName: parsed.data.periodName,
        periodType: parsed.data.periodType,
        startDate: new Date(parsed.data.startDate),
        endDate: new Date(parsed.data.endDate),
        fiscalYear: parsed.data.fiscalYear,
        isClosed: false
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateFiscalPeriodSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(FiscalPeriod);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Fiscal Period not found' } });
        return;
      }

      if (item.isClosed && parsed.data.isClosed === false) {
        res.status(400).json({ error: { message: 'Cannot reopen a closed period' } });
        return;
      }

      const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
      
      if (parsed.data.isClosed === true && !item.isClosed) {
        const userRepo = AppDataSource.getRepository(User);
        const user = await userRepo.findOne({ where: { id: auth.sub } });
        item.isClosed = true;
        item.closedAt = new Date();
        item.closedBy = user ?? null;
      }

      if (parsed.data.periodName) item.periodName = parsed.data.periodName;
      if (parsed.data.periodType) item.periodType = parsed.data.periodType;
      if (parsed.data.startDate) item.startDate = new Date(parsed.data.startDate);
      if (parsed.data.endDate) item.endDate = new Date(parsed.data.endDate);
      if (parsed.data.fiscalYear) item.fiscalYear = parsed.data.fiscalYear;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'closedBy']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(FiscalPeriod);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Fiscal Period not found' } });
        return;
      }

      if (item.isClosed) {
        res.status(400).json({ error: { message: 'Cannot delete a closed period' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

