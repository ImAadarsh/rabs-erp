/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  getProfitAndLoss,
  getBalanceSheet,
  getTrialBalance,
  getCashFlow,
  getAgedReceivables,
  getAgedPayables,
  listAccVatReturns,
} from '@/lib/accounting-api';
import { formatMoney, formatDate, accApiError, printElement, printTable, downloadCsv, statusBadgeClass, type PrintColumn } from '@/lib/accounting-utils';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

type ReportKey = 'pl' | 'bs' | 'tb' | 'cf' | 'ar' | 'ap' | 'vat';
type Cell = string | number;
/** A printable/exportable block; `money` marks numeric columns so print formats them and CSV keeps raw numbers. */
type ReportSection = { heading?: string; columns: (PrintColumn & { money?: boolean })[]; rows: Cell[][]; footer?: Cell[][] };

const TITLES: Record<ReportKey, string> = {
  pl: 'Profit & Loss',
  bs: 'Balance Sheet',
  tb: 'Trial Balance',
  cf: 'Cash Flow (indirect)',
  ar: 'Aged Receivables',
  ap: 'Aged Payables',
  vat: 'VAT Returns',
};

const FILES: Record<ReportKey, string> = {
  pl: 'profit-and-loss.csv',
  bs: 'balance-sheet.csv',
  tb: 'trial-balance.csv',
  cf: 'cash-flow.csv',
  ar: 'aged-receivables.csv',
  ap: 'aged-payables.csv',
  vat: 'vat-returns.csv',
};

const AGE_BUCKETS = [
  ['current', 'Current'],
  ['d30', '1–30 days'],
  ['d60', '31–60 days'],
  ['d90', '61–90 days'],
  ['older', '90+ days'],
] as const;

const MONO_COLUMNS = new Set(['Code', 'Invoice', 'Bill', 'Return']);

const num = (v: unknown) => Math.round((Number(v) || 0) * 100) / 100;
const sum = (rows: any[], key: string) => num(rows.reduce((s, r) => s + (Number(r[key]) || 0), 0));

function accountRows(list: any[] | undefined) {
  return (list || []).map((r: any) => ({
    accountCode: r.accountCode || '',
    accountName: r.accountName || r.name || r.accountCode || '—',
    amount: num(r.amount ?? r.balance),
  }));
}

/** Normalises each report API response into one shape used by the screen, Print and CSV. */
function normalize(report: ReportKey, body: any) {
  if (report === 'pl') {
    const income = accountRows(body.income || body.revenue);
    const costs = accountRows([...(body.costOfSales || body.cogs || []), ...(body.expenses || [])]);
    const totalIncome = num(body.totalIncome ?? body.totalRevenue ?? sum(income, 'amount'));
    const totalCosts = num(Number(body.totalExpenses ?? 0) + Number(body.totalCogs ?? 0)) || sum(costs, 'amount');
    return { from: body.from, to: body.to, income, costs, totalIncome, totalCosts, netProfit: num(body.netProfit ?? totalIncome - totalCosts) };
  }
  if (report === 'bs') {
    return {
      asOf: body.asOf,
      assets: accountRows(body.assets),
      liabilities: accountRows(body.liabilities),
      equity: [...accountRows(body.equity), ...(body.retainedEarnings != null ? [{ accountCode: '', accountName: 'Retained earnings (current P&L)', amount: num(body.retainedEarnings) }] : [])],
      totalAssets: num(body.totalAssets),
      totalLiabilities: num(body.totalLiabilities),
      totalEquity: num(body.totalEquity),
      balanced: body.balanced,
    };
  }
  if (report === 'tb') {
    const rows = (body.accounts || body.rows || body.lines || (Array.isArray(body) ? body : [])).map((r: any) => ({
      accountCode: r.accountCode || '',
      accountName: r.accountName || '',
      debit: num(r.debit),
      credit: num(r.credit),
    }));
    const totalDebit = num(body.totalDebit ?? sum(rows, 'debit'));
    const totalCredit = num(body.totalCredit ?? sum(rows, 'credit'));
    return { from: body.from, to: body.to, rows, totalDebit, totalCredit, difference: num(totalDebit - totalCredit) };
  }
  if (report === 'ar' || report === 'ap') {
    const list: any[] = Array.isArray(body) ? body : body.rows || [];
    const rows = list.map((r) => ({
      doc: r.invoiceNumber || r.billNumber || '',
      party: r.customerName || r.customer || r.supplierName || r.supplier || '—',
      dueDate: r.dueDate,
      outstanding: num(r.balance ?? r.outstanding),
      current: num(r.current),
      d30: num(r.d30),
      d60: num(r.d60),
      d90: num(r.d90),
      older: num(r.older),
    }));
    const buckets = Object.fromEntries(AGE_BUCKETS.map(([k]) => [k, sum(rows, k)])) as Record<string, number>;
    return { rows, buckets, total: sum(rows, 'outstanding') };
  }
  if (report === 'vat') return { rows: Array.isArray(body) ? body : body?.data || [] };
  return body;
}

