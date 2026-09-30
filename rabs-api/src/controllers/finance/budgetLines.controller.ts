import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { BudgetLine } from '@entities/finance/BudgetLine.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { CostCenter } from '@entities/finance/CostCenter.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';
import { FiscalPeriod } from '@entities/finance/FiscalPeriod.js';

const createBudgetLineSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  costCenterId: z.string().optional(),
  ledgerAccountId: z.string(),
  fiscalPeriodId: z.string(),
  budgetedAmount: z.coerce.number(),
  actualAmount: z.coerce.number().default(0),
  variancePercent: z.coerce.number().optional(),
  notes: z.string().optional()
});

const updateBudgetLineSchema = z.object({
  businessUnitId: z.string().optional(),
  costCenterId: z.string().optional(),
  ledgerAccountId: z.string().optional(),
  fiscalPeriodId: z.string().optional(),
  budgetedAmount: z.coerce.number().optional(),
  actualAmount: z.coerce.number().optional(),
  variancePercent: z.coerce.number().optional(),
  notes: z.string().optional()
});

export class BudgetLinesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(BudgetLine);
      const { organizationId, businessUnitId, costCenterId, ledgerAccountId, fiscalPeriodId, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('bl')
        .leftJoinAndSelect('bl.organization', 'org')
        .leftJoinAndSelect('bl.businessUnit', 'bu')
        .leftJoinAndSelect('bl.costCenter', 'cc')
        .leftJoinAndSelect('bl.ledgerAccount', 'la')
        .leftJoinAndSelect('bl.fiscalPeriod', 'fp')
        .orderBy('bl.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('bl.organization_id = :orgId', { orgId: organizationId });
      }

      if (businessUnitId) {
        queryBuilder.andWhere('bl.business_unit_id = :buId', { buId: businessUnitId });
      }

      if (costCenterId) {
        queryBuilder.andWhere('bl.cost_center_id = :costCenterId', { costCenterId });
      }

      if (ledgerAccountId) {
        queryBuilder.andWhere('bl.ledger_account_id = :ledgerAccountId', { ledgerAccountId });
      }

      if (fiscalPeriodId) {
        queryBuilder.andWhere('bl.fiscal_period_id = :fiscalPeriodId', { fiscalPeriodId });
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
      const repo = AppDataSource.getRepository(BudgetLine);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'businessUnit', 'costCenter', 'ledgerAccount', 'fiscalPeriod']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Budget Line not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createBudgetLineSchema.safeParse(req.body);
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

      const laRepo = AppDataSource.getRepository(LedgerAccount);
      const ledgerAccount = await laRepo.findOne({ where: { id: parsed.data.ledgerAccountId } });
      if (!ledgerAccount) {
        res.status(400).json({ error: { message: 'Invalid ledgerAccountId' } });
        return;
      }

      const fpRepo = AppDataSource.getRepository(FiscalPeriod);
      const fiscalPeriod = await fpRepo.findOne({ where: { id: parsed.data.fiscalPeriodId } });
      if (!fiscalPeriod) {
        res.status(400).json({ error: { message: 'Invalid fiscalPeriodId' } });
        return;
      }

      const repo = AppDataSource.getRepository(BudgetLine);
      
      // Check for duplicate budget line
      const existing = await repo.findOne({
        where: { 
          businessUnit: parsed.data.businessUnitId ? { id: parsed.data.businessUnitId } : undefined,
          costCenter: parsed.data.costCenterId ? { id: parsed.data.costCenterId } : undefined,
          ledgerAccount: { id: parsed.data.ledgerAccountId },
          fiscalPeriod: { id: parsed.data.fiscalPeriodId }
        }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Budget line already exists for this combination' } });
        return;
      }

      let businessUnit = null;
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
        if (!businessUnit) {
          res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
          return;
        }
      }

      let costCenter = null;
      if (parsed.data.costCenterId) {
        const ccRepo = AppDataSource.getRepository(CostCenter);
        costCenter = await ccRepo.findOne({ where: { id: parsed.data.costCenterId } });
        if (!costCenter) {
          res.status(400).json({ error: { message: 'Invalid costCenterId' } });
          return;
        }
      }

      const item = repo.create({
        organization: org,
        businessUnit: businessUnit ?? undefined,
        costCenter: costCenter ?? undefined,
        ledgerAccount,
        fiscalPeriod,
        budgetedAmount: parsed.data.budgetedAmount,
        actualAmount: parsed.data.actualAmount,
        variancePercent: parsed.data.variancePercent ?? null,
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit', 'costCenter', 'ledgerAccount', 'fiscalPeriod']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateBudgetLineSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(BudgetLine);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'businessUnit', 'costCenter', 'ledgerAccount', 'fiscalPeriod']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Budget Line not found' } });
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

      if (parsed.data.costCenterId !== undefined) {
        if (parsed.data.costCenterId) {
          const ccRepo = AppDataSource.getRepository(CostCenter);
          const costCenter = await ccRepo.findOne({ where: { id: parsed.data.costCenterId } });
          if (!costCenter) {
            res.status(400).json({ error: { message: 'Invalid costCenterId' } });
            return;
          }
          item.costCenter = costCenter;
        } else {
          item.costCenter = null;
        }
      }

      if (parsed.data.ledgerAccountId) {
        const laRepo = AppDataSource.getRepository(LedgerAccount);
        const ledgerAccount = await laRepo.findOne({ where: { id: parsed.data.ledgerAccountId } });
        if (!ledgerAccount) {
          res.status(400).json({ error: { message: 'Invalid ledgerAccountId' } });
          return;
        }
        item.ledgerAccount = ledgerAccount;
      }

      if (parsed.data.fiscalPeriodId) {
        const fpRepo = AppDataSource.getRepository(FiscalPeriod);
        const fiscalPeriod = await fpRepo.findOne({ where: { id: parsed.data.fiscalPeriodId } });
        if (!fiscalPeriod) {
          res.status(400).json({ error: { message: 'Invalid fiscalPeriodId' } });
          return;
        }
        item.fiscalPeriod = fiscalPeriod;
      }

      if (parsed.data.budgetedAmount !== undefined) item.budgetedAmount = parsed.data.budgetedAmount;
      if (parsed.data.actualAmount !== undefined) item.actualAmount = parsed.data.actualAmount;
      if (parsed.data.variancePercent !== undefined) item.variancePercent = parsed.data.variancePercent ?? null;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit', 'costCenter', 'ledgerAccount', 'fiscalPeriod']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(BudgetLine);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Budget Line not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

