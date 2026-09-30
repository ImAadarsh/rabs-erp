import { Request, Response } from 'express';
import { z } from 'zod';
import { randomUUID } from 'crypto';
import { AppDataSource } from '@config/data-source.js';
import { BankTransaction } from '@entities/finance/BankTransaction.js';
import { BankAccount } from '@entities/finance/BankAccount.js';
import { AccBankRule } from '@entities/finance/AccBankRule.js';
import { AccBankTransfer } from '@entities/finance/AccBankTransfer.js';
import { AccBankReconciliation } from '@entities/finance/AccBankReconciliation.js';
import { Invoice } from '@entities/finance/Invoice.js';
import { AccSupplierBill } from '@entities/finance/AccSupplierBill.js';
import { appendAccAudit } from '@services/finance/accAudit.service.js';
import {
  createPostedJournal,
  resolveAccountByCode
} from '@services/finance/journalPosting.service.js';
import { roundMoney } from '@services/finance/vatCalc.service.js';

function orgId(req: Request): string {
  return String(req.query.organizationId || req.body?.organizationId || (req as any).user?.orgId || '1');
}
function userId(req: Request): string | null {
  return (req as any).user?.id ? String((req as any).user.id) : null;
}

function parseCsv(text: string): Array<Record<string, string>> {
  const lines = text
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((l) => l.trim().length);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().replace(/^"|"$/g, '').toLowerCase());
  return lines.slice(1).map((line) => {
    const cols = line.split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? '';
    });
    return row;
  });
}

function ruleMatches(rule: AccBankRule, tx: BankTransaction): boolean {
  const field =
    rule.matchField === 'payee_payer'
      ? tx.payeePayer
      : rule.matchField === 'reference'
        ? tx.reference
        : rule.matchField === 'amount'
          ? String(tx.amount)
          : tx.description;
  const value = (field || '').toString();
  const mv = rule.matchValue;
  switch (rule.matchOperator) {
    case 'equals':
      return value.toLowerCase() === mv.toLowerCase();
    case 'starts_with':
      return value.toLowerCase().startsWith(mv.toLowerCase());
    case 'regex':
      try {
        return new RegExp(mv, 'i').test(value);
      } catch {
        return false;
      }
    default:
      return value.toLowerCase().includes(mv.toLowerCase());
  }
}

