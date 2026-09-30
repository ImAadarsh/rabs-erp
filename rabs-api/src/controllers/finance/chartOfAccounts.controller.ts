import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { ChartOfAccounts } from '@entities/finance/ChartOfAccounts.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';

const createChartOfAccountsSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  name: z.string().min(1),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

const updateChartOfAccountsSchema = z.object({
  businessUnitId: z.string().optional(),
  name: z.string().min(1).optional(),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export class ChartOfAccountsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(ChartOfAccounts);
      const { organizationId, businessUnitId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('coa')
        .leftJoinAndSelect('coa.organization', 'org')
        .leftJoinAndSelect('coa.businessUnit', 'bu')
        .orderBy('coa.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('coa.organization_id = :orgId', { orgId: organizationId });
      }

      if (businessUnitId) {
        queryBuilder.andWhere('coa.business_unit_id = :buId', { buId: businessUnitId });
      }

      if (status) {
        queryBuilder.andWhere('coa.status = :status', { status });
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
      const repo = AppDataSource.getRepository(ChartOfAccounts);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'businessUnit', 'ledgerAccounts']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Chart of Accounts not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createChartOfAccountsSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(ChartOfAccounts);
      let businessUnit = null;
      
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
        if (!businessUnit) {
          res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
          return;
        }
      }

      const item = repo.create({
        organization: org,
        businessUnit: businessUnit ?? undefined,
        name: parsed.data.name,
        isDefault: parsed.data.isDefault ?? false,
        status: parsed.data.status ?? 'active'
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
      const parsed = updateChartOfAccountsSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(ChartOfAccounts);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'businessUnit']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Chart of Accounts not found' } });
        return;
      }

      if (parsed.data.businessUnitId !== undefined) {
        if (parsed.data.businessUnitId) {
          const buRepo = AppDataSource.getRepository(BusinessUnit);
          const businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
          if (!businessUnit) {
            res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
            return;
          }
          item.businessUnit = businessUnit;
        } else {
          item.businessUnit = null;
        }
      }

      if (parsed.data.name) item.name = parsed.data.name;
      if (parsed.data.isDefault !== undefined) item.isDefault = parsed.data.isDefault;
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
      const repo = AppDataSource.getRepository(ChartOfAccounts);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Chart of Accounts not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

