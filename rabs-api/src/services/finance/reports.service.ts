import { AppDataSource } from '@config/data-source.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';
import { Invoice } from '@entities/finance/Invoice.js';
import { AccSupplierBill } from '@entities/finance/AccSupplierBill.js';
import { BankAccount } from '@entities/finance/BankAccount.js';
import { VatReturn } from '@entities/finance/VatReturn.js';
import { AccOrgSettings } from '@entities/finance/AccOrgSettings.js';
import { roundMoney } from './vatCalc.service.js';

type Period = { from: string; to: string; organizationId: string };

async function glBalances(period: Period) {
  const rows: Array<{
    id: string;
    account_code: string;
    account_name: string;
    account_type: string;
    debit: string;
    credit: string;
  }> = await AppDataSource.query(
    `
    SELECT la.id, la.account_code, la.account_name, la.account_type,
           COALESCE(SUM(jl.debit_amount),0) AS debit,
           COALESCE(SUM(jl.credit_amount),0) AS credit
    FROM ledger_accounts la
    INNER JOIN chart_of_accounts coa ON coa.id = la.chart_of_accounts_id
    LEFT JOIN journal_lines jl ON jl.ledger_account_id = la.id
    LEFT JOIN journal_entries je ON je.id = jl.journal_entry_id
      AND je.status = 'posted'
      AND je.entry_date BETWEEN ? AND ?
      AND je.organization_id = ?
    WHERE coa.organization_id = ?
      AND la.is_active = 1
    GROUP BY la.id, la.account_code, la.account_name, la.account_type
    ORDER BY la.account_code
    `,
    [period.from, period.to, period.organizationId, period.organizationId]
  );
  return rows.map((r) => {
    const debit = Number(r.debit);
    const credit = Number(r.credit);
    const type = r.account_type;
    const isDebitNormal = ['asset', 'expense', 'cost_of_goods_sold'].includes(type);
    const balance = isDebitNormal ? debit - credit : credit - debit;
    return {
      ledgerAccountId: r.id,
      accountCode: r.account_code,
      accountName: r.account_name,
      accountType: type,
      debit: roundMoney(debit),
      credit: roundMoney(credit),
      balance: roundMoney(balance)
    };
  });
}

export async function trialBalance(period: Period) {
  const accounts = await glBalances(period);
  const totalDebit = roundMoney(accounts.reduce((s, a) => s + a.debit, 0));
  const totalCredit = roundMoney(accounts.reduce((s, a) => s + a.credit, 0));
  return {
    from: period.from,
    to: period.to,
    accounts: accounts.filter((a) => a.debit !== 0 || a.credit !== 0),
    totalDebit,
    totalCredit,
    balanced: Math.abs(totalDebit - totalCredit) < 0.02
  };
}

export async function profitAndLoss(period: Period) {
  const accounts = await glBalances(period);
  const revenue = accounts.filter((a) => a.accountType === 'revenue');
  const cogs = accounts.filter((a) => a.accountType === 'cost_of_goods_sold');
  const expenses = accounts.filter((a) => a.accountType === 'expense');
  const totalRevenue = roundMoney(revenue.reduce((s, a) => s + a.balance, 0));
  const totalCogs = roundMoney(cogs.reduce((s, a) => s + a.balance, 0));
  const totalExpenses = roundMoney(expenses.reduce((s, a) => s + a.balance, 0));
  const grossProfit = roundMoney(totalRevenue - totalCogs);
  const netProfit = roundMoney(grossProfit - totalExpenses);
  return {
    from: period.from,
    to: period.to,
    revenue,
    costOfSales: cogs,
    expenses,
    totalRevenue,
    totalCogs,
    grossProfit,
    totalExpenses,
    netProfit
  };
}

