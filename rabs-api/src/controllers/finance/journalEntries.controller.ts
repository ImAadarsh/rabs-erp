import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { JournalEntry } from '@entities/finance/JournalEntry.js';
import { JournalLine } from '@entities/finance/JournalLine.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { FiscalPeriod } from '@entities/finance/FiscalPeriod.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';
import { CostCenter } from '@entities/finance/CostCenter.js';
import { User } from '@entities/iam/User.js';

const journalLineSchema = z.object({
  ledgerAccountId: z.string(),
  costCenterId: z.string().optional(),
  lineNumber: z.coerce.number().int().positive(),
  description: z.string().optional(),
  debitAmount: z.coerce.number().nonnegative().default(0),
  creditAmount: z.coerce.number().nonnegative().default(0),
  currency: z.string().length(3).optional(),
  exchangeRate: z.coerce.number().positive().optional()
});

const createJournalEntrySchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  fiscalPeriodId: z.string(),
  journalNumber: z.string().min(1),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  entryType: z.enum(['standard', 'adjusting', 'closing', 'reversing', 'recurring']).optional(),
  sourceType: z.enum(['manual', 'invoice', 'payment', 'order', 'payroll', 'inventory', 'other']).optional(),
  sourceId: z.string().optional(),
  description: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(['draft', 'posted', 'voided']).optional(),
  journalLines: z.array(journalLineSchema).min(2)
});

const updateJournalEntrySchema = z.object({
  businessUnitId: z.string().optional(),
  fiscalPeriodId: z.string().optional(),
  journalNumber: z.string().min(1).optional(),
  entryDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  entryType: z.enum(['standard', 'adjusting', 'closing', 'reversing', 'recurring']).optional(),
  sourceType: z.enum(['manual', 'invoice', 'payment', 'order', 'payroll', 'inventory', 'other']).optional(),
  sourceId: z.string().optional(),
  description: z.string().optional(),
  reference: z.string().optional(),
  status: z.enum(['draft', 'posted', 'voided']).optional(),
  journalLines: z.array(journalLineSchema).min(2).optional()
});

