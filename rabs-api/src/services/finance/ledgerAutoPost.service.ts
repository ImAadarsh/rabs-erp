import { EntityManager } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import {
  createPostedJournal,
  findOpenFiscalPeriod,
  resolveAccountByCode,
  ymd,
  type JournalLineInput
} from './journalPosting.service.js';
import { appendAccAudit } from './accAudit.service.js';
import { roundMoney } from './vatCalc.service.js';

/**
 * Posts sales invoices and gateway/channel payments to the general ledger.
 *
 * Every automatic journal has a deterministic journal number (unique in
 * journal_entries), and the source row keeps the journal id, so a document can
 * never be posted twice even if two posting runs overlap.
 *
 *   Invoice:  Dr 1200 Trade Debtors (total) / Cr 4000 Sales (total - VAT) / Cr 2100 VAT output
 *   Payment:  Dr 1000 Bank (cash: 1100) net of fees, Dr 7000 Bank Charges (fee) / Cr 1200 Trade Debtors
 *   Invoice cancelled / written off, payment refunded / failed: mirror-image reversing journal.
 */

export const POSTABLE_INVOICE_STATUSES = ['sent', 'viewed', 'partially_paid', 'paid', 'overdue'];
export const REVERSED_INVOICE_STATUSES = ['cancelled', 'written_off'];
export const POSTABLE_PAYMENT_TYPES = ['sale', 'capture'];
export const REVERSED_PAYMENT_STATUSES = ['refunded', 'cancelled', 'failed', 'expired'];

export const ledgerJournalNumber = {
  invoice: (id: string | number) => `INV-POST-${id}`,
  invoiceReversal: (id: string | number) => `INV-REV-${id}`,
  payment: (id: string | number) => `PAY-POST-${id}`,
  paymentReversal: (id: string | number) => `PAY-REV-${id}`
};

export type PostOutcome = {
  status: 'posted' | 'already_posted' | 'skipped';
  reason?: string;
  journalEntryId?: string;
};

type InvoiceRow = {
  id: string;
  organization_id: string;
  invoice_number: string;
  invoice_date: string;
  currency: string;
  status: string;
  tax_amount: string;
  total: string;
  journal_entry_id: string | null;
};

type PaymentRow = {
  id: string;
  organization_id: string;
  order_id: string | null;
  invoice_id: string | null;
  payment_method: string;
  payment_type: string;
  amount: string;
  fee_amount: string | null;
  currency: string;
  status: string;
  payment_date: string;
  reference: string | null;
  transaction_id: string | null;
  journal_entry_id: string | null;
};

class DryRunRollback extends Error {}

async function inTransaction<T>(manager: EntityManager | undefined, fn: (em: EntityManager) => Promise<T>) {
  if (manager) return fn(manager);
  return AppDataSource.transaction(fn);
}

async function requireAccount(em: EntityManager, organizationId: string, code: string) {
  const account = await resolveAccountByCode(organizationId, code, em);
  if (!account) throw new Error(`Ledger account ${code} is missing from the chart of accounts`);
  return account;
}

async function openPeriodReason(em: EntityManager, organizationId: string, date: string) {
  const period = await findOpenFiscalPeriod(organizationId, new Date(date), em);
  return period ? null : `no open fiscal period covers ${date}`;
}

async function journalExists(em: EntityManager, journalNumber: string) {
  const rows = await em.query('SELECT id FROM journal_entries WHERE journal_number = ? LIMIT 1', [journalNumber]);
  return rows.length ? String(rows[0].id) : null;
}

/** Ledger lines for a sales invoice; revenue is total minus VAT so shipping and discounts stay balanced. */
export async function salesInvoiceJournalLines(
  em: EntityManager,
  invoice: { organizationId: string; total: number; taxAmount: number }
): Promise<JournalLineInput[]> {
  const total = roundMoney(invoice.total);
  const tax = roundMoney(invoice.taxAmount);
  const revenue = roundMoney(total - tax);
  const ar = await requireAccount(em, invoice.organizationId, '1200');
  const sales = await requireAccount(em, invoice.organizationId, '4000');
  const lines: JournalLineInput[] = [
    { ledgerAccountId: ar.id, description: 'Trade debtors', debitAmount: total, creditAmount: 0 },
    { ledgerAccountId: sales.id, description: 'Sales', debitAmount: 0, creditAmount: revenue }
  ];
  if (tax > 0) {
    const vat = await requireAccount(em, invoice.organizationId, '2100');
    lines.push({ ledgerAccountId: vat.id, description: 'VAT output', debitAmount: 0, creditAmount: tax });
  }
  return lines;
}