export default function AccountingReportingPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [report, setReport] = useState<ReportKey>('pl');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [note, setNote] = useState('');
  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    setData(null);
    try {
      let res: any;
      if (report === 'pl') res = await getProfitAndLoss(orgId);
      else if (report === 'bs') res = await getBalanceSheet(orgId);
      else if (report === 'tb') res = await getTrialBalance(orgId);
      else if (report === 'cf') res = await getCashFlow(orgId);
      else if (report === 'ar') res = await getAgedReceivables(orgId);
      else if (report === 'ap') res = await getAgedPayables(orgId);
      else res = await listAccVatReturns(orgId);
      setData(normalize(report, res.data ?? res));
      setNote(res._sourceNote || res.sourceNote || '');
    } catch (e) {
      toast.error(accApiError(e));
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [orgId, report]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (hasAccess) load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  const period = useMemo(() => {
    if (!data) return undefined;
    if (data.from && data.to) return `Period ${formatDate(data.from)} – ${formatDate(data.to)}`;
    if (data.asOf) return `As at ${formatDate(data.asOf)}`;
    if (report === 'ar' || report === 'ap') return `As at ${formatDate(new Date())}`;
    return undefined;
  }, [data, report]);

  const sections = useMemo<ReportSection[]>(() => {
    if (!data) return [];
    const money = { num: true, money: true };
    if (report === 'pl') {
      return [
        { heading: 'Income', columns: [{ label: 'Code' }, { label: 'Account' }, { label: 'Amount', ...money }], rows: data.income.map((r: any) => [r.accountCode, r.accountName, r.amount]), footer: [['', 'Total income', data.totalIncome]] },
        { heading: 'Costs & expenses', columns: [{ label: 'Code' }, { label: 'Account' }, { label: 'Amount', ...money }], rows: data.costs.map((r: any) => [r.accountCode, r.accountName, r.amount]), footer: [['', 'Total costs & expenses', data.totalCosts], ['', 'Net profit', data.netProfit]] },
      ];
    }
    if (report === 'bs') {
      const block = (heading: string, rows: any[], total: number): ReportSection => ({
        heading,
        columns: [{ label: 'Code' }, { label: 'Account' }, { label: 'Balance', ...money }],
        rows: rows.map((r) => [r.accountCode, r.accountName, r.amount]),
        footer: [['', `Total ${heading.toLowerCase()}`, total]],
      });
      return [block('Assets', data.assets, data.totalAssets), block('Liabilities', data.liabilities, data.totalLiabilities), block('Equity', data.equity, data.totalEquity)];
    }
    if (report === 'tb') {
      return [
        {
          columns: [{ label: 'Code' }, { label: 'Account' }, { label: 'Debit', ...money }, { label: 'Credit', ...money }],
          rows: data.rows.map((r: any) => [r.accountCode, r.accountName, r.debit, r.credit]),
          footer: [
            ['', 'Total', data.totalDebit, data.totalCredit],
            ['', data.difference === 0 ? 'Difference — balanced' : 'Difference (debit − credit)', data.difference, ''],
          ],
        },
      ];
    }
    if (report === 'cf') {
      return [
        {
          columns: [{ label: 'Line' }, { label: 'Amount', ...money }],
          rows: [
            ['Net profit', num(data.netProfit)],
            ...((data.adjustments || []) as any[]).map((a) => [a.label, num(a.amount)] as Cell[]),
            ['Operating cash flow', num(data.operatingCashFlow)],
            ['Investing cash flow', num(data.investingCashFlow)],
            ['Financing cash flow', num(data.financingCashFlow)],
          ],
          footer: [['Net change in cash', num(data.netChangeInCash)], ['Cash at bank (approx.)', num(data.cashAtBankApprox)]],
        },
      ];
    }
    if (report === 'ar' || report === 'ap') {
      return [
        {
          columns: [{ label: report === 'ar' ? 'Invoice' : 'Bill' }, { label: report === 'ar' ? 'Customer' : 'Supplier' }, { label: 'Due' }, ...AGE_BUCKETS.map(([, l]) => ({ label: l, ...money })), { label: 'Outstanding', ...money }],
          rows: data.rows.map((r: any) => [r.doc, r.party, formatDate(r.dueDate), ...AGE_BUCKETS.map(([k]) => r[k]), r.outstanding]),
          footer: [['Total', '', '', ...AGE_BUCKETS.map(([k]) => data.buckets[k]), data.total]],
        },
      ];
    }
    return [
      {
        columns: [{ label: 'Return' }, { label: 'Period' }, { label: 'Box 5 net VAT', ...money }, { label: 'Status' }, { label: 'MTD reference' }],
        rows: data.rows.map((r: any) => [r.returnNumber || r.id, `${formatDate(r.periodStart)} – ${formatDate(r.periodEnd)}`, num(r.box5 ?? r.netVatDue), r.status || 'draft', r.mtdReference || 'Not submitted']),
      },
    ];
  }, [data, report]);

  function onPrint() {
    if (!sections.length || sections.every((s) => !s.rows.length && !s.footer?.length)) {
      toast.error('Nothing to print yet');
      return;
    }
    const fmt = (s: ReportSection, r: Cell[]) => r.map((v, i) => (s.columns[i]?.money && v !== '' ? formatMoney(v) : v));
    const html = sections
      .map((s) => `${s.heading ? `<h2>${s.heading}</h2>` : ''}${printTable(s.columns, s.rows.map((r) => fmt(s, r)), (s.footer || []).map((r) => fmt(s, r)))}`)
      .join('');
    printElement(TITLES[report], html, period);
  }

  function onCsv() {
    if (!sections.length) {
      toast.error('Nothing to export yet');
      return;
    }
    const out: Cell[][] = [[TITLES[report]], ...(period ? [[period]] : []), []];
    sections.forEach((s) => {
      if (s.heading) out.push([s.heading]);
      out.push(s.columns.map((c) => c.label), ...s.rows, ...(s.footer || []), []);
    });
    downloadCsv(FILES[report], out);
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Reporting" />
        <main className="p-6 md:p-8 space-y-4">
          <div className="flex items-center gap-2 flex-wrap">
            {(
              [
                ['pl', 'P&L'],
                ['bs', 'Balance Sheet'],
                ['tb', 'Trial Balance'],
                ['cf', 'Cash Flow'],
                ['ar', 'Aged AR'],
                ['ap', 'Aged AP'],
                ['vat', 'VAT'],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                onClick={() => setReport(k)}
                className={`px-3 py-1.5 rounded-lg text-sm font-medium ${report === k ? 'bg-brand/15 text-brand ring-1 ring-brand/30' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {label}
              </button>
            ))}
            <div className="flex-1" />
            <button type="button" onClick={onPrint} disabled={loading || !data} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted disabled:opacity-50">
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={onCsv} disabled={loading || !data} className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600 disabled:opacity-50">
              <Download size={16} /> CSV
            </button>
          </div>

          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}

          <div className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4">
            <div className="flex items-baseline justify-between gap-3 flex-wrap">
              <h2 className="text-lg font-semibold">{TITLES[report]}</h2>
              {period ? <span className="text-xs text-muted-foreground">{period}</span> : null}
            </div>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : !data ? (
              <p className="text-muted-foreground text-sm">No data</p>
            ) : (
              <>
                {(report === 'ar' || report === 'ap') && (
                  <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                    {AGE_BUCKETS.map(([k, label]) => (
                      <div key={k} className="rounded-xl bg-muted/50 p-3">
                        <div className="text-[10px] uppercase text-muted-foreground font-semibold">{label}</div>
                        <div className="font-semibold tabular-nums">{formatMoney(data.buckets[k])}</div>
                      </div>
                    ))}
                  </div>
                )}
                {sections.map((s, i) => (
                  <SectionTable key={i} section={s} />
                ))}
                {report === 'tb' && (
                  <div className="flex flex-wrap items-center justify-end gap-6 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-sm">
                    <span className="mr-auto text-muted-foreground">Posted journals only</span>
                    <span>Total debit <strong className="tabular-nums">{formatMoney(data.totalDebit)}</strong></span>
                    <span>Total credit <strong className="tabular-nums">{formatMoney(data.totalCredit)}</strong></span>
                    <span className={statusBadgeClass(data.difference === 0 ? 'posted' : 'overdue')}>
                      {data.difference === 0 ? 'Balanced' : `Out by ${formatMoney(Math.abs(data.difference))}`}
                    </span>
                  </div>
                )}
                {report === 'bs' && data.balanced === false && (
                  <p className="text-xs text-red-600">Assets do not equal liabilities + equity — check unposted or one-sided journals.</p>
                )}
                {report === 'cf' && data.note ? <p className="text-xs text-muted-foreground">{data.note}</p> : null}
              </>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function SectionTable({ section }: { section: ReportSection }) {
  const show = (v: Cell, i: number) => (section.columns[i]?.money && v !== '' ? formatMoney(v) : v === '' ? '' : v || '—');
  const align = (i: number) => (section.columns[i]?.num ? 'text-right tabular-nums' : 'text-left');
  return (
    <div className="overflow-x-auto">
      {section.heading ? <h3 className="font-semibold mb-2">{section.heading}</h3> : null}
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b">
            {section.columns.map((c, i) => (
              <th key={c.label} className={`py-2 px-1 font-medium ${align(i)}`}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {section.rows.length === 0 ? (
            <tr>
              <td colSpan={section.columns.length} className="py-3 text-xs text-muted-foreground">No lines</td>
            </tr>
          ) : (
            section.rows.map((r, ri) => (
              <tr key={ri} className="border-b border-border/40">
                {r.map((v, i) => (
                  <td key={i} className={`py-2 px-1 ${align(i)} ${MONO_COLUMNS.has(section.columns[i]?.label ?? '') ? 'font-mono text-xs' : ''}`}>{show(v, i)}</td>
                ))}
              </tr>
            ))
          )}
        </tbody>
        {section.footer?.length ? (
          <tfoot>
            {section.footer.map((r, ri) => (
              <tr key={ri} className={ri === 0 ? 'border-t-2 border-foreground/30 font-semibold' : 'font-semibold'}>
                {r.map((v, i) => (
                  <td key={i} className={`py-2 px-1 ${align(i)}`}>{show(v, i)}</td>
                ))}
              </tr>
            ))}
          </tfoot>
        ) : null}
      </table>
    </div>
  );
}
