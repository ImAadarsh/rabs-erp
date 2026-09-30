import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { AccSupplierBill } from '@entities/finance/AccSupplierBill.js';
import { AccSupplierBillLine } from '@entities/finance/AccSupplierBillLine.js';
import { AccBillPayment } from '@entities/finance/AccBillPayment.js';
import { AccExpense } from '@entities/finance/AccExpense.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { calcLineVat, roundMoney } from '@services/finance/vatCalc.service.js';
import { appendAccAudit } from '@services/finance/accAudit.service.js';
import {
  createPostedJournal,
  resolveAccountByCode
} from '@services/finance/journalPosting.service.js';

function orgId(req: Request): string {
  return String(req.query.organizationId || req.body?.organizationId || (req as any).user?.orgId || '1');
}
function userId(req: Request): string | null {
  return (req as any).user?.id ? String((req as any).user.id) : null;
}

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: z.coerce.number().positive().default(1),
  unitPrice: z.coerce.number(),
  vatCodeId: z.string().optional().nullable(),
  taxRate: z.coerce.number().optional(),
  ledgerAccountId: z.string().optional().nullable()
});

export class AccPurchasesController {
  static async listBills(req: Request, res: Response): Promise<void> {
    try {
      const qb = AppDataSource.getRepository(AccSupplierBill)
        .createQueryBuilder('b')
        .leftJoinAndSelect('b.supplier', 's')
        .leftJoinAndSelect('b.lines', 'l')
        .where('b.organization_id = :oid', { oid: orgId(req) })
        .orderBy('b.bill_date', 'DESC')
        .take(100);
      if (req.query.status) qb.andWhere('b.status = :st', { st: String(req.query.status) });
      res.json({ data: await qb.getMany() });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async getBill(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(AccSupplierBill).findOne({
        where: { id: req.params.id },
        relations: ['supplier', 'lines', 'lines.vatCode', 'journalEntry']
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Bill not found' } });
        return;
      }
      res.json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async createBill(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        supplierId: z.string(),
        billNumber: z.string().min(1),
        billDate: z.string(),
        dueDate: z.string().optional().nullable(),
        currency: z.string().length(3).optional(),
        documentUrl: z.string().optional().nullable(),
        notes: z.string().optional().nullable(),
        lines: z.array(lineSchema).min(1)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      let subtotal = 0;
      let taxAmount = 0;
      const built: Partial<AccSupplierBillLine>[] = [];
      for (const line of parsed.data.lines) {
        const vat = await calcLineVat(oid, {
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatCodeId: line.vatCodeId,
          taxRate: line.taxRate
        });
        subtotal += vat.netAmount;
        taxAmount += vat.taxAmount;
        built.push({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatCodeId: vat.vatCodeId,
          taxRate: vat.taxRate,
          taxAmount: vat.taxAmount,
          lineTotal: vat.grossAmount,
          ledgerAccountId: line.ledgerAccountId ?? null
        });
      }

      const billRepo = AppDataSource.getRepository(AccSupplierBill);
      const bill = await billRepo.save(
        billRepo.create({
          organizationId: oid,
          supplierId: parsed.data.supplierId,
          billNumber: parsed.data.billNumber,
          billDate: new Date(parsed.data.billDate),
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
          currency: parsed.data.currency ?? 'GBP',
          documentUrl: parsed.data.documentUrl ?? null,
          notes: parsed.data.notes ?? null,
          subtotal: roundMoney(subtotal),
          taxAmount: roundMoney(taxAmount),
          total: roundMoney(subtotal + taxAmount),
          paidAmount: 0,
          status: 'draft',
          createdBy: userId(req)
        })
      );
      const lineRepo = AppDataSource.getRepository(AccSupplierBillLine);
      for (const b of built) {
        await lineRepo.save(lineRepo.create({ ...b, billId: bill.id } as any));
      }
      await appendAccAudit({
        organizationId: oid,
        entityType: 'supplier_bill',
        entityId: bill.id,
        action: 'create',
        actorUserId: userId(req)
      });
      res.status(201).json({
        data: await billRepo.findOne({ where: { id: bill.id }, relations: ['lines', 'supplier'] })
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async submitForApproval(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccSupplierBill);
      const bill = await repo.findOne({ where: { id: req.params.id } });
      if (!bill) {
        res.status(404).json({ error: { message: 'Bill not found' } });
        return;
      }
      bill.status = 'pending_approval';
      await repo.save(bill);
      res.json({ data: bill });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async approveBill(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccSupplierBill);
      const bill = await repo.findOne({ where: { id: req.params.id } });
      if (!bill) {
        res.status(404).json({ error: { message: 'Bill not found' } });
        return;
      }
      bill.status = 'approved';
      bill.approvedBy = userId(req);
      bill.approvedAt = new Date();
      await repo.save(bill);
      await appendAccAudit({
        organizationId: bill.organizationId,
        entityType: 'supplier_bill',
        entityId: bill.id,
        action: 'approve',
        actorUserId: userId(req)
      });
      res.json({ data: bill });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async payBill(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        paymentDate: z.string(),
        amount: z.coerce.number().positive(),
        bankAccountId: z.string().optional().nullable(),
        reference: z.string().optional(),
        notes: z.string().optional(),
        postJournal: z.boolean().optional()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const billRepo = AppDataSource.getRepository(AccSupplierBill);
      const bill = await billRepo.findOne({ where: { id: req.params.id } });
      if (!bill) {
        res.status(404).json({ error: { message: 'Bill not found' } });
        return;
      }
      const oid = bill.organizationId;
      let journalEntryId: string | null = null;
      if (parsed.data.postJournal !== false) {
        const ap = await resolveAccountByCode(oid, '2000');
        const bank = await resolveAccountByCode(oid, '1000');
        if (ap && bank) {
          const je = await createPostedJournal({
            organizationId: oid,
            entryDate: parsed.data.paymentDate,
            description: `Bill payment ${bill.billNumber}`,
            reference: parsed.data.reference ?? bill.billNumber,
            sourceType: 'payment',
            sourceId: bill.id,
            lines: [
              {
                ledgerAccountId: ap.id,
                description: 'Clear creditors',
                debitAmount: parsed.data.amount,
                creditAmount: 0
              },
              {
                ledgerAccountId: bank.id,
                description: 'Bank',
                debitAmount: 0,
                creditAmount: parsed.data.amount
              }
            ],
            postedByUserId: userId(req)
          });
          journalEntryId = je.id;
        }
      }
      const pay = await AppDataSource.getRepository(AccBillPayment).save(
        AppDataSource.getRepository(AccBillPayment).create({
          organizationId: oid,
          billId: bill.id,
          paymentDate: new Date(parsed.data.paymentDate),
          amount: parsed.data.amount,
          bankAccountId: parsed.data.bankAccountId ?? null,
          reference: parsed.data.reference ?? null,
          notes: parsed.data.notes ?? null,
          journalEntryId,
          createdBy: userId(req)
        })
      );
      bill.paidAmount = roundMoney(Number(bill.paidAmount) + parsed.data.amount);
      bill.status =
        bill.paidAmount >= Number(bill.total) - 0.01 ? 'paid' : 'partially_paid';
      await billRepo.save(bill);
      res.status(201).json({ data: { payment: pay, bill } });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async supplierStatement(req: Request, res: Response): Promise<void> {
    try {
      const supplierId = req.params.supplierId;
      const oid = orgId(req);
      const supplier = await AppDataSource.getRepository(Supplier).findOne({
        where: { id: supplierId }
      });
      if (!supplier) {
        res.status(404).json({ error: { message: 'Supplier not found' } });
        return;
      }
      const bills = await AppDataSource.getRepository(AccSupplierBill).find({
        where: { organizationId: oid, supplierId },
        order: { billDate: 'ASC' }
      });
      const payments = await AppDataSource.getRepository(AccBillPayment)
        .createQueryBuilder('p')
        .innerJoin('p.bill', 'b')
        .where('b.supplier_id = :sid', { sid: supplierId })
        .andWhere('p.organization_id = :oid', { oid })
        .getMany();
      const openBalance = roundMoney(
        bills.reduce((s, b) => s + (Number(b.total) - Number(b.paidAmount || 0)), 0)
      );
      res.json({ data: { supplier, bills, payments, openBalance } });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}

export class AccExpensesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const items = await AppDataSource.getRepository(AccExpense).find({
        where: { organizationId: orgId(req) },
        relations: ['employee', 'vatCode'],
        order: { expenseDate: 'DESC' },
        take: 200
      });
      res.json({ data: items });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        employeeId: z.string().optional().nullable(),
        expenseDate: z.string(),
        category: z.string().optional().nullable(),
        description: z.string().min(1),
        amount: z.coerce.number().positive(),
        vatCodeId: z.string().optional().nullable(),
        taxAmount: z.coerce.number().optional(),
        receiptUrl: z.string().optional().nullable(),
        ledgerAccountId: z.string().optional().nullable()
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      let taxAmount = parsed.data.taxAmount ?? 0;
      if (parsed.data.vatCodeId && taxAmount === 0) {
        const vat = await calcLineVat(oid, {
          quantity: 1,
          unitPrice: parsed.data.amount,
          vatCodeId: parsed.data.vatCodeId
        });
        taxAmount = vat.taxAmount;
      }
      const repo = AppDataSource.getRepository(AccExpense);
      const item = await repo.save(
        repo.create({
          organizationId: oid,
          employeeId: parsed.data.employeeId ?? null,
          expenseDate: new Date(parsed.data.expenseDate),
          category: parsed.data.category ?? null,
          description: parsed.data.description,
          amount: parsed.data.amount,
          taxAmount,
          vatCodeId: parsed.data.vatCodeId ?? null,
          receiptUrl: parsed.data.receiptUrl ?? null,
          ledgerAccountId: parsed.data.ledgerAccountId ?? null,
          status: 'draft',
          createdBy: userId(req)
        })
      );
      await appendAccAudit({
        organizationId: oid,
        entityType: 'expense',
        entityId: item.id,
        action: 'create',
        actorUserId: userId(req)
      });
      res.status(201).json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async submit(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccExpense);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Expense not found' } });
        return;
      }
      item.status = 'submitted';
      await repo.save(item);
      res.json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async approve(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccExpense);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Expense not found' } });
        return;
      }
      item.status = 'approved';
      item.approvedBy = userId(req);
      item.approvedAt = new Date();

      const expenseAcct =
        (item.ledgerAccountId
          ? await AppDataSource.getRepository(
              (await import('@entities/finance/LedgerAccount.js')).LedgerAccount
            ).findOne({ where: { id: item.ledgerAccountId } })
          : null) || (await resolveAccountByCode(item.organizationId, '6600'));
      const ap = await resolveAccountByCode(item.organizationId, '2000');
      const vat = await resolveAccountByCode(item.organizationId, '1300');
      if (expenseAcct && ap) {
        const net = roundMoney(Number(item.amount) - Number(item.taxAmount || 0));
        const tax = roundMoney(Number(item.taxAmount || 0));
        const total = roundMoney(Number(item.amount));
        const je = await createPostedJournal({
          organizationId: item.organizationId,
          entryDate: item.expenseDate,
          description: `Expense ${item.id}`,
          sourceType: 'other',
          sourceId: item.id,
          lines: [
            {
              ledgerAccountId: expenseAcct.id,
              description: item.description,
              debitAmount: net > 0 ? net : total,
              creditAmount: 0
            },
            ...(tax > 0 && vat
              ? [
                  {
                    ledgerAccountId: vat.id,
                    description: 'VAT reclaim',
                    debitAmount: tax,
                    creditAmount: 0
                  }
                ]
              : []),
            {
              ledgerAccountId: ap.id,
              description: 'Expense payable',
              debitAmount: 0,
              creditAmount: total
            }
          ],
          postedByUserId: userId(req)
        });
        item.journalEntryId = je.id;
      }

      await repo.save(item);
      await appendAccAudit({
        organizationId: item.organizationId,
        entityType: 'expense',
        entityId: item.id,
        action: 'approve',
        actorUserId: userId(req)
      });
      res.json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async reject(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccExpense);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Expense not found' } });
        return;
      }
      item.status = 'rejected';
      item.rejectionReason = req.body?.rejectionReason ?? null;
      await repo.save(item);
      res.json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}