async function lockInvoice(em: EntityManager, invoiceId: string): Promise<InvoiceRow | null> {
  const rows: InvoiceRow[] = await em.query(
    `SELECT id, organization_id, invoice_number, DATE_FORMAT(invoice_date, '%Y-%m-%d') AS invoice_date,
            currency, status, tax_amount, total, journal_entry_id
     FROM invoices WHERE id = ? FOR UPDATE`,
    [invoiceId]
  );
  return rows[0] ?? null;
}

async function lockPayment(em: EntityManager, paymentId: string): Promise<PaymentRow | null> {
  const rows: PaymentRow[] = await em.query(
    `SELECT id, organization_id, order_id, invoice_id, payment_method, payment_type, amount, fee_amount,
            currency, status, DATE_FORMAT(payment_date, '%Y-%m-%d') AS payment_date, reference,
            transaction_id, journal_entry_id
     FROM payments WHERE id = ? FOR UPDATE`,
    [paymentId]
  );
  return rows[0] ?? null;
}

/**
 * Posts one sales invoice. `allowDraft` is for the explicit "Post" action, which
 * also issues a draft invoice; automatic posting only takes issued invoices.
 */
export async function postInvoiceToLedger(
  invoiceId: string,
  opts: { actorUserId?: string | null; allowDraft?: boolean; manager?: EntityManager } = {}
): Promise<PostOutcome> {
  return inTransaction(opts.manager, async (em) => {
    const inv = await lockInvoice(em, invoiceId);
    if (!inv) return { status: 'skipped', reason: 'invoice not found' };
    if (inv.journal_entry_id) return { status: 'already_posted', journalEntryId: String(inv.journal_entry_id) };

    const statusOk =
      POSTABLE_INVOICE_STATUSES.includes(inv.status) || (opts.allowDraft && inv.status === 'draft');
    if (!statusOk) return { status: 'skipped', reason: `status ${inv.status}` };
    if (String(inv.currency || 'GBP').toUpperCase() !== 'GBP') {
      return { status: 'skipped', reason: `currency ${inv.currency} (ledger is GBP)` };
    }
    const total = roundMoney(Number(inv.total) || 0);
    const tax = roundMoney(Number(inv.tax_amount) || 0);
    if (total <= 0) return { status: 'skipped', reason: 'total is zero or negative' };
    if (tax < 0 || tax > total) return { status: 'skipped', reason: 'VAT amount is inconsistent with the total' };

    const periodIssue = await openPeriodReason(em, inv.organization_id, inv.invoice_date);
    if (periodIssue) return { status: 'skipped', reason: periodIssue };

    const existing = await journalExists(em, ledgerJournalNumber.invoice(inv.id));
    if (existing) {
      await em.query('UPDATE invoices SET journal_entry_id = ?, posted_at = COALESCE(posted_at, NOW()) WHERE id = ?', [
        existing,
        inv.id
      ]);
      return { status: 'already_posted', journalEntryId: existing };
    }

    const journal = await createPostedJournal(
      {
        organizationId: inv.organization_id,
        entryDate: inv.invoice_date,
        description: `Sales invoice ${inv.invoice_number}`,
        reference: inv.invoice_number,
        sourceType: 'invoice',
        sourceId: inv.id,
        journalNumber: ledgerJournalNumber.invoice(inv.id),
        lines: await salesInvoiceJournalLines(em, { organizationId: inv.organization_id, total, taxAmount: tax }),
        postedByUserId: opts.actorUserId ?? null
      },
      em
    );

    await em.query(
      `UPDATE invoices SET journal_entry_id = ?, posted_at = NOW(),
              status = IF(status = 'draft', 'sent', status), sent_at = IF(status = 'draft', COALESCE(sent_at, NOW()), sent_at)
       WHERE id = ?`,
      [journal.id, inv.id]
    );
    // The audit log is written outside this transaction, so skip it when a caller-owned
    // transaction (e.g. a dry run) may still roll back.
    if (!opts.manager) {
      await appendAccAudit({
        organizationId: inv.organization_id,
        entityType: 'invoice',
        entityId: inv.id,
        action: 'post',
        actorUserId: opts.actorUserId ?? null,
        payload: { journalEntryId: journal.id, auto: !opts.allowDraft }
      });
    }
    return { status: 'posted', journalEntryId: String(journal.id) };
  });
}