export async function balanceSheet(asOf: { organizationId: string; to: string }) {
  const accounts = await glBalances({
    organizationId: asOf.organizationId,
    from: '1970-01-01',
    to: asOf.to
  });
  const assets = accounts.filter((a) => a.accountType === 'asset');
  const liabilities = accounts.filter((a) => a.accountType === 'liability');
  const equity = accounts.filter((a) => a.accountType === 'equity');
  // Roll P&L into retained earnings for MVP
  const pl = await profitAndLoss({
    organizationId: asOf.organizationId,
    from: '1970-01-01',
    to: asOf.to
  });
  const totalAssets = roundMoney(assets.reduce((s, a) => s + a.balance, 0));
  const totalLiabilities = roundMoney(liabilities.reduce((s, a) => s + a.balance, 0));
  const totalEquity = roundMoney(equity.reduce((s, a) => s + a.balance, 0) + pl.netProfit);
  return {
    asOf: asOf.to,
    assets,
    liabilities,
    equity,
    retainedEarnings: pl.netProfit,
    totalAssets,
    totalLiabilities,
    totalEquity,
    balanced: Math.abs(totalAssets - (totalLiabilities + totalEquity)) < 0.05
  };
}

/** Indirect cash flow MVP from P&L + working capital deltas (simplified). */
export async function cashFlowIndirect(period: Period) {
  const pl = await profitAndLoss(period);
  const banks = await AppDataSource.getRepository(BankAccount).find({
    where: { organization: { id: period.organizationId } } as any
  });
  const cash = roundMoney(banks.reduce((s, b) => s + Number(b.currentBalance || 0), 0));
  return {
    from: period.from,
    to: period.to,
    netProfit: pl.netProfit,
    adjustments: [{ label: 'Depreciation (see fixed assets)', amount: 0 }],
    operatingCashFlow: pl.netProfit,
    investingCashFlow: 0,
    financingCashFlow: 0,
    netChangeInCash: pl.netProfit,
    cashAtBankApprox: cash,
    note: 'MVP indirect cash flow — refine with period WC movements'
  };
}

export async function agedReceivables(organizationId: string, asOf: string) {
  const invoices = await AppDataSource.getRepository(Invoice)
    .createQueryBuilder('i')
    .leftJoinAndSelect('i.customer', 'c')
    .where('i.organization_id = :orgId', { orgId: organizationId })
    .andWhere('i.status NOT IN (:...st)', { st: ['cancelled', 'written_off', 'paid'] })
    .getMany();

  const buckets = (due: Date | undefined, balance: number) => {
    const days = due
      ? Math.floor((new Date(asOf).getTime() - new Date(due).getTime()) / 86400000)
      : 0;
    if (days <= 0) return { current: balance, d30: 0, d60: 0, d90: 0, older: 0 };
    if (days <= 30) return { current: 0, d30: balance, d60: 0, d90: 0, older: 0 };
    if (days <= 60) return { current: 0, d30: 0, d60: balance, d90: 0, older: 0 };
    if (days <= 90) return { current: 0, d30: 0, d60: 0, d90: balance, older: 0 };
    return { current: 0, d30: 0, d60: 0, d90: 0, older: balance };
  };

  return invoices.map((inv) => {
    const balance = roundMoney(Number(inv.total) - Number(inv.paidAmount || 0));
    return {
      invoiceId: inv.id,
      invoiceNumber: inv.invoiceNumber,
      customerId: inv.customerId,
      customerName:
        (inv as any).customer?.companyName ||
        [((inv as any).customer?.firstName || ''), ((inv as any).customer?.lastName || '')]
          .join(' ')
          .trim() ||
        null,
      dueDate: inv.dueDate,
      balance,
      ...buckets(inv.dueDate, balance)
    };
  });
}

