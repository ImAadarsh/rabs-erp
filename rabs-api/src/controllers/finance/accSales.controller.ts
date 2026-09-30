import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Invoice } from '@entities/finance/Invoice.js';
import { InvoiceLine } from '@entities/finance/InvoiceLine.js';
import { CreditNote } from '@entities/finance/CreditNote.js';
import { CreditNoteLine } from '@entities/finance/CreditNoteLine.js';
import { AccRecurringInvoice } from '@entities/finance/AccRecurringInvoice.js';
import { AccInvoicePayment } from '@entities/finance/AccInvoicePayment.js';
import { Customer } from '@entities/orders/Customer.js';
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
  quantity: z.coerce.number().positive(),
  unitPrice: z.coerce.number(),
  vatCodeId: z.string().optional().nullable(),
  taxRate: z.coerce.number().optional(),
  ledgerAccountId: z.string().optional().nullable(),
  discountPercent: z.coerce.number().optional(),
  discountAmount: z.coerce.number().optional()
});

export class AccSalesController {
  static async createInvoice(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        customerId: z.string(),
        invoiceNumber: z.string().min(1),
        invoiceDate: z.string(),
        dueDate: z.string().optional(),
        currency: z.string().length(3).optional(),
        paymentTerms: z.string().optional(),
        notes: z.string().optional(),
        documentUrl: z.string().url().optional().nullable(),
        vatInclusive: z.boolean().optional(),
        lines: z.array(lineSchema).min(1)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const vatInclusive = parsed.data.vatInclusive ?? false;
      let subtotal = 0;
      let taxAmount = 0;
      const builtLines: Partial<InvoiceLine>[] = [];
      for (const line of parsed.data.lines) {
        const vat = await calcLineVat(oid, {
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          vatCodeId: line.vatCodeId,
          taxRate: line.taxRate,
          vatInclusive
        });
        subtotal += vat.netAmount;
        taxAmount += vat.taxAmount;
        builtLines.push({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          discountPercent: line.discountPercent ?? 0,
          discountAmount: line.discountAmount ?? 0,
          taxRate: vat.taxRate,
          taxAmount: vat.taxAmount,
          lineTotal: vat.grossAmount,
          vatCodeId: vat.vatCodeId,
          ledgerAccountId: line.ledgerAccountId ?? null
        });
      }
      subtotal = roundMoney(subtotal);
      taxAmount = roundMoney(taxAmount);
      const total = roundMoney(subtotal + taxAmount);

      const invRepo = AppDataSource.getRepository(Invoice);
      const invoice = await invRepo.save(
        invRepo.create({
          organizationId: oid,
          customerId: parsed.data.customerId,
          invoiceNumber: parsed.data.invoiceNumber,
          invoiceDate: new Date(parsed.data.invoiceDate),
          dueDate: parsed.data.dueDate ? new Date(parsed.data.dueDate) : undefined,
          currency: parsed.data.currency ?? 'GBP',
          paymentTerms: parsed.data.paymentTerms,
          notes: parsed.data.notes,
          documentUrl: parsed.data.documentUrl ?? null,
          vatInclusive,
          subtotal,
          taxAmount,
          total,
          paidAmount: 0,
          status: 'draft',
          createdBy: userId(req) ?? undefined
        })
      );

      const lineRepo = AppDataSource.getRepository(InvoiceLine);
      for (const bl of builtLines) {
        await lineRepo.save(lineRepo.create({ ...bl, invoiceId: invoice.id } as any));
      }

      await appendAccAudit({
        organizationId: oid,
        entityType: 'invoice',
        entityId: invoice.id,
        action: 'create',
        actorUserId: userId(req)
      });

      const full = await invRepo.findOne({
        where: { id: invoice.id },
        relations: ['lines', 'customer']
      });
      res.status(201).json({ data: full });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async recordPayment(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        invoiceId: z.string(),
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
      const oid = parsed.data.organizationId || orgId(req);
      const invRepo = AppDataSource.getRepository(Invoice);
      const invoice = await invRepo.findOne({ where: { id: parsed.data.invoiceId } });
      if (!invoice) {
        res.status(404).json({ error: { message: 'Invoice not found' } });
        return;
      }

      let journalEntryId: string | null = null;
      if (parsed.data.postJournal !== false) {
        const bankCode = '1000';
        const ar = await resolveAccountByCode(oid, '1200');
        const bank = await resolveAccountByCode(oid, bankCode);
        if (ar && bank) {
          const je = await createPostedJournal({
            organizationId: oid,
            entryDate: parsed.data.paymentDate,
            description: `Payment ${invoice.invoiceNumber}`,
            reference: parsed.data.reference ?? invoice.invoiceNumber,
            sourceType: 'payment',
            sourceId: invoice.id,
            lines: [
              {
                ledgerAccountId: bank.id,
                description: 'Bank',
                debitAmount: parsed.data.amount,
                creditAmount: 0
              },
              {
                ledgerAccountId: ar.id,
                description: 'Clear debtors',
                debitAmount: 0,
                creditAmount: parsed.data.amount
              }
            ],
            postedByUserId: userId(req)
          });
          journalEntryId = je.id;
        }
      }

      const payRepo = AppDataSource.getRepository(AccInvoicePayment);
      const payment = await payRepo.save(
        payRepo.create({
          organizationId: oid,
          invoiceId: invoice.id,
          paymentDate: new Date(parsed.data.paymentDate),
          amount: parsed.data.amount,
          bankAccountId: parsed.data.bankAccountId ?? null,
          reference: parsed.data.reference ?? null,
          notes: parsed.data.notes ?? null,
          journalEntryId,
          createdBy: userId(req)
        })
      );

      invoice.paidAmount = roundMoney(Number(invoice.paidAmount || 0) + parsed.data.amount);
      if (invoice.paidAmount >= Number(invoice.total) - 0.01) {
        invoice.status = 'paid';
        invoice.paidAt = new Date();
      } else {
        invoice.status = 'partially_paid';
      }
      await invRepo.save(invoice);

      res.status(201).json({ data: { payment, invoice } });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async customerStatement(req: Request, res: Response): Promise<void> {
    try {
      const customerId = req.params.customerId;
      const oid = orgId(req);
      const customer = await AppDataSource.getRepository(Customer).findOne({
        where: { id: customerId }
      });
      if (!customer) {
        res.status(404).json({ error: { message: 'Customer not found' } });
        return;
      }
      const invoices = await AppDataSource.getRepository(Invoice).find({
        where: { customerId, organizationId: oid },
        order: { invoiceDate: 'ASC' }
      });
      const payments = await AppDataSource.getRepository(AccInvoicePayment)
        .createQueryBuilder('p')
        .innerJoin('p.invoice', 'i')
        .where('i.customer_id = :cid', { cid: customerId })
        .andWhere('p.organization_id = :oid', { oid })
        .orderBy('p.payment_date', 'ASC')
        .getMany();
      const creditNotes = await AppDataSource.getRepository(CreditNote).find({
        where: { organizationId: oid, customerId } as any
      });
      const openBalance = roundMoney(
        invoices.reduce((s, i) => s + (Number(i.total) - Number(i.paidAmount || 0)), 0)
      );
      res.json({
        data: {
          customer,
          invoices,
          payments,
          creditNotes,
          openBalance
        }
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async listCreditNotes(req: Request, res: Response): Promise<void> {
    try {
      const items = await AppDataSource.getRepository(CreditNote).find({
        where: { organizationId: orgId(req) },
        relations: ['lines', 'invoice'],
        order: { creditNoteDate: 'DESC' },
        take: 100
      });
      res.json({ data: items });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async createCreditNote(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        invoiceId: z.string(),
        creditNoteNumber: z.string().min(1),
        creditNoteDate: z.string(),
        reason: z.string().optional(),
        documentUrl: z.string().optional().nullable(),
        lines: z.array(lineSchema).min(1)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const invoice = await AppDataSource.getRepository(Invoice).findOne({
        where: { id: parsed.data.invoiceId }
      });
      if (!invoice) {
        res.status(404).json({ error: { message: 'Invoice not found' } });
        return;
      }
      let subtotal = 0;
      let taxAmount = 0;
      const built: Partial<CreditNoteLine>[] = [];
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
          taxRate: vat.taxRate,
          taxAmount: vat.taxAmount,
          lineTotal: vat.grossAmount,
          vatCodeId: vat.vatCodeId
        });
      }
      const cnRepo = AppDataSource.getRepository(CreditNote);
      const cn = await cnRepo.save(
        cnRepo.create({
          organizationId: oid,
          invoiceId: invoice.id,
          customerId: invoice.customerId,
          creditNoteNumber: parsed.data.creditNoteNumber,
          creditNoteDate: new Date(parsed.data.creditNoteDate),
          subtotal: roundMoney(subtotal),
          taxAmount: roundMoney(taxAmount),
          total: roundMoney(subtotal + taxAmount),
          reason: parsed.data.reason,
          documentUrl: parsed.data.documentUrl ?? null,
          status: 'draft',
          createdBy: userId(req) ?? undefined
        })
      );
      const lineRepo = AppDataSource.getRepository(CreditNoteLine);
      for (const b of built) {
        await lineRepo.save(lineRepo.create({ ...b, creditNoteId: cn.id } as any));
      }
      res.status(201).json({
        data: await cnRepo.findOne({ where: { id: cn.id }, relations: ['lines'] })
      });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async listRecurring(req: Request, res: Response): Promise<void> {
    try {
      const items = await AppDataSource.getRepository(AccRecurringInvoice).find({
        where: { organizationId: orgId(req) },
        order: { nextRunDate: 'ASC' }
      });
      res.json({ data: items });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async createRecurring(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        organizationId: z.string().optional(),
        customerId: z.string(),
        templateName: z.string().min(1),
        frequency: z.enum(['weekly', 'monthly', 'quarterly', 'yearly']).optional(),
        nextRunDate: z.string(),
        endDate: z.string().optional().nullable(),
        currency: z.string().length(3).optional(),
        paymentTerms: z.string().optional(),
        lines: z.array(lineSchema).min(1)
      });
      const parsed = schema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const oid = parsed.data.organizationId || orgId(req);
      const repo = AppDataSource.getRepository(AccRecurringInvoice);
      const item = await repo.save(
        repo.create({
          organizationId: oid,
          customerId: parsed.data.customerId,
          templateName: parsed.data.templateName,
          frequency: parsed.data.frequency ?? 'monthly',
          nextRunDate: new Date(parsed.data.nextRunDate),
          endDate: parsed.data.endDate ? new Date(parsed.data.endDate) : null,
          currency: parsed.data.currency ?? 'GBP',
          paymentTerms: parsed.data.paymentTerms ?? null,
          linesJson: parsed.data.lines as any,
          createdBy: userId(req)
        })
      );
      res.status(201).json({ data: item });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }

  static async runRecurring(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(AccRecurringInvoice);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item || !item.isActive) {
        res.status(404).json({ error: { message: 'Recurring invoice not found/active' } });
        return;
      }
      const lines = (item.linesJson || []) as any[];
      const fakeReq = {
        body: {
          organizationId: item.organizationId,
          customerId: item.customerId,
          invoiceNumber: `REC-${item.id}-${Date.now().toString(36).toUpperCase()}`,
          invoiceDate: new Date().toISOString().slice(0, 10),
          currency: item.currency,
          paymentTerms: item.paymentTerms ?? undefined,
          lines
        },
        query: {},
        user: (req as any).user
      } as any;
      // create via same logic
      let subtotal = 0;
      let taxAmount = 0;
      const builtLines: Partial<InvoiceLine>[] = [];
      for (const line of lines) {
        const vat = await calcLineVat(item.organizationId, {
          quantity: Number(line.quantity),
          unitPrice: Number(line.unitPrice),
          vatCodeId: line.vatCodeId,
          taxRate: line.taxRate
        });
        subtotal += vat.netAmount;
        taxAmount += vat.taxAmount;
        builtLines.push({
          description: line.description,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          taxRate: vat.taxRate,
          taxAmount: vat.taxAmount,
          lineTotal: vat.grossAmount,
          vatCodeId: vat.vatCodeId,
          discountPercent: 0,
          discountAmount: 0
        });
      }
      const invRepo = AppDataSource.getRepository(Invoice);
      const invoice = await invRepo.save(
        invRepo.create({
          organizationId: item.organizationId,
          customerId: item.customerId,
          invoiceNumber: `REC-${item.id}-${Date.now().toString(36).toUpperCase()}`,
          invoiceDate: new Date(),
          currency: item.currency,
          paymentTerms: item.paymentTerms ?? undefined,
          recurringInvoiceId: item.id,
          subtotal: roundMoney(subtotal),
          taxAmount: roundMoney(taxAmount),
          total: roundMoney(subtotal + taxAmount),
          paidAmount: 0,
          status: 'draft',
          createdBy: userId(req) ?? undefined
        })
      );
      const lineRepo = AppDataSource.getRepository(InvoiceLine);
      for (const bl of builtLines) {
        await lineRepo.save(lineRepo.create({ ...bl, invoiceId: invoice.id } as any));
      }

      const next = new Date(item.nextRunDate);
      if (item.frequency === 'weekly') next.setDate(next.getDate() + 7);
      else if (item.frequency === 'monthly') next.setMonth(next.getMonth() + 1);
      else if (item.frequency === 'quarterly') next.setMonth(next.getMonth() + 3);
      else next.setFullYear(next.getFullYear() + 1);
      item.nextRunDate = next;
      item.lastInvoiceId = invoice.id;
      if (item.endDate && next > new Date(item.endDate)) item.isActive = false;
      await repo.save(item);

      void fakeReq;
      res.status(201).json({ data: { invoice, recurring: item } });
    } catch (e: any) {
      res.status(500).json({ error: { message: e.message } });
    }
  }
}