async function invoiceForPayment(em: EntityManager, p: PaymentRow) {
  const rows: Array<{ id: string; journal_entry_id: string | null; status: string }> = p.invoice_id
    ? await em.query('SELECT id, journal_entry_id, status FROM invoices WHERE id = ?', [p.invoice_id])
    : p.order_id
      ? await em.query('SELECT id, journal_entry_id, status FROM invoices WHERE order_id = ? LIMIT 1', [p.order_id])
      : [];
  return rows[0] ?? null;
}

/** Posts a completed customer receipt against its (posted) invoice. */
export async function postPaymentToLedger(
  paymentId: string,
  opts: { actorUserId?: string | null; manager?: EntityManager } = {}
): Promise<PostOutcome> {
  return inTransaction(opts.manager, async (em) => {
    const p = await lockPayment(em, paymentId);
    if (!p) return { status: 'skipped', reason: 'payment not found' };
    if (p.journal_entry_id) return { status: 'already_posted', journalEntryId: String(p.journal_entry_id) };
    if (p.status !== 'completed') return { status: 'skipped', reason: `status ${p.status}` };
    if (!POSTABLE_PAYMENT_TYPES.includes(p.payment_type)) {
      return { status: 'skipped', reason: `payment type ${p.payment_type}` };
    }
    if (String(p.currency || 'GBP').toUpperCase() !== 'GBP') {
      return { status: 'skipped', reason: `currency ${p.currency} (ledger is GBP)` };
    }
    const amount = roundMoney(Number(p.amount) || 0);
    const fee = roundMoney(Math.max(0, Number(p.fee_amount) || 0));
    if (amount <= 0) return { status: 'skipped', reason: 'amount is zero or negative' };
    if (fee >= amount) return { status: 'skipped', reason: 'fee is not less than the amount' };

    const invoice = await invoiceForPayment(em, p);
    if (!invoice) return { status: 'skipped', reason: 'no invoice for this payment' };
    if (!invoice.journal_entry_id) return { status: 'skipped', reason: 'invoice not posted to the ledger' };

    const periodIssue = await openPeriodReason(em, p.organization_id, p.payment_date);
    if (periodIssue) return { status: 'skipped', reason: periodIssue };

    const existing = await journalExists(em, ledgerJournalNumber.payment(p.id));
    if (existing) {
      await em.query('UPDATE payments SET journal_entry_id = ? WHERE id = ?', [existing, p.id]);
      return { status: 'already_posted', journalEntryId: existing };
    }

    const cashCode = p.payment_method === 'cash' ? '1100' : '1000';
    const cash = await requireAccount(em, p.organization_id, cashCode);
    const ar = await requireAccount(em, p.organization_id, '1200');
    const lines: JournalLineInput[] = [
      { ledgerAccountId: cash.id, description: cashCode === '1100' ? 'Cash received' : 'Bank receipt', debitAmount: roundMoney(amount - fee), creditAmount: 0 }
    ];
    if (fee > 0) {
      const charges = await requireAccount(em, p.organization_id, '7000');
      lines.push({ ledgerAccountId: charges.id, description: 'Payment fees', debitAmount: fee, creditAmount: 0 });
    }
    lines.push({ ledgerAccountId: ar.id, description: 'Clear debtors', debitAmount: 0, creditAmount: amount });

    const reference = (p.reference || p.transaction_id || `PAY-${p.id}`).slice(0, 255);
    const journal = await createPostedJournal(
      {
        organizationId: p.organization_id,
        entryDate: p.payment_date,
        description: `Customer payment ${p.id} (${p.payment_method})`,
        reference,
        sourceType: 'payment',
        sourceId: p.id,
        journalNumber: ledgerJournalNumber.payment(p.id),
        lines,
        postedByUserId: opts.actorUserId ?? null
      },
      em
    );
    await em.query('UPDATE payments SET journal_entry_id = ? WHERE id = ?', [journal.id, p.id]);
    return { status: 'posted', journalEntryId: String(journal.id) };
  });
}