export class JournalEntriesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(JournalEntry);
      const { organizationId, fiscalPeriodId, status, entryType, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('je')
        .leftJoinAndSelect('je.organization', 'org')
        .leftJoinAndSelect('je.businessUnit', 'bu')
        .leftJoinAndSelect('je.fiscalPeriod', 'fp')
        .leftJoinAndSelect('je.createdBy', 'createdBy')
        .orderBy('je.entryDate', 'DESC')
        .addOrderBy('je.journalNumber', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('je.organization_id = :orgId', { orgId: organizationId });
      }

      if (fiscalPeriodId) {
        queryBuilder.andWhere('je.fiscal_period_id = :fpId', { fpId: fiscalPeriodId });
      }

      if (status) {
        queryBuilder.andWhere('je.status = :status', { status });
      }

      if (entryType) {
        queryBuilder.andWhere('je.entry_type = :entryType', { entryType });
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
      const repo = AppDataSource.getRepository(JournalEntry);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: [
          'organization', 
          'businessUnit', 
          'fiscalPeriod', 
          'createdBy', 
          'postedBy',
          'journalLines',
          'journalLines.ledgerAccount',
          'journalLines.costCenter'
        ]
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Journal Entry not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createJournalEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      // Validate journal lines balance (debits = credits)
      const totalDebits = parsed.data.journalLines.reduce((sum, line) => sum + line.debitAmount, 0);
      const totalCredits = parsed.data.journalLines.reduce((sum, line) => sum + line.creditAmount, 0);
      
      if (Math.abs(totalDebits - totalCredits) > 0.01) {
        res.status(400).json({ error: { message: 'Journal entry must balance: total debits must equal total credits' } });
        return;
      }

      const orgRepo = AppDataSource.getRepository(Organization);
      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const fpRepo = AppDataSource.getRepository(FiscalPeriod);
      const fiscalPeriod = await fpRepo.findOne({ where: { id: parsed.data.fiscalPeriodId } });
      if (!fiscalPeriod) {
        res.status(400).json({ error: { message: 'Invalid fiscalPeriodId' } });
        return;
      }

      if (fiscalPeriod.isClosed) {
        res.status(400).json({ error: { message: 'Cannot create journal entry in a closed fiscal period' } });
        return;
      }

      const repo = AppDataSource.getRepository(JournalEntry);
      const existing = await repo.findOne({
        where: { journalNumber: parsed.data.journalNumber }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Journal number already exists' } });
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

      const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
      const userRepo = AppDataSource.getRepository(User);
      const createdBy = await userRepo.findOne({ where: { id: auth.sub } });

      // Validate all ledger accounts and cost centers
      const ledgerAccountRepo = AppDataSource.getRepository(LedgerAccount);
      const costCenterRepo = AppDataSource.getRepository(CostCenter);

      for (const line of parsed.data.journalLines) {
        const ledgerAccount = await ledgerAccountRepo.findOne({ where: { id: line.ledgerAccountId } });
        if (!ledgerAccount) {
          res.status(400).json({ error: { message: `Invalid ledgerAccountId: ${line.ledgerAccountId}` } });
          return;
        }

        if (line.costCenterId) {
          const costCenter = await costCenterRepo.findOne({ where: { id: line.costCenterId } });
          if (!costCenter) {
            res.status(400).json({ error: { message: `Invalid costCenterId: ${line.costCenterId}` } });
            return;
          }
        }
      }

      const entry = repo.create({
        organization: org,
        businessUnit: businessUnit ?? undefined,
        fiscalPeriod,
        journalNumber: parsed.data.journalNumber,
        entryDate: new Date(parsed.data.entryDate),
        entryType: parsed.data.entryType ?? 'standard',
        sourceType: parsed.data.sourceType ?? 'manual',
        sourceId: parsed.data.sourceId ?? null,
        description: parsed.data.description ?? null,
        reference: parsed.data.reference ?? null,
        status: parsed.data.status ?? 'draft',
        createdBy: createdBy ?? undefined
      });

      await repo.save(entry);

      // Create journal lines
      const journalLineRepo = AppDataSource.getRepository(JournalLine);
      for (const lineData of parsed.data.journalLines) {
        const ledgerAccount = await ledgerAccountRepo.findOne({ where: { id: lineData.ledgerAccountId } });
        if (!ledgerAccount) {
          res.status(400).json({ error: { message: `Invalid ledgerAccountId: ${lineData.ledgerAccountId}` } });
          return;
        }
        const costCenter = lineData.costCenterId 
          ? await costCenterRepo.findOne({ where: { id: lineData.costCenterId } }) 
          : null;

        const journalLine = journalLineRepo.create({
          journalEntry: entry,
          ledgerAccount,
          costCenter: costCenter ?? undefined,
          lineNumber: lineData.lineNumber,
          description: lineData.description ?? null,
          debitAmount: lineData.debitAmount,
          creditAmount: lineData.creditAmount,
          currency: lineData.currency ?? 'GBP',
          exchangeRate: lineData.exchangeRate ?? 1.0
        });

        await journalLineRepo.save(journalLine);
      }

      const saved = await repo.findOne({
        where: { id: entry.id },
        relations: [
          'organization', 
          'businessUnit', 
          'fiscalPeriod',
          'journalLines',
          'journalLines.ledgerAccount',
          'journalLines.costCenter'
        ]
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateJournalEntrySchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(JournalEntry);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'businessUnit', 'fiscalPeriod', 'journalLines']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Journal Entry not found' } });
        return;
      }

      if (item.status === 'posted') {
        res.status(400).json({ error: { message: 'Cannot update a posted journal entry' } });
        return;
      }

      // If journal lines are being updated, validate balance
      if (parsed.data.journalLines) {
        const totalDebits = parsed.data.journalLines.reduce((sum, line) => sum + line.debitAmount, 0);
        const totalCredits = parsed.data.journalLines.reduce((sum, line) => sum + line.creditAmount, 0);
        
        if (Math.abs(totalDebits - totalCredits) > 0.01) {
          res.status(400).json({ error: { message: 'Journal entry must balance: total debits must equal total credits' } });
          return;
        }

        // Delete existing lines
        const journalLineRepo = AppDataSource.getRepository(JournalLine);
        await journalLineRepo.delete({ journalEntry: { id: item.id } });

        // Create new lines
        const ledgerAccountRepo = AppDataSource.getRepository(LedgerAccount);
        const costCenterRepo = AppDataSource.getRepository(CostCenter);

        for (const lineData of parsed.data.journalLines) {
          const ledgerAccount = await ledgerAccountRepo.findOne({ where: { id: lineData.ledgerAccountId } });
          if (!ledgerAccount) {
            res.status(400).json({ error: { message: `Invalid ledgerAccountId: ${lineData.ledgerAccountId}` } });
            return;
          }

          const costCenter = lineData.costCenterId 
            ? await costCenterRepo.findOne({ where: { id: lineData.costCenterId } }) 
            : null;

          const journalLine = journalLineRepo.create({
            journalEntry: item,
            ledgerAccount,
            costCenter: costCenter ?? undefined,
            lineNumber: lineData.lineNumber,
            description: lineData.description ?? null,
            debitAmount: lineData.debitAmount,
            creditAmount: lineData.creditAmount,
            currency: lineData.currency ?? 'GBP',
            exchangeRate: lineData.exchangeRate ?? 1.0
          });

          await journalLineRepo.save(journalLine);
        }
      }

      if (parsed.data.fiscalPeriodId) {
        const fpRepo = AppDataSource.getRepository(FiscalPeriod);
        const fiscalPeriod = await fpRepo.findOne({ where: { id: parsed.data.fiscalPeriodId } });
        if (!fiscalPeriod) {
          res.status(400).json({ error: { message: 'Invalid fiscalPeriodId' } });
          return;
        }
        if (fiscalPeriod.isClosed) {
          res.status(400).json({ error: { message: 'Cannot update journal entry to a closed fiscal period' } });
          return;
        }
        item.fiscalPeriod = fiscalPeriod;
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

      if (parsed.data.journalNumber) {
        if (parsed.data.journalNumber !== item.journalNumber) {
          const existing = await repo.findOne({ where: { journalNumber: parsed.data.journalNumber } });
          if (existing) {
            res.status(400).json({ error: { message: 'Journal number already exists' } });
            return;
          }
        }
        item.journalNumber = parsed.data.journalNumber;
      }

      if (parsed.data.entryDate) item.entryDate = new Date(parsed.data.entryDate);
      if (parsed.data.entryType) item.entryType = parsed.data.entryType;
      if (parsed.data.sourceType) item.sourceType = parsed.data.sourceType;
      if (parsed.data.sourceId !== undefined) item.sourceId = parsed.data.sourceId ?? null;
      if (parsed.data.description !== undefined) item.description = parsed.data.description ?? null;
      if (parsed.data.reference !== undefined) item.reference = parsed.data.reference ?? null;
      if (parsed.data.status) item.status = parsed.data.status;

      // Handle posting
      if (parsed.data.status === 'posted' && item.status === 'draft') {
        const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] };
        const userRepo = AppDataSource.getRepository(User);
        const postedBy = await userRepo.findOne({ where: { id: auth.sub } });
        item.postedBy = postedBy ?? null;
        item.postedAt = new Date();
      }

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: [
          'organization', 
          'businessUnit', 
          'fiscalPeriod',
          'journalLines',
          'journalLines.ledgerAccount',
          'journalLines.costCenter'
        ]
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(JournalEntry);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Journal Entry not found' } });
        return;
      }

      if (item.status === 'posted') {
        res.status(400).json({ error: { message: 'Cannot delete a posted journal entry' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

