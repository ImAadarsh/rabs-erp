'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import {
  MessageSquare, Clock, CheckCircle, Plus, Building2, Target,
  Columns3, PhoneCall, TrendingUp, AlertCircle
} from 'lucide-react';
import { getCrmDashboard, getCrmForecast, listTickets } from '@/lib/api';
import { crmApiError, formatMoney } from '@/lib/crm-utils';
import { toast } from 'sonner';

export default function CRMDashboard() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [forecast, setForecast] = useState<any>(null);
  const [tickets, setTickets] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiReady, setApiReady] = useState(true);

  useEffect(() => {
    const s = getSession();
    if (!s?.accessToken) {
      router.replace('/login');
      return;
    }

    async function loadData() {
      try {
        const orgId = s!.user?.organizationId;
        try {
          const dash = await getCrmDashboard(orgId ? { organizationId: orgId } : undefined);
          setStats(dash.data || {});
          setApiReady(true);
        } catch (err: any) {
          if (err?.response?.status === 404) {
            setApiReady(false);
            setStats({});
          } else {
            throw err;
          }
        }
        try {
          const fc = await getCrmForecast(orgId ? { organizationId: orgId } : undefined);
          setForecast(fc.data);
        } catch { /* optional */ }
        try {
          const { data } = await listTickets();
          setTickets((data || []).slice(0, 6));
        } catch { /* optional */ }
      } catch (err) {
        toast.error(crmApiError(err, 'Failed to load CRM dashboard'));
      } finally {
        setLoading(false);
      }
    }
    void loadData();
  }, [router]);

  const openTickets = stats?.openTickets ?? tickets.filter(t => ['new', 'open'].includes(t.status)).length;
  const leadsTotal = stats?.leadsByStatus
    ? Object.values(stats.leadsByStatus as Record<string, number>).reduce((a, b) => a + Number(b || 0), 0)
    : null;
  const highPriority = tickets.filter(t => ['high', 'urgent'].includes(t.priority)).length;
  const leadEntries = stats?.leadsByStatus
    ? Object.entries(stats.leadsByStatus as Record<string, number>).sort((a, b) => Number(b[1]) - Number(a[1]))
    : [];
  const maxLead = leadEntries.reduce((m, [, v]) => Math.max(m, Number(v) || 0), 0) || 1;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="CRM Dashboard"
          actions={[
            { label: 'Create Lead', onClick: () => router.push('/crm/leads?new=true'), icon: <Plus size={16} /> },
            { label: 'Create Deal', onClick: () => router.push('/crm/pipeline?new=true'), icon: <Plus size={16} />, variant: 'secondary' },
            { label: 'Create Ticket', onClick: () => router.push('/crm/tickets?new=true'), icon: <Plus size={16} />, variant: 'secondary' },
          ]}
        />

        <main className="p-6 md:p-8 space-y-6">
          {!apiReady && !loading && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Sales CRM dashboard unavailable</div>
                <div className="text-xs mt-0.5 opacity-80">Ticket queue still loads below.</div>
              </div>
            </div>
          )}

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Open Tickets" value={loading ? '…' : String(openTickets)} hint="Needs attention" icon={<Clock size={20} />} />
            <StatCard title="My Open Deals" value={loading ? '…' : String(stats?.myOpenDeals ?? '—')} hint={`${stats?.openDealsTotal ?? '—'} open total`} icon={<TrendingUp size={20} />} />
            <StatCard
              title="Weighted forecast"
              value={loading ? '…' : formatMoney(forecast?.weightedForecast, forecast?.currency || 'GBP')}
              hint={forecast ? `${forecast.dealCount ?? 0} open · pipeline ${formatMoney(forecast.totalPipeline, forecast.currency || 'GBP')}` : 'Open deals × probability'}
              icon={<TrendingUp size={20} />}
            />
            <StatCard title="Leads" value={loading ? '…' : String(leadsTotal ?? '—')} hint={stats?.leadsByStatus ? `${stats.leadsByStatus.new ?? 0} new` : 'By status'} icon={<Target size={20} />} />
          </div>

          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-7">
            {[
              { href: '/crm/accounts', label: 'Accounts', icon: Building2, hint: 'Account 360' },
              { href: '/crm/leads', label: 'Leads', icon: Target, hint: 'Capture & convert' },
              { href: '/crm/pipeline', label: 'Pipeline', icon: Columns3, hint: 'Deals board' },
              { href: '/crm/forecast', label: 'Forecast', icon: TrendingUp, hint: 'Weighted pipeline' },
              { href: '/crm/activities', label: 'Activities', icon: PhoneCall, hint: 'Tasks & calls' },
              { href: '/crm/tickets', label: 'Tickets', icon: MessageSquare, hint: 'Support queue' },
              { href: '/crm/settings/pipelines', label: 'Settings', icon: CheckCircle, hint: 'Stages config' },
            ].map((q) => (
              <button
                key={q.href}
                type="button"
                onClick={() => router.push(q.href)}
                className="glass-panel rounded-2xl border border-border/50 p-3.5 text-left hover:border-brand/45 hover:shadow-sm transition group"
              >
                <div className="p-2 rounded-lg bg-brand/10 text-brand w-fit mb-2.5 group-hover:scale-105 transition">
                  <q.icon size={16} />
                </div>
                <div className="text-sm font-semibold leading-tight">{q.label}</div>
                <div className="text-[11px] text-muted-foreground mt-0.5">{q.hint}</div>
              </button>
            ))}
          </div>

          <div className="grid gap-5 grid-cols-1 lg:grid-cols-3">
            <div className="lg:col-span-2 space-y-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-lg font-semibold tracking-tight">Recent Tickets</h2>
                <div className="flex items-center gap-2">
                  <button type="button" onClick={() => router.push('/crm/tickets')} className="text-sm text-brand hover:underline">View all</button>
                  <button
                    type="button"
                    onClick={() => router.push('/crm/tickets?new=true')}
                    className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-600 shadow-sm transition"
                  >
                    <Plus size={16} />
                    <span>New Ticket</span>
                  </button>
                </div>
              </div>

              <div className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Ticket #</th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Subject</th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Priority</th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Status</th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider text-right">Created</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loading ? (
                      <tr><td colSpan={5} className="px-4 py-10 text-center text-muted-foreground italic">Loading…</td></tr>
                    ) : tickets.length === 0 ? (
                      <tr>
                        <td colSpan={5} className="px-4 py-10 text-center text-muted-foreground">
                          <p className="font-medium text-foreground">No tickets yet</p>
                          <p className="text-xs mt-1">Create one to start the support queue.</p>
                          <button
                            type="button"
                            onClick={() => router.push('/crm/tickets?new=true')}
                            className="mt-3 text-sm text-brand hover:underline"
                          >
                            Create ticket
                          </button>
                        </td>
                      </tr>
                    ) : (
                      tickets.map((ticket) => (
                        <tr key={ticket.id} className="hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => router.push(`/crm/tickets/${ticket.id}`)}>
                          <td className="px-4 py-3 font-mono text-xs text-brand">{ticket.ticketNumber}</td>
                          <td className="px-4 py-3 font-medium">{ticket.subject}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              ticket.priority === 'urgent' ? 'bg-rose-500/10 text-rose-600' :
                              ticket.priority === 'high' ? 'bg-orange-500/10 text-orange-600' :
                              'bg-blue-500/10 text-blue-600'
                            }`}>{ticket.priority}</span>
                          </td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${
                              ticket.status === 'open' ? 'bg-emerald-500/10 text-emerald-600' :
                              ticket.status === 'new' ? 'bg-blue-500/10 text-blue-600' :
                              'bg-muted text-muted-foreground'
                            }`}>{String(ticket.status || '').replace(/_/g, ' ')}</span>
                          </td>
                          <td className="px-4 py-3 text-right text-muted-foreground">
                            {ticket.createdAt ? new Date(ticket.createdAt).toLocaleDateString() : '—'}
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="space-y-4">
              <div className="glass-panel p-5 rounded-2xl border border-border/50 space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="font-semibold">Leads by status</h3>
                  <button type="button" onClick={() => router.push('/crm/leads')} className="text-xs text-brand hover:underline">Open</button>
                </div>
                {leadEntries.length ? (
                  <div className="space-y-2.5">
                    {leadEntries.map(([k, v]) => (
                      <div key={k} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground capitalize">{k}</span>
                          <span className="font-semibold">{String(v)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.max(8, (Number(v) / maxLead) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic py-4">No lead breakdown yet — seed or capture leads to populate.</p>
                )}
                {stats?.asOf && (
                  <p className="text-[11px] text-muted-foreground pt-1">As of {new Date(stats.asOf).toLocaleString()}</p>
                )}
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-border/50 space-y-3">
                <h3 className="font-semibold">Priority alert</h3>
                {highPriority > 0 ? (
                  <div className="p-4 rounded-xl bg-rose-500/5 border border-rose-500/20 text-rose-600">
                    <div className="text-sm font-bold">{highPriority} urgent / high tickets</div>
                    <div className="text-xs mt-1">Need attention in the support queue.</div>
                    <button type="button" onClick={() => router.push('/crm/tickets')} className="text-xs font-medium mt-2 underline underline-offset-2">
                      Review queue
                    </button>
                  </div>
                ) : (
                  <div className="p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20 text-emerald-600">
                    <div className="text-sm font-bold flex items-center gap-2"><CheckCircle size={14} /> All caught up</div>
                    <div className="text-xs mt-1">No high-priority tickets in the recent list.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