/** Mirror-image of an automatic journal, dated today (the day the document was cancelled/refunded). */
async function postReversal(
  em: EntityManager,
  args: {
    organizationId: string;
    originalJournalId: string;
    journalNumber: string;
    description: string;
    sourceType: 'invoice' | 'payment';
    sourceId: string;
    actorUserId?: string | null;
  }
): Promise<PostOutcome> {
  const existing = await journalExists(em, args.journalNumber);
  if (existing) return { status: 'already_posted', journalEntryId: existing };
  const original: Array<{ ledger_account_id: string; debit_amount: string; credit_amount: string; status: string }> =
    await em.query(
      `SELECT jl.ledger_account_id, jl.debit_amount, jl.credit_amount, je.status
       FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
       WHERE je.id = ? ORDER BY jl.line_number`,
      [args.originalJournalId]
    );
  if (!original.length) return { status: 'skipped', reason: 'original journal not found' };
  if (original[0].status !== 'posted') return { status: 'skipped', reason: `original journal is ${original[0].status}` };

  const today = ymd(new Date());
  const periodIssue = await openPeriodReason(em, args.organizationId, today);
  if (periodIssue) return { status: 'skipped', reason: periodIssue };

  const journal = await createPostedJournal(
    {
      organizationId: args.organizationId,
      entryDate: today,
      description: args.description,
      reference: args.journalNumber,
      sourceType: args.sourceType,
      sourceId: args.sourceId,
      entryType: 'reversing',
      journalNumber: args.journalNumber,
      lines: original.map((l) => ({
        ledgerAccountId: String(l.ledger_account_id),
        description: 'Reversal',
        debitAmount: Number(l.credit_amount),
        creditAmount: Number(l.debit_amount)
      })),
      postedByUserId: args.actorUserId ?? null
    },
    em
  );
  return { status: 'posted', journalEntryId: String(journal.id) };
}

export async function reverseInvoiceIfVoided(
  invoiceId: string,
  opts: { actorUserId?: string | null; manager?: EntityManager } = {}
): Promise<PostOutcome> {
  return inTransaction(opts.manager, async (em) => {
    const inv = await lockInvoice(em, invoiceId);
    if (!inv) return { status: 'skipped', reason: 'invoice not found' };
    if (!inv.journal_entry_id) return { status: 'skipped', reason: 'invoice not posted' };
    if (!REVERSED_INVOICE_STATUSES.includes(inv.status)) return { status: 'skipped', reason: `status ${inv.status}` };
    return postReversal(em, {
      organizationId: inv.organization_id,
      originalJournalId: String(inv.journal_entry_id),
      journalNumber: ledgerJournalNumber.invoiceReversal(inv.id),
      description: `Reverse sales invoice ${inv.invoice_number} (${inv.status.replace('_', ' ')})`,
      sourceType: 'invoice',
      sourceId: inv.id,
      actorUserId: opts.actorUserId
    });
  });
}

export async function reversePaymentIfVoided(
  paymentId: string,
  opts: { actorUserId?: string | null; manager?: EntityManager } = {}
): Promise<PostOutcome> {
  return inTransaction(opts.manager, async (em) => {
    const p = await lockPayment(em, paymentId);
    if (!p) return { status: 'skipped', reason: 'payment not found' };
    if (!p.journal_entry_id) return { status: 'skipped', reason: 'payment not posted' };
    if (!REVERSED_PAYMENT_STATUSES.includes(p.status)) return { status: 'skipped', reason: `status ${p.status}` };
    return postReversal(em, {
      organizationId: p.organization_id,
      originalJournalId: String(p.journal_entry_id),
      journalNumber: ledgerJournalNumber.paymentReversal(p.id),
      description: `Reverse customer payment ${p.id} (${p.status})`,
      sourceType: 'payment',
      sourceId: p.id,
      actorUserId: opts.actorUserId
    });
  });
}

/**
 * Before an invoice or payment row is deleted, void its automatic journals so the
 * ledger no longer counts it. Voided journals are renamed to free the deterministic
 * number, so the receipts can be posted again if the order is re-invoiced.
 */
