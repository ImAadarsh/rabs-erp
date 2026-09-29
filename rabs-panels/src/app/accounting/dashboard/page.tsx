/* eslint-disable @typescript-eslint/no-explicit-any */
'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getAccountingDashboard, getProfitAndLoss, listAccJournals } from '@/lib/accounting-api';
import { formatMoney, formatDate, statusBadgeClass, accApiError } from '@/lib/accounting-utils';
import { MtdBanner } from '@/components/accounting/acc-modal';
import { Landmark, Receipt, FileCheck, TrendingUp, AlertTriangle, ArrowRight } from 'lucide-react';
import { toast } from 'sonner';

export default function AccountingDashboardPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'ACCOUNTANT']);
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<any>(null);
  const [pl, setPl] = useState<any>(null);
  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [d, p, journals] = await Promise.all([
        getAccountingDashboard(orgId),
        getProfitAndLoss(orgId).catch(() => null),
        listAccJournals(orgId, { limit: 8 }).catch(() => ({ data: [] })),
      ]);
      const raw = (d as any).data || d;
      setDash({
        cashBalance: raw.cashBalance ?? raw.cash ?? raw.bankBalance,
        income: raw.income ?? raw.incomeYtd ?? raw.totalIncome,
        expenses: raw.expenses ?? raw.expensesYtd ?? raw.totalExpenses,
        profitLoss:
          raw.profitLoss ??
          raw.pnl ??
          raw.netProfit ??
          raw.profitAndLoss?.netProfit ??
          raw.plSummary?.netProfit,
        vatDue: raw.vatDue ?? raw.vatDueNet ?? raw.vat?.netDue,
        openInvoicesCount: raw.openInvoicesCount ?? raw.openAr?.count ?? raw.openInvoices?.count,
        openInvoicesTotal:
          raw.openInvoicesTotal ?? raw.openAr?.total ?? raw.openInvoices?.balance ?? raw.openInvoices?.total,
        openBillsCount: raw.openBillsCount ?? raw.openAp?.count ?? raw.openBills?.count,
        openBillsTotal: raw.openBillsTotal ?? raw.openAp?.total ?? raw.openBills?.balance ?? raw.openBills?.total,
        recentJournals: raw.recentJournals ?? (journals as any).data ?? [],
        alerts: raw.alerts || [],
        sourceNote: raw.sourceNote,
      });
      setPl((p as any)?.data || null);
    } catch (e) {
      toast.error(accApiError(e, 'Failed to load dashboard'));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (!hasAccess) return;
    load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  const alerts = dash?.alerts || [];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="UK Accounting Dashboard" />
        <main className="p-6 md:p-8 space-y-6">
          <MtdBanner />
          {Array.isArray(alerts) && alerts.length > 0 ? (
            <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm space-y-1">
              {alerts.map((a: any, i: number) => (
                <div key={i}>{typeof a === 'string' ? a : a.message || JSON.stringify(a)}</div>
              ))}
            </div>
          ) : null}

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Cash" value={loading ? '…' : formatMoney(dash?.cashBalance)} hint="Bank balances" icon={<Landmark size={20} />} />
            <StatCard title="Income" value={loading ? '…' : formatMoney(dash?.income ?? pl?.totalIncome)} hint="Invoiced / revenue" icon={<TrendingUp size={20} />} />
            <StatCard title="Expenses" value={loading ? '…' : formatMoney(dash?.expenses ?? pl?.totalExpenses)} hint="Expense accounts" icon={<Receipt size={20} />} />
            <StatCard
              title="Net P&L"
              value={loading ? '…' : formatMoney(dash?.profitLoss ?? pl?.netProfit)}
              hint="Profit & loss summary"
              icon={<FileCheck size={20} />}
            />
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="VAT due" value={loading ? '…' : formatMoney(dash?.vatDue)} hint="Latest return net" icon={<PercentIcon />} />
            <StatCard
              title="Open invoices"
              value={loading ? '…' : String(dash?.openInvoicesCount ?? 0)}
              hint={formatMoney(dash?.openInvoicesTotal)}
              icon={<Receipt size={20} />}
            />
            <StatCard
              title="Open bills"
              value={loading ? '…' : String(dash?.openBillsCount ?? 0)}
              hint={formatMoney(dash?.openBillsTotal)}
              icon={<ShoppingIcon />}
            />
            <StatCard
              title="Alerts"
              value={loading ? '…' : String(alerts.length)}
              hint="Cash, VAT, overdue"
              icon={<AlertTriangle size={20} />}
            />
          </div>

          <div className="grid gap-6 grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2 glass-panel rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 flex items-center justify-between border-b border-border/50">
                <h2 className="font-semibold">Recent journals</h2>
                <Link href="/accounting/ledger?tab=journals" className="text-sm text-brand hover:underline">
                  View all
                </Link>
              </div>
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-muted-foreground bg-muted/40">
                    <th className="px-4 py-2.5 text-left font-medium">Journal</th>
                    <th className="px-4 py-2.5 text-left font-medium">Date</th>
                    <th className="px-4 py-2.5 text-left font-medium">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/40">
                  {loading ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Loading…</td></tr>
                  ) : (dash?.recentJournals || []).length === 0 ? (
                    <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No journals yet</td></tr>
                  ) : (
                    (dash.recentJournals as any[]).slice(0, 8).map((j) => (
                      <tr key={j.id} className="hover:bg-muted/20">
                        <td className="px-4 py-2.5 font-mono text-xs">{j.journalNumber}</td>
                        <td className="px-4 py-2.5">{formatDate(j.entryDate)}</td>
                        <td className="px-4 py-2.5"><span className={statusBadgeClass(j.status)}>{j.status}</span></td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="space-y-3">
              <h2 className="font-semibold px-1">Quick links</h2>
              {[
                { href: '/accounting/sales', label: 'Create invoice', desc: 'Sales & credit notes' },
                { href: '/accounting/purchases', label: 'Enter bill', desc: 'Supplier purchases' },
                { href: '/accounting/banking', label: 'Banking', desc: 'Reconcile & import' },
                { href: '/accounting/reporting', label: 'P&L report', desc: 'Printable / CSV' },
                { href: '/accounting/payroll', label: 'Post payroll', desc: 'HR → ledger' },
              ].map((q) => (
                <button
                  key={q.href}
                  type="button"
                  onClick={() => router.push(q.href)}
                  className="w-full flex items-center gap-3 p-3 rounded-xl border border-border/50 bg-card hover:bg-muted/40 text-left transition"
                >
                  <div className="flex-1">
                    <div className="text-sm font-medium">{q.label}</div>
                    <div className="text-xs text-muted-foreground">{q.desc}</div>
                  </div>
                  <ArrowRight size={14} className="text-muted-foreground" />
                </button>
              ))}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

function PercentIcon() {
  return <span className="text-sm font-bold">%</span>;
}
function ShoppingIcon() {
  return <Receipt size={20} />;
}
