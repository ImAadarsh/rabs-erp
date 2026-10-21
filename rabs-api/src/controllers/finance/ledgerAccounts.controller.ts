import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';
import { z } from 'zod';
import { ChartOfAccounts } from '@entities/finance/ChartOfAccounts.js';
import { zodMessage } from '@services/finance/zodMessage.js';

export const LEDGER_ACCOUNT_TYPES = [
  { value: 'asset', label: 'Asset', normalBalance: 'debit' },
  { value: 'liability', label: 'Liability', normalBalance: 'credit' },
  { value: 'equity', label: 'Equity', normalBalance: 'credit' },
  { value: 'revenue', label: 'Revenue', normalBalance: 'credit' },
  { value: 'expense', label: 'Expense', normalBalance: 'debit' },
  { value: 'cost_of_goods_sold', label: 'Cost of Goods Sold', normalBalance: 'debit' }
] as const;

/** Standard UK subtypes per account type (values match seedAccounting). Custom values already in use are appended. */
export const LEDGER_ACCOUNT_SUBTYPES: Record<string, Array<{ value: string; label: string }>> = {
  asset: [
    { value: 'bank', label: 'Bank' },
    { value: 'cash', label: 'Cash' },
    { value: 'receivable', label: 'Trade debtors (receivable)' },
    { value: 'current_asset', label: 'Current asset' },
    { value: 'inventory', label: 'Stock / inventory' },
    { value: 'prepayment', label: 'Prepayment' },
    { value: 'vat', label: 'VAT recoverable' },
    { value: 'fixed_asset', label: 'Fixed asset' },
    { value: 'contra_asset', label: 'Accumulated depreciation (contra asset)' }
  ],
  liability: [
    { value: 'payable', label: 'Trade creditors (payable)' },
    { value: 'current_liability', label: 'Current liability' },
    { value: 'vat', label: 'VAT payable' },
    { value: 'payroll', label: 'Payroll control' },
    { value: 'accrual', label: 'Accrual' },
    { value: 'loan', label: 'Loan' },
    { value: 'long_term_liability', label: 'Long-term liability' }
  ],
  equity: [
    { value: 'capital', label: 'Share capital' },
    { value: 'retained', label: 'Retained earnings' },
    { value: 'drawings', label: 'Drawings' }
  ],
  revenue: [
    { value: 'sales', label: 'Sales' },
    { value: 'other', label: 'Other income' }
  ],
  expense: [
    { value: 'overhead', label: 'Overhead' },
    { value: 'payroll', label: 'Payroll' },
    { value: 'depreciation', label: 'Depreciation' },
    { value: 'bank', label: 'Bank charges' },
    { value: 'other', label: 'Other expense' }
  ],
  cost_of_goods_sold: [{ value: 'cogs', label: 'Cost of sales' }]
};

const humanizeSubtype = (v: string) => v.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

/** Blank → null so clearing the field in the UI really clears it. */
const subtypeField = z
  .string()
  .max(100)
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? undefined : v?.trim() || null));

const ACCOUNT_TYPE_VALUES = LEDGER_ACCOUNT_TYPES.map((t) => t.value) as [
  (typeof LEDGER_ACCOUNT_TYPES)[number]['value'],
  ...(typeof LEDGER_ACCOUNT_TYPES)[number]['value'][]
];
const accountTypeEnum = z.enum(ACCOUNT_TYPE_VALUES, {
  errorMap: () => ({ message: `Account type must be one of: ${ACCOUNT_TYPE_VALUES.join(', ')}` })
});

const createLedgerAccountSchema = z.object({
  chartOfAccountsId: z.string(),
  parentAccountId: z.string().optional(),
  accountCode: z.string().min(1),
  accountName: z.string().min(1),
  accountType: accountTypeEnum,
  accountSubtype: subtypeField,
  normalBalance: z.enum(['debit', 'credit']),
  description: z.string().optional(),
  isSystem: z.coerce.boolean().optional(),
  isActive: z.coerce.boolean().optional()
});

const updateLedgerAccountSchema = z.object({
  parentAccountId: z.string().optional(),
  accountCode: z.string().min(1).optional(),
  accountName: z.string().min(1).optional(),
  accountType: accountTypeEnum.optional(),
  accountSubtype: subtypeField,
  normalBalance: z.enum(['debit', 'credit']).optional(),
  description: z.string().nullable().optional(),
  isActive: z.coerce.boolean().optional()
});