export async function voidLedgerForDeletedDocument(kind: 'invoice' | 'payment', id: string): Promise<number> {
  return AppDataSource.transaction(async (em) => {
    const numbers =
      kind === 'invoice'
        ? [ledgerJournalNumber.invoice(id), ledgerJournalNumber.invoiceReversal(id)]
        : [ledgerJournalNumber.payment(id), ledgerJournalNumber.paymentReversal(id)];
    const paymentIds: string[] = [];
    if (kind === 'invoice') {
      const rows: Array<{ id: string }> = await em.query(
        `SELECT p.id FROM payments p INNER JOIN invoices i ON (p.invoice_id = i.id OR (p.invoice_id IS NULL AND p.order_id = i.order_id))
         WHERE i.id = ?`,
        [id]
      );
      for (const r of rows) {
        paymentIds.push(String(r.id));
        numbers.push(ledgerJournalNumber.payment(r.id), ledgerJournalNumber.paymentReversal(r.id));
      }
    } else {
      paymentIds.push(id);
    }
    const result = await em.query(
      `UPDATE journal_entries SET status = 'voided', journal_number = CONCAT(journal_number, '-VOID-', id)
       WHERE status = 'posted' AND journal_number IN (${numbers.map(() => '?').join(',')})`,
      numbers
    );
    if (paymentIds.length) {
      await em.query(`UPDATE payments SET journal_entry_id = NULL WHERE id IN (${paymentIds.map(() => '?').join(',')})`, paymentIds);
    }
    return Number(result?.affectedRows ?? 0);
  });
}

/** Brings one invoice and its order's receipts into line with the ledger. Never throws. */
export async function syncInvoiceLedger(invoiceId: string, actorUserId?: string | null) {
  try {
    await postInvoiceToLedger(invoiceId, { actorUserId });
    await reverseInvoiceIfVoided(invoiceId, { actorUserId });
    const payments: Array<{ id: string }> = await AppDataSource.query(
      `SELECT p.id FROM payments p INNER JOIN invoices i ON (p.invoice_id = i.id OR (p.invoice_id IS NULL AND p.order_id = i.order_id))
       WHERE i.id = ?`,
      [invoiceId]
    );
    for (const p of payments) await syncPaymentLedger(String(p.id), actorUserId);
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error(`[ledger] invoice ${invoiceId}: ${e?.message || e}`);
  }
}

/** Posts or reverses one payment as its status requires. Never throws. */
export async function syncPaymentLedger(paymentId: string, actorUserId?: string | null) {
  try {
    await postPaymentToLedger(paymentId, { actorUserId });
    await reversePaymentIfVoided(paymentId, { actorUserId });
  } catch (e: any) {
    // eslint-disable-next-line no-console
    console.error(`[ledger] payment ${paymentId}: ${e?.message || e}`);
  }
}

export type SweepReport = {
  dryRun: boolean;
  invoices: { posted: number; alreadyPosted: number; skipped: Record<string, number>; errors: string[] };
  payments: { posted: number; alreadyPosted: number; skipped: Record<string, number>; errors: string[] };
  reversals: { invoices: number; payments: number; skipped: Record<string, number>; errors: string[] };
};

function tally(bucket: { posted: number; alreadyPosted: number; skipped: Record<string, number> }, o: PostOutcome) {
  if (o.status === 'posted') bucket.posted++;
  else if (o.status === 'already_posted') bucket.alreadyPosted++;
  else bucket.skipped[o.reason || 'skipped'] = (bucket.skipped[o.reason || 'skipped'] || 0) + 1;
}

/**
 * Posts every eligible unposted invoice and payment, then reverses posted
 * documents that have since been cancelled/refunded. Idempotent. With dryRun
 * the whole run happens in one transaction that is rolled back.
 */
