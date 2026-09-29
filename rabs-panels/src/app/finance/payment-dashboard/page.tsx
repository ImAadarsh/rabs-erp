'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { GatewayManager } from '@/components/finance/gateway-manager';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getPaymentDashboard } from '@/lib/api';
import { toast } from 'sonner';
import {
  CreditCard,
  Wallet,
  Activity,
  AlertTriangle,
  CheckCircle2,
  RefreshCw
} from 'lucide-react';

export default function PaymentDashboardPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [metrics, setMetrics] = useState<any>({});
  const [recentPayments, setRecentPayments] = useState<any[]>([]);
  const orgId = session?.user?.organizationId;

  const load = async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const res = await getPaymentDashboard(orgId);
      setMetrics(res.data?.metrics || {});
      setRecentPayments(res.data?.recentPayments || []);
    } catch {
      toast.error('Failed to load payment dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load();
  }, [hydrated, hasAccess, session?.accessToken, orgId]);

  if (!hydrated) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Payment Dashboard" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold">Payment Dashboard</h1>
              <p className="text-sm text-muted-foreground">
                Monitor payment volume and recent transactions. Configure gateways under Payment Gateways.
              </p>
            </div>
            <div className="flex gap-2">
              <button
                onClick={load}
                className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-border text-sm hover:bg-muted"
              >
                <RefreshCw size={16} /> Refresh
              </button>
              <Link
                href="/finance/gateways"
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-primary text-primary-foreground text-sm font-medium"
              >
                Manage gateways
              </Link>
            </div>
          </div>

          {loading ? (
            <div className="text-muted-foreground">Loading...</div>
          ) : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <StatCard
                  title="Active gateways"
                  value={String(metrics.gatewaysActive ?? 0)}
                  hint={`${metrics.gatewaysTotal ?? 0} total`}
                  icon={<Wallet size={18} />}
                />
                <StatCard
                  title="Completed volume"
                  value={`£${Number(metrics.completedVolume || 0).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
                  hint={`${metrics.completedCount ?? 0} settled`}
                  icon={<CheckCircle2 size={18} />}
                />
                <StatCard
                  title="Pending"
                  value={String(metrics.pendingCount ?? 0)}
                  hint="Awaiting confirmation"
                  icon={<Activity size={18} />}
                />
                <StatCard
                  title="Failed"
                  value={String(metrics.failedCount ?? 0)}
                  hint="Provider / validation errors"
                  icon={<AlertTriangle size={18} />}
                />
              </div>

              <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                {orgId ? <GatewayManager organizationId={orgId} variant="summary" /> : null}

                <div className="rounded-2xl border border-border bg-card p-5 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <h2 className="font-semibold flex items-center gap-2">
                      <CreditCard size={18} /> Recent payments
                    </h2>
                    <Link href="/finance/payments" className="text-xs px-2 py-1 rounded-lg border hover:bg-muted">
                      All payments
                    </Link>
                  </div>
                  <div className="space-y-2 max-h-[420px] overflow-auto">
                    {recentPayments.length === 0 && (
                      <p className="text-sm text-muted-foreground">No payments yet.</p>
                    )}
                    {recentPayments.map((p) => (
                      <div
                        key={p.id}
                        className="p-3 rounded-xl border border-border text-sm flex justify-between gap-3"
                      >
                        <div>
                          <div className="font-medium">{p.transactionId || p.reference || p.id}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.paymentMethod} · {p.status}
                            {p.failureMessage ? ` · ${p.failureMessage}` : ''}
                          </div>
                        </div>
                        <div className="font-semibold whitespace-nowrap">
                          £{Number(p.amount || 0).toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
