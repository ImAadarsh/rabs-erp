import { AppDataSource } from '@config/data-source.js';
import { Invoice } from '@entities/finance/Invoice.js';
import { AccSupplierBill } from '@entities/finance/AccSupplierBill.js';
import {
  createPostedJournal,
  resolveAccountByCode
} from './journalPosting.service.js';
import { appendAccAudit } from './accAudit.service.js';
import { roundMoney } from './vatCalc.service.js';

export async function postSalesInvoice(
  invoiceId: string,
  actorUserId?: string | null
): Promise<Invoice> {
  return AppDataSource.transaction(async (em) => {
    const repo = em.getRepository(Invoice);
    const invoice = await repo.findOne({
      where: { id: invoiceId },
      relations: ['lines', 'organization']
    });
    if (!invoice) throw new Error('Invoice not found');
    if (invoice.journalEntryId) throw new Error('Invoice already posted');

    const orgId = invoice.organizationId;
    const ar = await resolveAccountByCode(orgId, '1200', em);
    const sales = await resolveAccountByCode(orgId, '4000', em);
    const vat = await resolveAccountByCode(orgId, '2100', em);
    if (!ar || !sales || !vat) throw new Error('Missing UK COA 1200/4000/2100 — seed accounting');

    const net = roundMoney(Number(invoice.subtotal) || 0);
    const tax = roundMoney(Number(invoice.taxAmount) || 0);
    const total = roundMoney(Number(invoice.total) || net + tax);

    const journal = await createPostedJournal(
      {
        organizationId: orgId,
        entryDate: invoice.invoiceDate,
        description: `Sales invoice ${invoice.invoiceNumber}`,
        reference: invoice.invoiceNumber,
        sourceType: 'invoice',
        sourceId: invoice.id,
        lines: [
          { ledgerAccountId: ar.id, description: 'Trade debtors', debitAmount: total, creditAmount: 0 },
          { ledgerAccountId: sales.id, description: 'Sales', debitAmount: 0, creditAmount: net },
          ...(tax > 0
            ? [{ ledgerAccountId: vat.id, description: 'VAT output', debitAmount: 0, creditAmount: tax }]
            : [])
        ],
        postedByUserId: actorUserId
      },
      em
    );

    invoice.journalEntryId = journal.id;
    invoice.postedAt = new Date();
    if (invoice.status === 'draft') invoice.status = 'sent';
    await repo.save(invoice);

    await appendAccAudit({
      organizationId: orgId,
      entityType: 'invoice',
      entityId: invoice.id,
      action: 'post',
      actorUserId,
      payload: { journalEntryId: journal.id }
    });

    return invoice;
  });
}

export async function postSupplierBill(
  billId: string,
  actorUserId?: string | null
): Promise<AccSupplierBill> {
  return AppDataSource.transaction(async (em) => {
    const repo = em.getRepository(AccSupplierBill);
    const bill = await repo.findOne({
      where: { id: billId },
      relations: ['lines']
    });
    if (!bill) throw new Error('Bill not found');
    if (bill.journalEntryId) throw new Error('Bill already posted');
    if (!['approved', 'pending_approval', 'draft'].includes(bill.status)) {
      throw new Error('Bill cannot be posted in current status');
    }

    const orgId = bill.organizationId;
    const ap = await resolveAccountByCode(orgId, '2000', em);
    const expense = await resolveAccountByCode(orgId, '6600', em);
    const vat = await resolveAccountByCode(orgId, '1300', em);
    if (!ap || !expense || !vat) throw new Error('Missing UK COA 2000/6600/1300 — seed accounting');

    const net = roundMoney(Number(bill.subtotal) || 0);
    const tax = roundMoney(Number(bill.taxAmount) || 0);
    const total = roundMoney(Number(bill.total) || net + tax);

    // Use first line ledger if set
    let expenseId = expense.id;
    const firstLine = bill.lines?.[0];
    if (firstLine?.ledgerAccountId) expenseId = firstLine.ledgerAccountId;

    const journal = await createPostedJournal(
      {
        organizationId: orgId,
        entryDate: bill.billDate,
        description: `Supplier bill ${bill.billNumber}`,
        reference: bill.billNumber,
        sourceType: 'other',
        sourceId: bill.id,
        lines: [
          { ledgerAccountId: expenseId, description: 'Purchase expense', debitAmount: net, creditAmount: 0 },
          ...(tax > 0
            ? [{ ledgerAccountId: vat.id, description: 'VAT input', debitAmount: tax, creditAmount: 0 }]
            : []),
          { ledgerAccountId: ap.id, description: 'Trade creditors', debitAmount: 0, creditAmount: total }
        ],
        postedByUserId: actorUserId
      },
      em
    );

    bill.journalEntryId = journal.id;
    bill.postedAt = new Date();
    if (bill.status === 'draft' || bill.status === 'pending_approval') bill.status = 'approved';
    await repo.save(bill);

    await appendAccAudit({
      organizationId: orgId,
      entityType: 'supplier_bill',
      entityId: bill.id,
      action: 'post',
      actorUserId,
      payload: { journalEntryId: journal.id }
    });

    return bill;
  });
}