export async function agedPayables(organizationId: string, asOf: string) {
  const bills = await AppDataSource.getRepository(AccSupplierBill)
    .createQueryBuilder('b')
    .leftJoinAndSelect('b.supplier', 's')
    .where('b.organization_id = :orgId', { orgId: organizationId })
    .andWhere('b.status NOT IN (:...st)', { st: ['void', 'paid'] })
    .getMany();

  return bills.map((b) => {
    const balance = roundMoney(Number(b.total) - Number(b.paidAmount || 0));
    const due = b.dueDate ? new Date(b.dueDate) : undefined;
    const days = due
      ? Math.floor((new Date(asOf).getTime() - due.getTime()) / 86400000)
      : 0;
    let current = 0,
      d30 = 0,
      d60 = 0,
      d90 = 0,
      older = 0;
    if (days <= 0) current = balance;
    else if (days <= 30) d30 = balance;
    else if (days <= 60) d60 = balance;
    else if (days <= 90) d90 = balance;
    else older = balance;
    return {
      billId: b.id,
      billNumber: b.billNumber,
      supplierId: b.supplierId,
      supplierName: (b as any).supplier?.name ?? null,
      dueDate: b.dueDate,
      balance,
      current,
      d30,
      d60,
      d90,
      older
    };
  });
}

export async function generalLedger(period: Period & { ledgerAccountId?: string }) {
  const params: any[] = [period.from, period.to, period.organizationId];
  let accountFilter = '';
  if (period.ledgerAccountId) {
    accountFilter = ' AND la.id = ?';
    params.push(period.ledgerAccountId);
  }
  const rows = await AppDataSource.query(
    `
    SELECT je.id AS journal_id, je.journal_number, je.entry_date, je.description AS je_desc,
           la.account_code, la.account_name, jl.description AS line_desc,
           jl.debit_amount, jl.credit_amount
    FROM journal_lines jl
    INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
    INNER JOIN ledger_accounts la ON la.id = jl.ledger_account_id
    WHERE je.status = 'posted'
      AND je.entry_date BETWEEN ? AND ?
      AND je.organization_id = ?
      ${accountFilter}
    ORDER BY la.account_code, je.entry_date, je.id, jl.line_number
    `,
    params
  );
  return rows;
}

export async function draftVatReturn(period: Period) {
  const settings = await AppDataSource.getRepository(AccOrgSettings).findOne({
    where: { organizationId: period.organizationId }
  });

  const salesRows: Array<{ net: string; tax: string }> = await AppDataSource.query(
    `
    SELECT COALESCE(SUM(subtotal),0) AS net, COALESCE(SUM(tax_amount),0) AS tax
    FROM invoices
    WHERE organization_id = ?
      AND invoice_date BETWEEN ? AND ?
      AND status NOT IN ('cancelled','draft')
      AND posted_at IS NOT NULL
    `,
    [period.organizationId, period.from, period.to]
  );

  const purchaseRows: Array<{ net: string; tax: string }> = await AppDataSource.query(
    `
    SELECT COALESCE(SUM(subtotal),0) AS net, COALESCE(SUM(tax_amount),0) AS tax
    FROM acc_supplier_bills
    WHERE organization_id = ?
      AND bill_date BETWEEN ? AND ?
      AND status NOT IN ('void','draft')
      AND posted_at IS NOT NULL
    `,
    [period.organizationId, period.from, period.to]
  );

  const box6 = roundMoney(Number(salesRows[0]?.net || 0));
  const box1 = roundMoney(Number(salesRows[0]?.tax || 0));
  const box7 = roundMoney(Number(purchaseRows[0]?.net || 0));
  const box4 = roundMoney(Number(purchaseRows[0]?.tax || 0));
  const box2 = 0;
  const box3 = roundMoney(box1 + box2);
  const box5 = roundMoney(box3 - box4);
  const box8 = 0;
  const box9 = 0;

  const exportPayload = {
    periodStart: period.from,
    periodEnd: period.to,
    vatScheme: settings?.vatScheme ?? 'standard',
    boxes: {
      box1: box1,
      box2: box2,
      box3: box3,
      box4: box4,
      box5: box5,
      box6: box6,
      box7: box7,
      box8: box8,
      box9: box9
    },
    mtd: {
      support: true,
      liveSubmission: false,
      note: 'Structured VAT box export ready. Full HMRC MTD live RTI/VAT submit requires HMRC credentials.'
    }
  };

  return exportPayload;
}

