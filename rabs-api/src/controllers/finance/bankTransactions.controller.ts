import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { BankTransaction } from '@entities/finance/BankTransaction.js';
import { z } from 'zod';
import { BankAccount } from '@entities/finance/BankAccount.js';
import { JournalEntry } from '@entities/finance/JournalEntry.js';

const createBankTransactionSchema = z.object({
  bankAccountId: z.string(),
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  transactionType: z.enum(['debit', 'credit', 'fee', 'interest', 'other']),
  amount: z.coerce.number(),
  currency: z.string().length(3).optional(),
  description: z.string().optional(),
  reference: z.string().optional(),
  payeePayer: z.string().optional(),
  balance: z.coerce.number().optional(),
  isReconciled: z.coerce.boolean().optional(),
  journalEntryId: z.string().optional()
});

const updateBankTransactionSchema = z.object({
  transactionDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  postDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  transactionType: z.enum(['debit', 'credit', 'fee', 'interest', 'other']).optional(),
  amount: z.coerce.number().optional(),
  currency: z.string().length(3).optional(),
  description: z.string().optional(),
  reference: z.string().optional(),
  payeePayer: z.string().optional(),
  balance: z.coerce.number().optional(),
  isReconciled: z.coerce.boolean().optional(),
  journalEntryId: z.string().optional()
});

export class BankTransactionsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(BankTransaction);
      const { bankAccountId, isReconciled, transactionType, startDate, endDate, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('bt')
        .leftJoinAndSelect('bt.bankAccount', 'ba')
        .leftJoinAndSelect('bt.journalEntry', 'je')
        .orderBy('bt.transactionDate', 'DESC')
        .addOrderBy('bt.createdAt', 'DESC');

      if (bankAccountId) {
        queryBuilder.andWhere('bt.bank_account_id = :bankAccountId', { bankAccountId });
      }

      if (isReconciled !== undefined) {
        queryBuilder.andWhere('bt.is_reconciled = :isReconciled', { isReconciled: isReconciled === 'true' });
      }

      if (transactionType) {
        queryBuilder.andWhere('bt.transaction_type = :transactionType', { transactionType });
      }

      if (startDate) {
        queryBuilder.andWhere('bt.transaction_date >= :startDate', { startDate });
      }

      if (endDate) {
        queryBuilder.andWhere('bt.transaction_date <= :endDate', { endDate });
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
      const repo = AppDataSource.getRepository(BankTransaction);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['bankAccount', 'journalEntry']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Bank Transaction not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createBankTransactionSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const baRepo = AppDataSource.getRepository(BankAccount);
      const bankAccount = await baRepo.findOne({ where: { id: parsed.data.bankAccountId } });
      if (!bankAccount) {
        res.status(400).json({ error: { message: 'Invalid bankAccountId' } });
        return;
      }

      const repo = AppDataSource.getRepository(BankTransaction);
      
      let journalEntry = null;
      if (parsed.data.journalEntryId) {
        const jeRepo = AppDataSource.getRepository(JournalEntry);
        journalEntry = await jeRepo.findOne({ where: { id: parsed.data.journalEntryId } });
        if (!journalEntry) {
          res.status(400).json({ error: { message: 'Invalid journalEntryId' } });
          return;
        }
      }

      const item = repo.create({
        bankAccount,
        transactionDate: new Date(parsed.data.transactionDate),
        postDate: parsed.data.postDate ? new Date(parsed.data.postDate) : null,
        transactionType: parsed.data.transactionType,
        amount: parsed.data.amount,
        currency: parsed.data.currency ?? 'GBP',
        description: parsed.data.description ?? null,
        reference: parsed.data.reference ?? null,
        payeePayer: parsed.data.payeePayer ?? null,
        balance: parsed.data.balance ?? null,
        isReconciled: parsed.data.isReconciled ?? false,
        journalEntry: journalEntry ?? undefined
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['bankAccount', 'journalEntry']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateBankTransactionSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(BankTransaction);
      const item = await repo.findOne({
        where: { id },
        relations: ['bankAccount', 'journalEntry']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Bank Transaction not found' } });
        return;
      }

      if (parsed.data.journalEntryId !== undefined) {
        if (parsed.data.journalEntryId) {
          const jeRepo = AppDataSource.getRepository(JournalEntry);
          const journalEntry = await jeRepo.findOne({ where: { id: parsed.data.journalEntryId } });
          if (!journalEntry) {
            res.status(400).json({ error: { message: 'Invalid journalEntryId' } });
            return;
          }
          item.journalEntry = journalEntry;
        } else {
          item.journalEntry = null;
        }
      }

      if (parsed.data.transactionDate) item.transactionDate = new Date(parsed.data.transactionDate);
      if (parsed.data.postDate !== undefined) item.postDate = parsed.data.postDate ? new Date(parsed.data.postDate) : null;
      if (parsed.data.transactionType) item.transactionType = parsed.data.transactionType;
      if (parsed.data.amount !== undefined) item.amount = parsed.data.amount;
      if (parsed.data.currency) item.currency = parsed.data.currency;
      if (parsed.data.description !== undefined) item.description = parsed.data.description ?? null;
      if (parsed.data.reference !== undefined) item.reference = parsed.data.reference ?? null;
      if (parsed.data.payeePayer !== undefined) item.payeePayer = parsed.data.payeePayer ?? null;
      if (parsed.data.balance !== undefined) item.balance = parsed.data.balance ?? null;
      if (parsed.data.isReconciled !== undefined) {
        item.isReconciled = parsed.data.isReconciled;
        if (parsed.data.isReconciled) {
          item.reconciledAt = new Date();
        } else {
          item.reconciledAt = null;
        }
      }

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['bankAccount', 'journalEntry']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(BankTransaction);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Bank Transaction not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

