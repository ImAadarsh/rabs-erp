'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listChartOfAccounts, listLedgerAccounts, listJournalEntries,
  listBankAccounts, listVatReturns, listBudgetLines,
  listFiscalPeriods, listInvoices, listPayments, listGateways
} from '@/lib/api';
import { BookOpen, FileText, FileCheck, Wallet, Receipt, BarChart, Calendar, TrendingUp, CreditCard } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const mockChartData = [
  { name: 'Jan', revenue: 4000, expenses: 2400 },
  { name: 'Feb', revenue: 3000, expenses: 1398 },
  { name: 'Mar', revenue: 2000, expenses: 9800 },
  { name: 'Apr', revenue: 2780, expenses: 3908 },
  { name: 'May', revenue: 1890, expenses: 4800 },
  { name: 'Jun', revenue: 2390, expenses: 3800 },
  { name: 'Jul', revenue: 3490, expenses: 4300 }
];

export default function FinanceDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalChartOfAccounts: 0,
    totalLedgerAccounts: 0,
    totalJournalEntries: 0,
    totalBankAccounts: 0,
    totalVatReturns: 0,
    totalBudgetLines: 0,
    activeFiscalPeriods: 0,
    draftJournalEntries: 0,
    totalInvoices: 0,
    totalPayments: 0,
    totalGateways: 0
  });

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [coaRes, laRes, jeRes, baRes, vatRes, budgetRes, fpRes, invRes, payRes, gwRes] = await Promise.all([
          listChartOfAccounts({ organizationId: session?.user?.organizationId }),
          listLedgerAccounts({}),
          listJournalEntries({ organizationId: session?.user?.organizationId }),
          listBankAccounts({ organizationId: session?.user?.organizationId }),
          listVatReturns({ organizationId: session?.user?.organizationId }),
          listBudgetLines({ organizationId: session?.user?.organizationId }),
          listFiscalPeriods({ organizationId: session?.user?.organizationId, isClosed: false }),
          listInvoices(session?.user?.organizationId!),
          listPayments(session?.user?.organizationId!),
          listGateways(session?.user?.organizationId!)
        ]);

        const journalEntries = jeRes.data || [];
        const draftEntries = journalEntries.filter((entry: any) => entry.status === 'draft').length;

        setStats({
          totalChartOfAccounts: coaRes.data?.length || 0,
          totalLedgerAccounts: laRes.data?.length || 0,
          totalJournalEntries: journalEntries.length,
          totalBankAccounts: baRes.data?.length || 0,
          totalVatReturns: vatRes.data?.length || 0,
          totalBudgetLines: budgetRes.data?.length || 0,
          activeFiscalPeriods: fpRes.data?.length || 0,
          draftJournalEntries: draftEntries,
          totalInvoices: invRes.data?.length || 0,
          totalPayments: payRes.data?.length || 0,
          totalGateways: gwRes.data?.length || 0
        });
      } catch (e: any) {
        console.error('Failed to load finance stats:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Finance · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading...</div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Finance · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view this page.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Dashboard" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Finance & Payments Overview</h1>
              <p className="text-muted-foreground">Manage invoices, payments, and financial reporting</p>
            </div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6"
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { staggerChildren: 0.1 } }
              }}
            >
              <Link href="/finance/invoices">
                <StatCard
                  title="Invoices"
                  value={stats.totalInvoices.toString()}
                  icon={<Receipt className="h-5 w-5" />}
                  hint="Total invoices created"
                />
              </Link>
              <Link href="/finance/payments">
                <StatCard
                  title="Payments"
                  value={stats.totalPayments.toString()}
                  icon={<CreditCard className="h-5 w-5" />}
                  hint="Total payments recorded"
                />
              </Link>
              <Link href="/finance/gateways">
                <StatCard
                  title="Gateways"
                  value={stats.totalGateways.toString()}
                  icon={<Wallet className="h-5 w-5" />}
                  hint="Configured payment gateways"
                />
              </Link>
              <Link href="/finance/chart-of-accounts">
                <StatCard
                  title="Chart of Accounts"
                  value={stats.totalChartOfAccounts.toString()}
                  icon={<BookOpen className="h-5 w-5" />}
                  hint="Total chart of accounts"
                />
              </Link>
              <Link href="/finance/ledger-accounts">
                <StatCard
                  title="Ledger Accounts"
                  value={stats.totalLedgerAccounts.toString()}
                  icon={<FileText className="h-5 w-5" />}
                  hint="Total ledger accounts"
                />
              </Link>
              <Link href="/finance/journal-entries">
                <StatCard
                  title="Journal Entries"
                  value={stats.totalJournalEntries.toString()}
                  icon={<FileCheck className="h-5 w-5" />}
                  hint="Total journal entries"
                />
              </Link>
              <Link href="/finance/bank-accounts">
                <StatCard
                  title="Bank Accounts"
                  value={stats.totalBankAccounts.toString()}
                  icon={<Wallet className="h-5 w-5" />}
                  hint="Total bank accounts"
                />
              </Link>
              <Link href="/finance/vat-returns">
                <StatCard
                  title="VAT Returns"
                  value={stats.totalVatReturns.toString()}
                  icon={<Receipt className="h-5 w-5" />}
                  hint="Total VAT returns"
                />
              </Link>
              <Link href="/finance/budget-lines">
                <StatCard
                  title="Budget Lines"
                  value={stats.totalBudgetLines.toString()}
                  icon={<BarChart className="h-5 w-5" />}
                  hint="Total budget lines"
                />
              </Link>
              <Link href="/finance/fiscal-periods">
                <StatCard
                  title="Active Periods"
                  value={stats.activeFiscalPeriods.toString()}
                  icon={<Calendar className="h-5 w-5" />}
                  hint="Open fiscal periods"
                />
              </Link>
              <Link href="/finance/journal-entries?status=draft">
                <StatCard
                  title="Draft Entries"
                  value={stats.draftJournalEntries.toString()}
                  icon={<TrendingUp className="h-5 w-5" />}
                  hint="Pending journal entries"
                />
              </Link>
            </motion.div>

            {/* Recharts Area */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-8 p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl"
            >
              <div className="mb-6">
                <h2 className="text-lg font-semibold tracking-tight">Revenue vs Expenses</h2>
                <p className="text-sm text-muted-foreground">Monthly financial performance</p>
              </div>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenueFin" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10b981" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#10b981" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorExpenses" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f43f5e" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f43f5e" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenueFin)" />
                    <Area type="monotone" dataKey="expenses" stroke="#f43f5e" strokeWidth={3} fillOpacity={1} fill="url(#colorExpenses)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              <Link href="/finance/invoices" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Invoices</h3>
                <p className="text-sm text-muted-foreground relative">Manage customer invoices and billing</p>
              </Link>
              <Link href="/finance/payments" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Payments</h3>
                <p className="text-sm text-muted-foreground relative">Manage incoming payments and refunds</p>
              </Link>
              <Link href="/finance/gateways" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Payment Gateways</h3>
                <p className="text-sm text-muted-foreground relative">Worldpay + multi-gateway status, config, and tests</p>
              </Link>
              <Link href="/finance/payment-dashboard" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Payment Dashboard</h3>
                <p className="text-sm text-muted-foreground relative">Payment volume metrics and recent transactions</p>
              </Link>
              <Link href="/finance/chart-of-accounts" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Chart of Accounts</h3>
                <p className="text-sm text-muted-foreground relative">Manage account structure and organization</p>
              </Link>
              <Link href="/finance/ledger-accounts" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Ledger Accounts</h3>
                <p className="text-sm text-muted-foreground relative">Manage individual GL accounts</p>
              </Link>
              <Link href="/finance/journal-entries" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Journal Entries</h3>
                <p className="text-sm text-muted-foreground relative">Create and manage journal entries</p>
              </Link>
              <Link href="/finance/bank-accounts" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Bank Accounts</h3>
                <p className="text-sm text-muted-foreground relative">Manage bank account information</p>
              </Link>
              <Link href="/finance/fiscal-periods" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Fiscal Periods</h3>
                <p className="text-sm text-muted-foreground relative">Manage accounting periods</p>
              </Link>
              <Link href="/finance/vat-returns" className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden">
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">VAT Returns</h3>
                <p className="text-sm text-muted-foreground relative">Manage VAT return filings</p>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

