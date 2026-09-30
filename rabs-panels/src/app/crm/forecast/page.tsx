'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { getCrmForecast, listCrmPipelines } from '@/lib/api';
import { crmApiError, formatMoney } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { TrendingUp, AlertCircle, Columns3 } from 'lucide-react';

export default function CrmForecastPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [data, setData] = useState<any>(null);
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [fc, pipes] = await Promise.all([
        getCrmForecast({
          organizationId: orgId,
          pipelineId: pipelineId || undefined,
        }),
        listCrmPipelines({ organizationId: orgId }).catch(() => ({ data: [] })),
      ]);
      setData(fc.data);
      setPipelines(pipes.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setData(null);
      } else {
        toast.error(crmApiError(err, 'Failed to load forecast'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, pipelineId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  const currency = data?.currency || 'GBP';
  const maxMonth = Math.max(1, ...(data?.byMonth || []).map((m: any) => Number(m.weighted) || 0));

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Sales Forecast" />
        <main className="p-6 md:p-8 space-y-6">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Forecast API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">/api/crm/forecast</code>.</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-sm text-muted-foreground">Pipeline</label>
            <select
              value={pipelineId}
              onChange={(e) => setPipelineId(e.target.value)}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm min-w-[200px]"
            >
              <option value="">All pipelines</option>
              {pipelines.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Open pipeline"
              value={loading ? '…' : formatMoney(data?.totalPipeline, currency)}
              hint={`${data?.dealCount ?? 0} open deals`}
              icon={<Columns3 size={20} />}
            />
            <StatCard
              title="Weighted forecast"
              value={loading ? '…' : formatMoney(data?.weightedForecast, currency)}
              hint="Amount × probability"
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              title="By stage"
              value={loading ? '…' : String(data?.byStage?.length ?? 0)}
              hint="Active stages"
              icon={<TrendingUp size={20} />}
            />
            <StatCard
              title="Owners"
              value={loading ? '…' : String(data?.byOwner?.length ?? 0)}
              hint="With open deals"
              icon={<TrendingUp size={20} />}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="glass-panel rounded-2xl border border-border/50 p-6">
              <h2 className="text-sm font-semibold mb-4">By expected close month</h2>
              {!data?.byMonth?.length && !loading && (
                <p className="text-sm text-muted-foreground italic">No open deals in range.</p>
              )}
              <ul className="space-y-3">
                {(data?.byMonth || []).map((m: any) => (
                  <li key={m.month}>
                    <div className="flex justify-between text-sm mb-1">
                      <span className="font-medium">{m.month}</span>
                      <span className="text-muted-foreground">
                        {formatMoney(m.weighted, currency)} · {m.count} deals
                      </span>
                    </div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-brand"
                        style={{ width: `${Math.max(4, (Number(m.weighted) / maxMonth) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass-panel rounded-2xl border border-border/50 p-6">
              <h2 className="text-sm font-semibold mb-4">By stage</h2>
              <ul className="divide-y divide-border/50">
                {(data?.byStage || []).map((s: any) => (
                  <li key={s.stageId} className="py-2.5 flex justify-between text-sm gap-3">
                    <span className="font-medium">{s.stageName}</span>
                    <span className="text-muted-foreground text-right">
                      {formatMoney(s.amount, currency)} → {formatMoney(s.weighted, currency)}
                    </span>
                  </li>
                ))}
                {!data?.byStage?.length && !loading && (
                  <li className="text-sm text-muted-foreground italic py-4">No stage data.</li>
                )}
              </ul>
            </section>

            <section className="glass-panel rounded-2xl border border-border/50 p-6 lg:col-span-2">
              <h2 className="text-sm font-semibold mb-4">By owner</h2>
              <ul className="grid sm:grid-cols-2 gap-3">
                {(data?.byOwner || []).map((o: any) => (
                  <li key={o.ownerUserId || 'unassigned'} className="rounded-xl border border-border/50 bg-muted/20 px-4 py-3">
                    <div className="font-medium text-sm">{o.ownerName}</div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Pipeline {formatMoney(o.amount, currency)} · Weighted {formatMoney(o.weighted, currency)} · {o.count} deals
                    </div>
                  </li>
                ))}
              </ul>
            </section>

            <section className="glass-panel rounded-2xl border border-border/50 p-6 lg:col-span-2">
              <h2 className="text-sm font-semibold mb-4">Open deals</h2>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-muted-foreground border-b border-border/50">
                      <th className="py-2 pr-3 font-medium">Deal</th>
                      <th className="py-2 pr-3 font-medium">Stage</th>
                      <th className="py-2 pr-3 font-medium">Amount</th>
                      <th className="py-2 pr-3 font-medium">Prob.</th>
                      <th className="py-2 pr-3 font-medium">Weighted</th>
                      <th className="py-2 font-medium">Close</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(data?.deals || []).map((d: any) => (
                      <tr key={d.id} className="border-b border-border/40">
                        <td className="py-2.5 pr-3">
                          <Link href={`/crm/deals/${d.id}`} className="font-medium hover:text-brand">{d.name}</Link>
                        </td>
                        <td className="py-2.5 pr-3 text-muted-foreground">{d.stageName || '—'}</td>
                        <td className="py-2.5 pr-3">{formatMoney(d.amount, d.currency || currency)}</td>
                        <td className="py-2.5 pr-3">
                          {d.probability}%
                          <span className="text-[10px] text-muted-foreground ml-1">({d.probabilitySource})</span>
                        </td>
                        <td className="py-2.5 pr-3">{formatMoney(d.weighted, d.currency || currency)}</td>
                        <td className="py-2.5 text-muted-foreground">{d.expectedClose || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {!data?.deals?.length && !loading && (
                  <p className="text-sm text-muted-foreground italic py-6 text-center">No open deals.</p>
                )}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
