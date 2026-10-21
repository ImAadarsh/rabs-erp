import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { BankAccount } from '@entities/finance/BankAccount.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';
import { BankTransaction } from '@entities/finance/BankTransaction.js';
import { zodMessage } from '@services/finance/zodMessage.js';

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const stripSeparators = (v: unknown) => (typeof v === 'string' ? v.replace(/[\s-]/g, '') : v);

const accountNumberField = z.preprocess(
  (v) => stripSeparators(blankToUndefined(v)),
  z.string().regex(/^\d{4,17}$/, 'Account number must contain digits only (4–17 digits)').optional()
);
const sortCodeField = z.preprocess(
  (v) => stripSeparators(blankToUndefined(v)),
  z.string().regex(/^\d{6}$/, 'Sort code must be exactly 6 digits (e.g. 12-34-56)').optional()
);

const ISO_CURRENCIES = new Set<string>(
  ((Intl as any).supportedValuesOf?.('currency') as string[] | undefined) ?? ['GBP', 'EUR', 'USD']
);

const currencyField = z.preprocess(
  (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v),
  z
    .string()
    .refine((c) => ISO_CURRENCIES.has(c), 'Currency must be a valid ISO 4217 code (e.g. GBP, EUR, USD)')
    .optional()
);
const routingNumberField = z.preprocess(
  (v) => stripSeparators(blankToUndefined(v)),
  z.string().regex(/^\d{6,9}$/, 'Routing number must be 6–9 digits (for UK accounts enter the 6-digit sort code)').optional()
);
const ibanField = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/\s/g, '').toUpperCase() : v),
  z
    .preprocess(blankToUndefined, z.string().optional())
    .refine((v) => v === undefined || isValidIban(v), 'IBAN is not valid (check the country code, length and check digits)')
);
const swiftField = z.preprocess(
  (v) => (typeof v === 'string' ? v.replace(/\s/g, '').toUpperCase() : v),
  z
    .preprocess(blankToUndefined, z.string().optional())
    .refine((v) => v === undefined || /^[A-Z]{6}[A-Z0-9]{2}([A-Z0-9]{3})?$/.test(v), 'SWIFT/BIC must be 8 or 11 characters (e.g. NWBKGB2L)')
);

function isValidIban(iban: string): boolean {
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const rearranged = iban.slice(4) + iban.slice(0, 4);
  let remainder = 0;
  for (const ch of rearranged) {
    const digits = /[A-Z]/.test(ch) ? String(ch.charCodeAt(0) - 55) : ch;
    for (const d of digits) remainder = (remainder * 10 + Number(d)) % 97;
  }
  return remainder === 1;
}

function refineUkAccount(
  v: { accountNumber?: string; sortCode?: string; routingNumber?: string; currency?: string },
  ctx: z.RefinementCtx
) {
  const isUk = Boolean(v.sortCode) || (v.currency ?? 'GBP').toUpperCase() === 'GBP';
  if (isUk && v.accountNumber && !/^\d{8}$/.test(v.accountNumber)) {
    ctx.addIssue({ code: 'custom', path: ['accountNumber'], message: 'UK account number must be exactly 8 digits' });
  }
  if (isUk && !v.sortCode && v.routingNumber && !/^\d{6}$/.test(v.routingNumber)) {
    ctx.addIssue({ code: 'custom', path: ['routingNumber'], message: 'For GBP accounts the routing number is the 6-digit sort code' });
  }
}

const createBankAccountSchema = z
  .object({
    organizationId: z.coerce.string(),
    businessUnitId: z.preprocess(blankToUndefined, z.string().optional()),
    accountName: z.string().trim().min(1, 'Account name is required'),
    bankName: z.string().trim().min(1, 'Bank name is required'),
    accountNumber: accountNumberField,
    sortCode: sortCodeField,
    routingNumber: routingNumberField,
    iban: ibanField,
    swiftCode: swiftField,
    currency: currencyField,
    currentBalance: z.coerce.number().default(0),
    ledgerAccountId: z.preprocess(blankToUndefined, z.string().optional()),
    isDefault: z.coerce.boolean().optional(),
    status: z.enum(['active', 'inactive', 'closed']).optional()
  })
  .superRefine(refineUkAccount);

const updateBankAccountSchema = z
  .object({
    businessUnitId: z.string().optional(),
    accountName: z.string().trim().min(1, 'Account name is required').optional(),
    bankName: z.string().trim().min(1, 'Bank name is required').optional(),
    accountNumber: accountNumberField,
    sortCode: sortCodeField,
    routingNumber: routingNumberField,
    iban: ibanField,
    swiftCode: swiftField,
    currency: currencyField,
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
        res.status(400).json({ error: { message: zodMessage(parsed.error), details: parsed.error.issues } });
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
        routingNumber: parsed.data.sortCode ?? parsed.data.routingNumber ?? null,
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
        res.status(400).json({ error: { message: zodMessage(parsed.error), details: parsed.error.issues } });
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

      const ukCheck = updateBankAccountSchema
        .pick({ accountNumber: true, sortCode: true, routingNumber: true, currency: true })
        .superRefine(refineUkAccount)
        .safeParse({ ...req.body, currency: parsed.data.currency ?? item.currency });
      if (!ukCheck.success) {
        res.status(400).json({ error: { message: zodMessage(ukCheck.error), details: ukCheck.error.issues } });
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
      if (parsed.data.sortCode !== undefined) item.routingNumber = parsed.data.sortCode ?? null;
      else if (parsed.data.routingNumber !== undefined) item.routingNumber = parsed.data.routingNumber ?? null;
      if (parsed.data.iban !== undefined) item.iban = parsed.data.iban ?? null;
      if (parsed.data.swiftCode !== undefined) item.swiftCode = parsed.data.swiftCode ?? null;
      // Blank optional fields arrive as '' from the edit form and mean "clear it".
      for (const key of ['routingNumber', 'iban', 'swiftCode'] as const) {
        if (typeof req.body?.[key] === 'string' && req.body[key].trim() === '' && !(key === 'routingNumber' && parsed.data.sortCode)) {
          item[key] = null;
        }
      }
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

      const txnCount = await AppDataSource.getRepository(BankTransaction)
        .createQueryBuilder('bt')
        .where('bt.bank_account_id = :id', { id })
        .getCount();
      if (txnCount > 0) {
        res.status(409).json({
          error: {
            message: `Cannot delete "${item.accountName}": it has ${txnCount} bank transaction(s). Delete those transactions first, or set the account status to Closed.`
          }
        });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2' || error?.errno === 1451) {
        res.status(409).json({
          error: {
            message: 'Cannot delete this bank account because it is used by payments, transfers or reconciliations. Set its status to Closed instead.'
          }
        });
        return;
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