export async function runLedgerSweep(opts: { organizationId?: string; dryRun?: boolean } = {}): Promise<SweepReport> {
  const report: SweepReport = {
    dryRun: Boolean(opts.dryRun),
    invoices: { posted: 0, alreadyPosted: 0, skipped: {}, errors: [] },
    payments: { posted: 0, alreadyPosted: 0, skipped: {}, errors: [] },
    reversals: { invoices: 0, payments: 0, skipped: {}, errors: [] }
  };
  const orgFilter = opts.organizationId ? ' AND organization_id = ?' : '';
  const orgParams = opts.organizationId ? [opts.organizationId] : [];

  const run = async (em?: EntityManager) => {
    const q = (sql: string, params: unknown[]) => (em ?? AppDataSource).query(sql, params);
    const invoices: Array<{ id: string }> = await q(
      `SELECT id FROM invoices WHERE journal_entry_id IS NULL AND status IN (${POSTABLE_INVOICE_STATUSES.map(() => '?').join(',')})${orgFilter}
       ORDER BY invoice_date, id`,
      [...POSTABLE_INVOICE_STATUSES, ...orgParams]
    );
    for (const { id } of invoices) {
      try {
        tally(report.invoices, await postInvoiceToLedger(String(id), { manager: em }));
      } catch (e: any) {
        report.invoices.errors.push(`invoice ${id}: ${e?.message || e}`);
      }
    }

    const payments: Array<{ id: string }> = await q(
      `SELECT id FROM payments WHERE journal_entry_id IS NULL AND status = 'completed'${orgFilter} ORDER BY payment_date, id`,
      orgParams
    );
    for (const { id } of payments) {
      try {
        tally(report.payments, await postPaymentToLedger(String(id), { manager: em }));
      } catch (e: any) {
        report.payments.errors.push(`payment ${id}: ${e?.message || e}`);
      }
    }

    const voidedInvoices: Array<{ id: string }> = await q(
      `SELECT i.id FROM invoices i
       WHERE i.journal_entry_id IS NOT NULL AND i.status IN (${REVERSED_INVOICE_STATUSES.map(() => '?').join(',')})${orgFilter.replace('organization_id', 'i.organization_id')}
         AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.journal_number = CONCAT('INV-REV-', i.id))`,
      [...REVERSED_INVOICE_STATUSES, ...orgParams]
    );
    for (const { id } of voidedInvoices) {
      try {
        const o = await reverseInvoiceIfVoided(String(id), { manager: em });
        if (o.status === 'posted') report.reversals.invoices++;
        else if (o.status === 'skipped') report.reversals.skipped[o.reason || 'skipped'] = (report.reversals.skipped[o.reason || 'skipped'] || 0) + 1;
      } catch (e: any) {
        report.reversals.errors.push(`invoice ${id}: ${e?.message || e}`);
      }
    }

    const voidedPayments: Array<{ id: string }> = await q(
      `SELECT p.id FROM payments p
       WHERE p.journal_entry_id IS NOT NULL AND p.status IN (${REVERSED_PAYMENT_STATUSES.map(() => '?').join(',')})${orgFilter.replace('organization_id', 'p.organization_id')}
         AND NOT EXISTS (SELECT 1 FROM journal_entries je WHERE je.journal_number = CONCAT('PAY-REV-', p.id))`,
      [...REVERSED_PAYMENT_STATUSES, ...orgParams]
    );
    for (const { id } of voidedPayments) {
      try {
        const o = await reversePaymentIfVoided(String(id), { manager: em });
        if (o.status === 'posted') report.reversals.payments++;
        else if (o.status === 'skipped') report.reversals.skipped[o.reason || 'skipped'] = (report.reversals.skipped[o.reason || 'skipped'] || 0) + 1;
      } catch (e: any) {
        report.reversals.errors.push(`payment ${id}: ${e?.message || e}`);
      }
    }
  };

  if (opts.dryRun) {
    try {
      await AppDataSource.transaction(async (em) => {
        await run(em);
        throw new DryRunRollback();
      });
    } catch (e) {
      if (!(e instanceof DryRunRollback)) throw e;
    }
  } else {
    await run();
  }
  return report;
}

let sweepTimer: NodeJS.Timeout | null = null;
let sweepRunning = false;

/** In-process periodic sweep (LEDGER_AUTOPOST_CRON=on, LEDGER_AUTOPOST_INTERVAL_MIN, default 15). */
export function startLedgerAutoPostCron() {
  if (String(process.env.LEDGER_AUTOPOST_CRON || '').toLowerCase() !== 'on' || sweepTimer) return;
  const minutes = Math.max(1, Number(process.env.LEDGER_AUTOPOST_INTERVAL_MIN) || 15);
  const tick = async () => {
    if (sweepRunning) return;
    sweepRunning = true;
    try {
      const r = await runLedgerSweep();
      const posted = r.invoices.posted + r.payments.posted + r.reversals.invoices + r.reversals.payments;
      const errors = [...r.invoices.errors, ...r.payments.errors, ...r.reversals.errors];
      if (posted || errors.length) {
        // eslint-disable-next-line no-console
        console.log(
          `[ledger] auto-post: invoices ${r.invoices.posted}, payments ${r.payments.posted}, reversals ${r.reversals.invoices + r.reversals.payments}` +
            (errors.length ? `, errors: ${errors.slice(0, 5).join('; ')}` : '')
        );
      }
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.error(`[ledger] auto-post sweep failed: ${e?.message || e}`);
    } finally {
      sweepRunning = false;
    }
  };
  setTimeout(tick, 60_000);
  sweepTimer = setInterval(tick, minutes * 60_000);
}