export class LedgerAccountsController {
  static async types(req: Request, res: Response): Promise<void> {
    try {
      const qb = AppDataSource.getRepository(LedgerAccount)
        .createQueryBuilder('la')
        .select('la.account_type', 'accountType')
        .addSelect('la.account_subtype', 'accountSubtype')
        .where('la.account_subtype IS NOT NULL')
        .andWhere("la.account_subtype <> ''")
        .groupBy('la.account_type')
        .addGroupBy('la.account_subtype');
      if (req.query.organizationId) {
        qb.innerJoin('la.chartOfAccounts', 'coa').andWhere('coa.organization_id = :oid', {
          oid: String(req.query.organizationId)
        });
      }
      const rows: Array<{ accountType: string; accountSubtype: string }> = await qb.getRawMany();
      res.json({
        data: LEDGER_ACCOUNT_TYPES.map((t) => {
          const standard = LEDGER_ACCOUNT_SUBTYPES[t.value] ?? [];
          const custom = rows
            .filter((r) => r.accountType === t.value && !standard.some((s) => s.value === r.accountSubtype))
            .map((r) => ({ value: r.accountSubtype, label: humanizeSubtype(r.accountSubtype) }))
            .sort((a, b) => a.label.localeCompare(b.label));
          const subtypeOptions = [...standard, ...custom];
          return { ...t, subtypes: subtypeOptions.map((s) => s.value), subtypeOptions };
        })
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(LedgerAccount);
      const { chartOfAccountsId, accountType, isActive, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('la')
        .leftJoinAndSelect('la.chartOfAccounts', 'coa')
        .leftJoinAndSelect('la.parentAccount', 'parent')
        .orderBy('la.accountCode', 'ASC');

      if (chartOfAccountsId) {
        queryBuilder.andWhere('la.chart_of_accounts_id = :coaId', { coaId: chartOfAccountsId });
      }

      if (accountType) {
        queryBuilder.andWhere('la.account_type = :accountType', { accountType });
      }

      if (isActive !== undefined) {
        queryBuilder.andWhere('la.is_active = :isActive', { isActive: isActive === 'true' });
      }

      if (search) {
        queryBuilder.andWhere(
          '(la.account_code LIKE :search OR la.account_name LIKE :search)',
          { search: `%${search}%` }
        );
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
      const repo = AppDataSource.getRepository(LedgerAccount);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['chartOfAccounts', 'parentAccount', 'childAccounts']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Ledger Account not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createLedgerAccountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: zodMessage(parsed.error), details: parsed.error.issues } });
        return;
      }

      const coaRepo = AppDataSource.getRepository(ChartOfAccounts);
      const chartOfAccounts = await coaRepo.findOne({ where: { id: parsed.data.chartOfAccountsId } });
      if (!chartOfAccounts) {
        res.status(400).json({ error: { message: 'Invalid chartOfAccountsId' } });
        return;
      }

      const repo = AppDataSource.getRepository(LedgerAccount);
      
      // Check for duplicate account code within chart of accounts
      const existing = await repo.findOne({
        where: { 
          chartOfAccounts: { id: parsed.data.chartOfAccountsId },
          accountCode: parsed.data.accountCode
        }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Account code already exists in this chart of accounts' } });
        return;
      }

      let parentAccount = null;
      if (parsed.data.parentAccountId) {
        parentAccount = await repo.findOne({ where: { id: parsed.data.parentAccountId } });
        if (!parentAccount) {
          res.status(400).json({ error: { message: 'Invalid parentAccountId' } });
          return;
        }
      }

      const item = repo.create({
        chartOfAccounts,
        parentAccount: parentAccount ?? undefined,
        accountCode: parsed.data.accountCode,
        accountName: parsed.data.accountName,
        accountType: parsed.data.accountType,
        accountSubtype: parsed.data.accountSubtype ?? null,
        normalBalance: parsed.data.normalBalance,
        description: parsed.data.description ?? null,
        isSystem: parsed.data.isSystem ?? false,
        isActive: parsed.data.isActive ?? true
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['chartOfAccounts', 'parentAccount']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateLedgerAccountSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: zodMessage(parsed.error), details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(LedgerAccount);
      const item = await repo.findOne({
        where: { id },
        relations: ['chartOfAccounts', 'parentAccount']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Ledger Account not found' } });
        return;
      }

      // Check for duplicate account code if changing
      if (parsed.data.accountCode && parsed.data.accountCode !== item.accountCode) {
        const existing = await repo.findOne({
          where: { 
            chartOfAccounts: { id: item.chartOfAccounts.id },
            accountCode: parsed.data.accountCode
          }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Account code already exists in this chart of accounts' } });
          return;
        }
      }

      if (parsed.data.parentAccountId !== undefined) {
        if (parsed.data.parentAccountId) {
          const parentAccount = await repo.findOne({ where: { id: parsed.data.parentAccountId } });
          if (!parentAccount) {
            res.status(400).json({ error: { message: 'Invalid parentAccountId' } });
            return;
          }
          item.parentAccount = parentAccount;
        } else {
          item.parentAccount = null;
        }
      }

      if (parsed.data.accountCode) item.accountCode = parsed.data.accountCode;
      if (parsed.data.accountName) item.accountName = parsed.data.accountName;
      if (parsed.data.accountType) item.accountType = parsed.data.accountType;
      if (parsed.data.accountSubtype !== undefined) item.accountSubtype = parsed.data.accountSubtype ?? null;
      if (parsed.data.normalBalance) item.normalBalance = parsed.data.normalBalance;
      if (parsed.data.description !== undefined) item.description = parsed.data.description ?? null;
      if (parsed.data.isActive !== undefined) item.isActive = parsed.data.isActive;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['chartOfAccounts', 'parentAccount']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(LedgerAccount);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Ledger Account not found' } });
        return;
      }

      if (item.isSystem) {
        res.status(400).json({ error: { message: 'System accounts cannot be deleted' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