export async function dashboardAggregates(organizationId: string) {
  const today = new Date().toISOString().slice(0, 10);
  const yearStart = `${new Date().getFullYear()}-01-01`;

  const banks = await AppDataSource.getRepository(BankAccount).find({
    where: { organization: { id: organizationId } } as any
  });
  const cash = roundMoney(banks.reduce((s, b) => s + Number(b.currentBalance || 0), 0));

  const pl = await profitAndLoss({ organizationId, from: yearStart, to: today });
  const vat = await draftVatReturn({
    organizationId,
    from: `${new Date().getFullYear()}-${String(Math.floor((new Date().getMonth()) / 3) * 3 + 1).padStart(2, '0')}-01`,
    to: today
  });

  const openInvoices: Array<{ c: string; total: string }> = await AppDataSource.query(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total - paid_amount),0) AS total
     FROM invoices WHERE organization_id = ? AND status NOT IN ('paid','cancelled','written_off')`,
    [organizationId]
  );
  const openBills: Array<{ c: string; total: string }> = await AppDataSource.query(
    `SELECT COUNT(*) AS c, COALESCE(SUM(total - paid_amount),0) AS total
     FROM acc_supplier_bills WHERE organization_id = ? AND status NOT IN ('paid','void')`,
    [organizationId]
  );

  const alerts: string[] = [];
  if (Number(openInvoices[0]?.total) > 0) alerts.push('Open customer invoices outstanding');
  if (Number(openBills[0]?.total) > 0) alerts.push('Open supplier bills outstanding');
  if (vat.boxes.box5 > 0) alerts.push(`VAT due (draft box 5): ${vat.boxes.box5}`);
  if (vat.boxes.box5 < 0) alerts.push(`VAT reclaim (draft box 5): ${Math.abs(vat.boxes.box5)}`);

  const coaCount = await AppDataSource.getRepository(LedgerAccount)
    .createQueryBuilder('la')
    .innerJoin('la.chartOfAccounts', 'coa')
    .where('coa.organization_id = :orgId', { orgId: organizationId })
    .getCount();
  if (coaCount === 0) alerts.push('UK chart of accounts not seeded');

  return {
    cash,
    incomeYtd: pl.totalRevenue,
    expensesYtd: roundMoney(pl.totalCogs + pl.totalExpenses),
    profitAndLoss: {
      grossProfit: pl.grossProfit,
      netProfit: pl.netProfit
    },
    vatDue: vat.boxes.box5,
    openInvoices: {
      count: Number(openInvoices[0]?.c || 0),
      balance: roundMoney(Number(openInvoices[0]?.total || 0))
    },
    openBills: {
      count: Number(openBills[0]?.c || 0),
      balance: roundMoney(Number(openBills[0]?.total || 0))
    },
    alerts
  };
}

export async function saveVatReturnDraft(period: Period, returnNumber: string) {
  const draft = await draftVatReturn(period);
  const repo = AppDataSource.getRepository(VatReturn);
  const org = { id: period.organizationId } as any;
  const entity = repo.create({
    organization: org,
    returnNumber,
    periodStart: new Date(period.from),
    periodEnd: new Date(period.to),
    vatDueSales: draft.boxes.box1,
    vatDueAcquisitions: draft.boxes.box2,
    vatReclaimed: draft.boxes.box4,
    totalValueSales: draft.boxes.box6,
    totalValuePurchases: draft.boxes.box7,
    totalValueGoodsSupplied: draft.boxes.box8,
    totalAcquisitions: draft.boxes.box9,
    box1: draft.boxes.box1,
    box2: draft.boxes.box2,
    box3: draft.boxes.box3,
    box4: draft.boxes.box4,
    box5: draft.boxes.box5,
    box6: draft.boxes.box6,
    box7: draft.boxes.box7,
    box8: draft.boxes.box8,
    box9: draft.boxes.box9,
    vatScheme: draft.vatScheme,
    exportJson: draft,
    status: 'draft'
  });
  return repo.save(entity);
}
