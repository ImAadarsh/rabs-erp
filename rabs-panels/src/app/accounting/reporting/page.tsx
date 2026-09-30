/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
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
import { formatMoney, formatDate, accApiError, printElement, downloadCsv } from '@/lib/accounting-utils';
import { Download, Printer } from 'lucide-react';
import { toast } from 'sonner';

type ReportKey = 'pl' | 'bs' | 'tb' | 'cf' | 'ar' | 'ap' | 'vat';

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
    try {
      let res: any;
      if (report === 'pl') res = await getProfitAndLoss(orgId);
      else if (report === 'bs') res = await getBalanceSheet(orgId);
      else if (report === 'tb') res = await getTrialBalance(orgId);
      else if (report === 'cf') res = await getCashFlow(orgId);
      else if (report === 'ar') res = await getAgedReceivables(orgId);
      else if (report === 'ap') res = await getAgedPayables(orgId);
      else res = await listAccVatReturns(orgId);
      setData(res.data ?? res);
      // Normalize trial balance
      if (report === 'tb') {
        const body = res.data ?? res;
        setData({
          rows: body.rows || body.accounts || body.lines || (Array.isArray(body) ? body : []),
        });
      }
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

  function title() {
    return (
      {
        pl: 'Profit & Loss',
        bs: 'Balance Sheet',
        tb: 'Trial Balance',
        cf: 'Cash Flow (indirect)',
        ar: 'Aged Receivables',
        ap: 'Aged Payables',
        vat: 'VAT Returns',
      } as const
    )[report];
  }

  function onPrint() {
    const el = document.getElementById('acc-report-body');
    if (!el) return;
    printElement(title(), el.innerHTML);
  }

  function onCsv() {
    if (report === 'pl' && data) {
      downloadCsv('profit-and-loss.csv', [
        ['Section', 'Account', 'Amount'],
        ...(data.income || []).map((r: any) => ['Income', r.accountName || r.accountCode, r.amount]),
        ...(data.expenses || []).map((r: any) => ['Expense', r.accountName || r.accountCode, r.amount]),
        ['Total', 'Net profit', data.netProfit],
      ]);
      return;
    }
    if (report === 'tb' && data?.rows) {
      downloadCsv('trial-balance.csv', [
        ['Code', 'Account', 'Debit', 'Credit', 'Balance'],
        ...data.rows.map((r: any) => [r.accountCode, r.accountName, r.debit, r.credit, r.balance]),
      ]);
      return;
    }
    if (report === 'ar' && data?.rows) {
      downloadCsv('aged-receivables.csv', [
        ['Invoice', 'Customer', 'Due', 'Outstanding', 'Bucket', 'Days'],
        ...data.rows.map((r: any) => [r.invoiceNumber, r.customer, r.dueDate, r.outstanding, r.bucket, r.daysOverdue]),
      ]);
      return;
    }
    toast.message('CSV export', { description: 'Use Print for this report view, or open Trial Balance / P&L / Aged AR for CSV.' });
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
            <button type="button" onClick={onPrint} className="inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-sm hover:bg-muted">
              <Printer size={16} /> Print
            </button>
            <button type="button" onClick={onCsv} className="inline-flex items-center gap-2 rounded-xl bg-brand px-3 py-2 text-sm font-semibold text-white hover:bg-brand-600">
              <Download size={16} /> CSV
            </button>
          </div>

          {note ? <p className="text-xs text-muted-foreground">{note}</p> : null}

          <div id="acc-report-body" className="glass-panel rounded-2xl border border-border/50 p-6 space-y-4">
            <h2 className="text-lg font-semibold">{title()}</h2>
            {loading ? (
              <p className="text-muted-foreground text-sm">Loading…</p>
            ) : !data ? (
              <p className="text-muted-foreground text-sm">No data</p>
            ) : report === 'pl' ? (
              <div className="space-y-4 text-sm">
                <Section
                  title="Income"
                  rows={(data.income || data.revenue || []).map((r: any) => ({
                    ...r,
                    accountName: r.accountName || r.name,
                    amount: r.amount ?? r.balance,
                  }))}
                  total={data.totalIncome ?? data.totalRevenue}
                />
                <Section
                  title="Expenses"
                  rows={[...(data.expenses || []), ...(data.cogs || [])].map((r: any) => ({
                    ...r,
                    accountName: r.accountName || r.name,
                    amount: r.amount ?? r.balance,
                  }))}
                  total={data.totalExpenses != null ? Number(data.totalExpenses) + Number(data.totalCogs || 0) : data.totalExpenses}
                />
                <div className="flex justify-between font-bold text-base border-t pt-3">
                  <span>Net profit</span>
                  <span className="tabular-nums">{formatMoney(data.netProfit)}</span>
                </div>
              </div>
            ) : report === 'bs' ? (
              <div className="space-y-4 text-sm">
                <Section title="Assets" rows={(data.assets || []).map((r: any) => ({ ...r, amount: r.balance ?? r.amount, accountName: r.accountName || r.name }))} total={data.totalAssets} />
                <Section title="Liabilities" rows={(data.liabilities || []).map((r: any) => ({ ...r, amount: r.balance ?? r.amount, accountName: r.accountName || r.name }))} total={data.totalLiabilities} />
                <Section title="Equity" rows={(data.equity || []).map((r: any) => ({ ...r, amount: r.balance ?? r.amount, accountName: r.accountName || r.name }))} total={data.totalEquity} />
              </div>
            ) : report === 'tb' ? (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2">Code</th>
                    <th className="text-left py-2">Account</th>
                    <th className="text-right py-2">Debit</th>
                    <th className="text-right py-2">Credit</th>
                  </tr>
                </thead>
                <tbody>
                  {(data.rows || []).map((r: any, i: number) => (
                    <tr key={i} className="border-b border-border/40">
                      <td className="py-2 font-mono text-xs">{r.accountCode}</td>
                      <td className="py-2">{r.accountName}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(r.debit)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(r.credit)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : report === 'cf' ? (
              <div className="text-sm space-y-2">
                <p>Method: {data.method || 'indirect'}</p>
                <p>Starting net profit: <strong>{formatMoney(data.netProfit)}</strong></p>
                <p className="text-muted-foreground">{data.note}</p>
              </div>
            ) : report === 'ar' || report === 'ap' ? (
              <div className="space-y-4 text-sm">
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                  {Object.entries(data.buckets || {}).map(([k, v]) => (
                    <div key={k} className="rounded-xl bg-muted/50 p-3">
                      <div className="text-[10px] uppercase text-muted-foreground font-semibold">{k}</div>
                      <div className="font-semibold tabular-nums">{formatMoney(v as number)}</div>
                    </div>
                  ))}
                </div>
                <table className="w-full">
                  <thead>
                    <tr className="text-muted-foreground border-b">
                      <th className="text-left py-2">Doc</th>
                      <th className="text-left py-2">Party</th>
                      <th className="text-left py-2">Due</th>
                      <th className="text-right py-2">Outstanding</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data.rows || []).map((r: any, i: number) => (
                      <tr key={i} className="border-b border-border/40">
                        <td className="py-2 font-mono text-xs">{r.invoiceNumber || r.billNumber}</td>
                        <td className="py-2">{r.customer || r.supplier}</td>
                        <td className="py-2">{formatDate(r.dueDate)}</td>
                        <td className="py-2 text-right tabular-nums">{formatMoney(r.outstanding)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground border-b">
                    <th className="text-left py-2">Period</th>
                    <th className="text-right py-2">Box 5</th>
                    <th className="text-left py-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {(Array.isArray(data) ? data : data?.data || []).map((r: any) => (
                    <tr key={r.id} className="border-b border-border/40">
                      <td className="py-2">{formatDate(r.periodStart)} – {formatDate(r.periodEnd)}</td>
                      <td className="py-2 text-right tabular-nums">{formatMoney(r.box5 ?? r.netVatDue)}</td>
                      <td className="py-2">{r.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}

function Section({ title, rows, total }: { title: string; rows?: any[]; total?: number }) {
  return (
    <div>
      <h3 className="font-semibold mb-2">{title}</h3>
      <div className="space-y-1">
        {(rows || []).map((r, i) => (
          <div key={i} className="flex justify-between gap-4">
            <span className="text-muted-foreground">{r.accountName || r.accountCode || '—'}</span>
            <span className="tabular-nums">{formatMoney(r.amount)}</span>
          </div>
        ))}
        {!rows?.length ? <p className="text-muted-foreground text-xs">No lines</p> : null}
      </div>
      <div className="flex justify-between mt-2 font-medium border-t border-border/40 pt-2">
        <span>Total {title.toLowerCase()}</span>
        <span className="tabular-nums">{formatMoney(total)}</span>
      </div>
    </div>
  );
}
