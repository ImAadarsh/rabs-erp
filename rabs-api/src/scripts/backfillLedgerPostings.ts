/**
 * Posts historic sales invoices and customer payments to the general ledger
 * (F02). Safe to re-run: every automatic journal has a deterministic journal
 * number and the invoice/payment row keeps the journal id, so nothing is
 * posted twice.
 *
 * --create-fiscal-years adds an open calendar-year period ("FY <year>") for
 * any year that holds a postable invoice or payment but no fiscal period.
 *
 * Usage (server): node dist/scripts/backfillLedgerPostings.js [--dry-run] [--org=<id>] [--create-fiscal-years]
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { runLedgerSweep, POSTABLE_INVOICE_STATUSES } from '../services/finance/ledgerAutoPost.service.js';

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : undefined;
}

async function ledgerSnapshot(orgId: string) {
  const [counts] = await AppDataSource.query(
    `SELECT
       (SELECT COUNT(*) FROM invoices WHERE organization_id = ?) AS invoices,
       (SELECT COUNT(*) FROM invoices WHERE organization_id = ? AND journal_entry_id IS NOT NULL) AS invoices_posted,
       (SELECT COUNT(*) FROM payments WHERE organization_id = ?) AS payments,
       (SELECT COUNT(*) FROM payments WHERE organization_id = ? AND journal_entry_id IS NOT NULL) AS payments_posted,
       (SELECT COALESCE(SUM(total - paid_amount),0) FROM invoices WHERE organization_id = ? AND status IN ('sent','viewed','partially_paid','overdue')) AS outstanding`,
    [orgId, orgId, orgId, orgId, orgId]
  );
  const balances: Array<{ account_code: string; balance: string }> = await AppDataSource.query(
    `SELECT la.account_code, COALESCE(SUM(jl.debit_amount - jl.credit_amount),0) AS balance
     FROM ledger_accounts la
     INNER JOIN chart_of_accounts coa ON coa.id = la.chart_of_accounts_id
     LEFT JOIN (journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id AND je.status = 'posted' AND je.organization_id = ?)
       ON jl.ledger_account_id = la.id
     WHERE coa.organization_id = ? AND la.account_code IN ('1000','1100','1200','2100','4000','7000')
     GROUP BY la.account_code ORDER BY la.account_code`,
    [orgId, orgId]
  );
  const [tb] = await AppDataSource.query(
    `SELECT COALESCE(SUM(jl.debit_amount),0) AS dr, COALESCE(SUM(jl.credit_amount),0) AS cr
     FROM journal_lines jl INNER JOIN journal_entries je ON je.id = jl.journal_entry_id
     WHERE je.status = 'posted' AND je.organization_id = ?`,
    [orgId]
  );
  return {
    ...counts,
    balancesDebitMinusCredit: Object.fromEntries(balances.map((b) => [b.account_code, Number(b.balance)])),
    trialBalance: { debit: Number(tb.dr), credit: Number(tb.cr) }
  };
}

async function createMissingFiscalYears(orgId: string, dryRun: boolean) {
  const years: Array<{ y: number }> = await AppDataSource.query(
    `SELECT DISTINCT y FROM (
       SELECT YEAR(invoice_date) AS y, invoice_date AS d FROM invoices
         WHERE organization_id = ? AND journal_entry_id IS NULL AND status IN (${POSTABLE_INVOICE_STATUSES.map(() => '?').join(',')})
       UNION ALL
       SELECT YEAR(payment_date), payment_date FROM payments
         WHERE organization_id = ? AND journal_entry_id IS NULL AND status = 'completed'
     ) x
     WHERE NOT EXISTS (SELECT 1 FROM fiscal_periods fp WHERE fp.organization_id = ? AND fp.start_date <= x.d AND fp.end_date >= x.d)
     ORDER BY y`,
    [orgId, ...POSTABLE_INVOICE_STATUSES, orgId, orgId]
  );
  const created: number[] = [];
  for (const { y } of years) {
    const overlap = await AppDataSource.query(
      `SELECT id FROM fiscal_periods WHERE organization_id = ? AND start_date <= ? AND end_date >= ?`,
      [orgId, `${y}-12-31`, `${y}-01-01`]
    );
    if (overlap.length) {
      // eslint-disable-next-line no-console
      console.warn(`FY ${y}: a fiscal period already overlaps part of the year; not creating one (check periods manually)`);
      continue;
    }
    if (!dryRun) {
      await AppDataSource.query(
        `INSERT INTO fiscal_periods (organization_id, period_name, period_type, start_date, end_date, fiscal_year, is_closed)
         VALUES (?, ?, 'year', ?, ?, ?, 0)`,
        [orgId, `FY ${y}`, `${y}-01-01`, `${y}-12-31`, y]
      );
    }
    created.push(Number(y));
  }
  return created;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const orgId = arg('org') || '1';
  await AppDataSource.initialize();
  try {
    const before = await ledgerSnapshot(orgId);
    const fiscalYears = process.argv.includes('--create-fiscal-years')
      ? await createMissingFiscalYears(orgId, dryRun)
      : [];
    if (dryRun && fiscalYears.length) {
      // eslint-disable-next-line no-console
      console.warn(`Dry run: would create fiscal years ${fiscalYears.join(', ')}; documents in those years show as skipped below.`);
    }
    const report = await runLedgerSweep({ organizationId: orgId, dryRun });
    const after = await ledgerSnapshot(orgId);
    // eslint-disable-next-line no-console
    console.log(JSON.stringify({ dryRun, organizationId: orgId, fiscalYearsCreated: dryRun ? [] : fiscalYears, before, report, after }, null, 2));
  } finally {
    await AppDataSource.destroy();
  }
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});