export class AccBankingController {
  static async importCsv(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        bankAccountId: z.string(),
        csv: z.string().min(1)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: {
            message: 'Invalid payload — expect bankAccountId + csv text (date,amount,description,reference,payee)'
          }
        });
        return;
      }
      const bank = await AppDataSource.getRepository(BankAccount).findOne({
        where: { id: parsed.data.bankAccountId },
        relations: ['organization']
      });
      if (!bank) {
        res.status(404).json({ error: { message: 'Bank account not found' } });
        return;
      }
      const batchId = randomUUID().slice(0, 16);
      const rows = parseCsv(parsed.data.csv);
      const repo = AppDataSource.getRepository(BankTransaction);
      const created: BankTransaction[] = [];
      for (const row of rows) {
        const amountRaw = Number(row.amount || row.credit || row.debit || 0);
        if (!row.date && !row.transaction_date) continue;
        const amount = roundMoney(Math.abs(amountRaw));
        const type: BankTransaction['transactionType'] =
          amountRaw < 0 || row.debit ? 'debit' : 'credit';
        const tx = await repo.save(
          repo.create({
            bankAccount: bank,
            transactionDate: new Date(row.date || row.transaction_date),
            transactionType: type,
            amount,
            description: row.description || row.narration || null,
            reference: row.reference || row.ref || null,
            payeePayer: row.payee || row.payee_payer || null,
            currency: bank.currency || 'GBP',
            isReconciled: false,
            importBatchId: batchId
          })
        );
        created.push(tx);
      }
      await appendAccAudit({
        organizationId: bank.organization?.id || orgId(req),
        entityType: 'bank_import',
        entityId: bank.id,
        action: 'import',
        actorUserId: userId(req),
        payload: { batchId, count: created.length }
      });
      res.status(201).json({ data: { batchId, imported: created.length, transactions: created } });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async suggestMatches(req: Request, res: Response): Promise<void> {
    try {
      const tx = await AppDataSource.getRepository(BankTransaction).findOne({
        where: { id: req.params.id },
        relations: ['bankAccount', 'bankAccount.organization']
      });
      if (!tx) {
        res.status(404).json({ error: { message: 'Transaction not found' } });
        return;
      }
      const oid = tx.bankAccount.organization?.id || orgId(req);
      const amount = Number(tx.amount);
      const invoices = await AppDataSource.getRepository(Invoice)
        .createQueryBuilder('i')
        .where('i.organization_id = :oid', { oid })
        .andWhere('ABS((i.total - i.paid_amount) - :amt) < 0.05', { amt: amount })
        .andWhere('i.status NOT IN (:...st)', { st: ['paid', 'cancelled'] })
        .take(10)
        .getMany();
      const bills = await AppDataSource.getRepository(AccSupplierBill)
        .createQueryBuilder('b')
        .where('b.organization_id = :oid', { oid })
        .andWhere('ABS((b.total - b.paid_amount) - :amt) < 0.05', { amt: amount })
        .andWhere('b.status NOT IN (:...st)', { st: ['paid', 'void'] })
        .take(10)
        .getMany();
      res.json({
        data: {
          transaction: tx,
          suggestions: [
            ...invoices.map((i) => ({ type: 'invoice', id: i.id, label: i.invoiceNumber, amount: i.total })),
            ...bills.map((b) => ({ type: 'bill', id: b.id, label: b.billNumber, amount: b.total }))
          ]
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async match(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        matchedType: z.enum(['invoice', 'bill', 'journal', 'transfer', 'other']),
        matchedId: z.string()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload' } });
        return;
      }
      const repo = AppDataSource.getRepository(BankTransaction);
      const tx = await repo.findOne({
        where: { id: req.params.id },
        relations: ['bankAccount', 'bankAccount.organization']
      });
      if (!tx) {
        res.status(404).json({ error: { message: 'Transaction not found' } });
        return;
      }
      tx.matchedType = parsed.data.matchedType;
      tx.matchedId = parsed.data.matchedId;
      tx.matchConfidence = 100;
      await repo.save(tx);
      await appendAccAudit({
        organizationId: tx.bankAccount.organization?.id || orgId(req),
        entityType: 'bank_transaction',
        entityId: tx.id,
        action: 'match',
        actorUserId: userId(req),
        payload: parsed.data
      });
      res.json({ data: tx });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async applyRules(req: Request, res: Response): Promise<void> {
    try {
      const bankAccountId = String(req.body.bankAccountId || req.query.bankAccountId || '');
      const oid = orgId(req);
      const rules = await AppDataSource.getRepository(AccBankRule).find({
        where: { organizationId: oid, isActive: true },
        order: { priority: 'ASC' }
      });
      const qb = AppDataSource.getRepository(BankTransaction)
        .createQueryBuilder('t')
        .innerJoinAndSelect('t.bankAccount', 'ba')
        .where('ba.organization_id = :oid', { oid })
        .andWhere('t.matched_type IS NULL')
        .take(500);
      if (bankAccountId) qb.andWhere('ba.id = :bid', { bid: bankAccountId });
      const txs = await qb.getMany();
      let applied = 0;
      for (const tx of txs) {
        for (const rule of rules) {
          if (ruleMatches(rule, tx)) {
            tx.ruleId = rule.id;
            tx.matchedType = 'rule';
            tx.matchedId = rule.id;
            tx.matchConfidence = 80;
            await AppDataSource.getRepository(BankTransaction).save(tx);
            applied++;
            break;
          }
        }
      }
      res.json({ data: { scanned: txs.length, applied } });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async listRules(req: Request, res: Response): Promise<void> {
    try {
      const data = await AppDataSource.getRepository(AccBankRule).find({
        where: { organizationId: orgId(req) },
        order: { priority: 'ASC' }
      });
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async createRule(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        name: z.string().min(1),
        matchField: z.enum(['description', 'reference', 'payee_payer', 'amount']).optional(),
        matchOperator: z.enum(['contains', 'equals', 'starts_with', 'regex']).optional(),
        matchValue: z.string().min(1),
        ledgerAccountId: z.string().optional().nullable(),
        vatCodeId: z.string().optional().nullable(),
        priority: z.coerce.number().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const repo = AppDataSource.getRepository(AccBankRule);
      const item = await repo.save(
        repo.create({
          organizationId: oid,
          name: parsed.data.name,
          matchField: parsed.data.matchField ?? 'description',
          matchOperator: parsed.data.matchOperator ?? 'contains',
          matchValue: parsed.data.matchValue,
          ledgerAccountId: parsed.data.ledgerAccountId ?? null,
          vatCodeId: parsed.data.vatCodeId ?? null,
          priority: parsed.data.priority ?? 100
        })
      );
      res.status(201).json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async transfer(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        fromBankAccountId: z.string(),
        toBankAccountId: z.string(),
        transferDate: z.string(),
        amount: z.coerce.number().positive(),
        reference: z.string().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      if (parsed.data.fromBankAccountId === parsed.data.toBankAccountId) {
        res.status(400).json({ error: { message: 'From and to accounts must differ' } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const bankRepo = AppDataSource.getRepository(BankAccount);
      const from = await bankRepo.findOne({
        where: { id: parsed.data.fromBankAccountId },
        relations: ['ledgerAccount']
      });
      const to = await bankRepo.findOne({
        where: { id: parsed.data.toBankAccountId },
        relations: ['ledgerAccount']
      });
      if (!from || !to) {
        res.status(404).json({ error: { message: 'Bank account not found' } });
        return;
      }
      const fromLedger =
        from.ledgerAccount || (await resolveAccountByCode(oid, '1000'));
      const toLedger = to.ledgerAccount || (await resolveAccountByCode(oid, '1000'));
      if (!fromLedger || !toLedger) {
        res.status(400).json({ error: { message: 'Ledger accounts missing for transfer' } });
        return;
      }
      const je = await createPostedJournal({
        organizationId: oid,
        entryDate: parsed.data.transferDate,
        description: `Bank transfer ${parsed.data.reference || ''}`.trim(),
        reference: parsed.data.reference,
        sourceType: 'other',
        lines: [
          {
            ledgerAccountId: toLedger.id,
            description: 'Transfer in',
            debitAmount: parsed.data.amount,
            creditAmount: 0
          },
          {
            ledgerAccountId: fromLedger.id,
            description: 'Transfer out',
            debitAmount: 0,
            creditAmount: parsed.data.amount
          }
        ],
        postedByUserId: userId(req)
      });
      from.currentBalance = roundMoney(Number(from.currentBalance) - parsed.data.amount);
      to.currentBalance = roundMoney(Number(to.currentBalance) + parsed.data.amount);
      await bankRepo.save(from);
      await bankRepo.save(to);

      const transfer = await AppDataSource.getRepository(AccBankTransfer).save(
        AppDataSource.getRepository(AccBankTransfer).create({
          organizationId: oid,
          fromBankAccountId: from.id,
          toBankAccountId: to.id,
          transferDate: new Date(parsed.data.transferDate),
          amount: parsed.data.amount,
          reference: parsed.data.reference ?? null,
          journalEntryId: je.id,
          createdBy: userId(req)
        })
      );
      res.status(201).json({ data: transfer });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async startReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        bankAccountId: z.string(),
        statementDate: z.string(),
        statementBalance: z.coerce.number(),
        notes: z.string().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const bank = await AppDataSource.getRepository(BankAccount).findOne({
        where: { id: parsed.data.bankAccountId }
      });
      if (!bank) {
        res.status(404).json({ error: { message: 'Bank account not found' } });
        return;
      }
      const book = Number(bank.currentBalance);
      const item = await AppDataSource.getRepository(AccBankReconciliation).save(
        AppDataSource.getRepository(AccBankReconciliation).create({
          organizationId: parsed.data.organizationId || orgId(req),
          bankAccountId: bank.id,
          statementDate: new Date(parsed.data.statementDate),
          statementBalance: parsed.data.statementBalance,
          bookBalance: book,
          difference: roundMoney(parsed.data.statementBalance - book),
          notes: parsed.data.notes ?? null,
          status: 'in_progress'
        })
      );
      res.status(201).json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async completeReconciliation(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccBankReconciliation);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Reconciliation not found' } });
        return;
      }
      const txIds: string[] = Array.isArray(req.body?.transactionIds) ? req.body.transactionIds : [];
      if (txIds.length) {
        await AppDataSource.getRepository(BankTransaction)
          .createQueryBuilder()
          .update()
          .set({ isReconciled: true, reconciledAt: new Date() })
          .whereInIds(txIds)
          .execute();
      }
      item.status = 'completed';
      item.completedAt = new Date();
      item.completedBy = userId(req);
      await repo.save(item);
      await appendAccAudit({
        organizationId: item.organizationId,
        entityType: 'bank_reconciliation',
        entityId: item.id,
        action: 'reconcile',
        actorUserId: userId(req),
        payload: { transactionIds: txIds }
      });
      res.json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async listReconciliations(req: Request, res: Response): Promise<void> {
    try {
      const data = await AppDataSource.getRepository(AccBankReconciliation).find({
        where: { organizationId: orgId(req) },
        order: { statementDate: 'DESC' },
        take: 50
      });
      res.json({ data });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}
