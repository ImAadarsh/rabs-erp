import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { BankAccount } from '@entities/finance/BankAccount.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';

const createBankAccountSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  accountName: z.string().min(1),
  bankName: z.string().min(1),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  iban: z.string().optional(),
  swiftCode: z.string().optional(),
  currency: z.string().length(3).optional(),
  currentBalance: z.coerce.number().default(0),
  ledgerAccountId: z.string().optional(),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive', 'closed']).optional()
});

const updateBankAccountSchema = z.object({
  businessUnitId: z.string().optional(),
  accountName: z.string().min(1).optional(),
  bankName: z.string().min(1).optional(),
  accountNumber: z.string().optional(),
  routingNumber: z.string().optional(),
  iban: z.string().optional(),
  swiftCode: z.string().optional(),
  currency: z.string().length(3).optional(),
  currentBalance: z.coerce.number().optional(),
  ledgerAccountId: z.string().optional(),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive', 'closed']).optional()
});

export class BankAccountsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(BankAccount);
      const { organizationId, businessUnitId, status, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('ba')
        .leftJoinAndSelect('ba.organization', 'org')
        .leftJoinAndSelect('ba.businessUnit', 'bu')
        .leftJoinAndSelect('ba.ledgerAccount', 'la')
        .orderBy('ba.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('ba.organization_id = :orgId', { orgId: organizationId });
      }

      if (businessUnitId) {
        queryBuilder.andWhere('ba.business_unit_id = :buId', { buId: businessUnitId });
      }

      if (status) {
        queryBuilder.andWhere('ba.status = :status', { status });
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
      const repo = AppDataSource.getRepository(BankAccount);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'businessUnit', 'ledgerAccount']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Bank Account not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createBankAccountSchema.safeParse(req.body);
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

      const repo = AppDataSource.getRepository(BankAccount);
      
      let businessUnit = null;
      if (parsed.data.businessUnitId) {
        const buRepo = AppDataSource.getRepository(BusinessUnit);
        businessUnit = await buRepo.findOne({ where: { id: parsed.data.businessUnitId } });
        if (!businessUnit) {
          res.status(400).json({ error: { message: 'Invalid businessUnitId' } });
          return;
        }
      }

      let ledgerAccount = null;
      if (parsed.data.ledgerAccountId) {
        const laRepo = AppDataSource.getRepository(LedgerAccount);
        ledgerAccount = await laRepo.findOne({ where: { id: parsed.data.ledgerAccountId } });
        if (!ledgerAccount) {
          res.status(400).json({ error: { message: 'Invalid ledgerAccountId' } });
          return;
        }
      }

      const item = repo.create({
        organization: org,
        businessUnit: businessUnit ?? undefined,
        accountName: parsed.data.accountName,
        bankName: parsed.data.bankName,
        accountNumber: parsed.data.accountNumber ?? null,
        routingNumber: parsed.data.routingNumber ?? null,
        iban: parsed.data.iban ?? null,
        swiftCode: parsed.data.swiftCode ?? null,
        currency: parsed.data.currency ?? 'GBP',
        currentBalance: parsed.data.currentBalance,
        ledgerAccount: ledgerAccount ?? undefined,
        isDefault: parsed.data.isDefault ?? false,
        status: parsed.data.status ?? 'active'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit', 'ledgerAccount']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateBankAccountSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(BankAccount);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'businessUnit', 'ledgerAccount']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Bank Account not found' } });
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

      if (parsed.data.ledgerAccountId !== undefined) {
        if (parsed.data.ledgerAccountId) {
          const laRepo = AppDataSource.getRepository(LedgerAccount);
          const ledgerAccount = await laRepo.findOne({ where: { id: parsed.data.ledgerAccountId } });
          if (!ledgerAccount) {
            res.status(400).json({ error: { message: 'Invalid ledgerAccountId' } });
            return;
          }
          item.ledgerAccount = ledgerAccount;
        } else {
          item.ledgerAccount = null;
        }
      }

      if (parsed.data.accountName) item.accountName = parsed.data.accountName;
      if (parsed.data.bankName) item.bankName = parsed.data.bankName;
      if (parsed.data.accountNumber !== undefined) item.accountNumber = parsed.data.accountNumber ?? null;
      if (parsed.data.routingNumber !== undefined) item.routingNumber = parsed.data.routingNumber ?? null;
      if (parsed.data.iban !== undefined) item.iban = parsed.data.iban ?? null;
      if (parsed.data.swiftCode !== undefined) item.swiftCode = parsed.data.swiftCode ?? null;
      if (parsed.data.currency) item.currency = parsed.data.currency;
      if (parsed.data.currentBalance !== undefined) item.currentBalance = parsed.data.currentBalance;
      if (parsed.data.isDefault !== undefined) item.isDefault = parsed.data.isDefault;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'businessUnit', 'ledgerAccount']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(BankAccount);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Bank Account not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

