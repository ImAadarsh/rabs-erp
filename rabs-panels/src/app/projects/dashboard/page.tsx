'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import {
  FolderKanban, CheckSquare, Flag, ClipboardList, AlertCircle,
  Plus, Calendar, TrendingUp
} from 'lucide-react';
import { createPmProject, getPmDashboard, listCustomers, listPmMilestones, listPmTasks, listUsers } from '@/lib/api';
import { formatDate, pmApiError, PROJECT_STATUSES, statusBadgeClass, userLabel } from '@/lib/pm-utils';
import { toast } from 'sonner';
import Link from 'next/link';
import { PmModal, PmField, PmModalActions, pmInputClass, pmTextareaClass } from '@/components/pm/pm-modal';
import { CrmCustomerSelect } from '@/components/crm/crm-customer-select';
import { displayName } from '@/lib/crm-utils';

const emptyForm = {
  name: '',
  code: '',
  customerId: '',
  scope: '',
  objectives: '',
  status: 'draft',
  startDate: '',
  endDate: '',
  budget: '',
  currency: 'GBP',
  ownerUserId: '',
};

export default function ProjectsDashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [overdueTasks, setOverdueTasks] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiReady, setApiReady] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [orgId, setOrgId] = useState<string | undefined>();
  const [sessionUserId, setSessionUserId] = useState<string | undefined>();

  useEffect(() => {
    const s = getSession();
    if (!s?.accessToken) {
      router.replace('/login');
      return;
    }
    const oid = s.user?.organizationId;
    setOrgId(oid);
    setSessionUserId(s.user?.id);

    async function load() {
      try {
        try {
          const dash = await getPmDashboard(oid ? { organizationId: oid } : undefined);
          setStats(dash.data || {});
          setApiReady(true);
          if (Array.isArray(dash.data?.upcomingMilestones)) {
            setMilestones(dash.data.upcomingMilestones.slice(0, 8));
          }
        } catch (err: any) {
          if (err?.response?.status === 404) {
            setApiReady(false);
            setStats({});
          } else {
            throw err;
          }
        }

        try {
          const ms = await listPmMilestones({
            organizationId: oid,
            upcoming: true,
            limit: 8,
          });
          if (ms.data?.length) setMilestones(ms.data.slice(0, 8));
        } catch { /* optional until API ready */ }

        try {
          const tasks = await listPmTasks({ organizationId: oid, overdue: true, limit: 50 });
          setOverdueTasks((tasks.data || []).slice(0, 8));
        } catch {
          try {
            const tasks = await listPmTasks({ organizationId: oid, limit: 50 });
            const today = new Date();
            today.setHours(0, 0, 0, 0);
            const overdue = (tasks.data || []).filter((t: any) => {
              if (!t.dueDate || ['done', 'cancelled'].includes(t.status)) return false;
              return new Date(t.dueDate) < today;
            });
            if (overdue.length) setOverdueTasks(overdue.slice(0, 8));
          } catch { /* optional */ }
        }
      } catch (err) {
        toast.error(pmApiError(err, 'Failed to load PM dashboard'));
      } finally {
        setLoading(false);
      }
    }
    void load();

    if (oid) {
      void Promise.all([
        listCustomers({ organizationId: oid, limit: 200 }),
        listUsers(),
      ]).then(([cust, us]) => {
        setCustomers(cust.data || []);
        setUsers(us.data || []);
      }).catch(() => undefined);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router]);

  const customerOptions = useMemo(
    () => customers.map((c) => ({
      id: String(c.id),
      label: displayName(c),
      sublabel: c.email || c.companyName,
    })),
    [customers]
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !form.name.trim()) return;
    setSaving(true);
    try {
      const res = await createPmProject({
        organizationId: orgId,
        name: form.name.trim(),
        code: form.code || null,
        customerId: form.customerId || null,
        scope: form.scope || null,
        objectives: form.objectives || null,
        status: form.status,
        startDate: form.startDate || null,
        endDate: form.endDate || null,
        budget: form.budget ? Number(form.budget) : 0,
        currency: form.currency || 'GBP',
        ownerUserId: form.ownerUserId || sessionUserId || null,
      });
      toast.success('Project created');
      setShowCreate(false);
      setForm(emptyForm);
      router.push(`/projects/projects/${res.data.id}`);
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to create project'));
    } finally {
      setSaving(false);
    }
  }

  const overdueCount =
    typeof stats?.overdueTasks === 'number'
      ? stats.overdueTasks
      : (stats?.overdueTasksCount ?? overdueTasks.length);

  const statusEntries = stats?.projectsByStatus
    ? Object.entries(stats.projectsByStatus as Record<string, number>).sort((a, b) => Number(b[1]) - Number(a[1]))
    : [];
  const maxStatus = statusEntries.reduce((m, [, v]) => Math.max(m, Number(v) || 0), 0) || 1;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Project Management"
          actions={[{ label: 'Create Project', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]}
        />
        <main className="p-6 md:p-8 space-y-6">
          {!apiReady && !loading && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">PM API not ready yet</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Waiting on <code className="font-mono">GET /api/pm/dashboard</code>. Forms still work once routes deploy.
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              title="Active Projects"
              value={loading ? '…' : String(stats?.activeProjects ?? '—')}
              hint="In flight jobs"
              icon={<FolderKanban size={20} />}
            />
            <StatCard
              title="Overdue Tasks"
              value={loading ? '…' : String(overdueCount ?? '—')}
              hint="Past due date"
              icon={<AlertCircle size={20} />}
            />
            <StatCard
              title="Open Work Orders"
              value={loading ? '…' : String(stats?.openWorkOrders ?? '—')}
              hint="Scheduled / in progress"
              icon={<ClipboardList size={20} />}
            />
            <StatCard
              title="My Open Tasks"
              value={loading ? '…' : String(stats?.myOpenTasks ?? '—')}
              hint="Assigned to you"
              icon={<CheckSquare size={20} />}
            />
          </div>

          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:grid-cols-5">
            {[
              { href: '/projects/projects', label: 'Projects', icon: FolderKanban, hint: 'Jobs & scope' },
              { href: '/projects/work-orders', label: 'Work Orders', icon: ClipboardList, hint: 'Stages & assign' },
              { href: '/projects/tasks', label: 'Tasks', icon: CheckSquare, hint: 'Deps & complete' },
              { href: '/projects/schedule', label: 'Schedule', icon: Calendar, hint: 'Staff week view' },
              { href: '/projects/milestones', label: 'Milestones', icon: Flag, hint: 'Deadlines' },
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
                <h2 className="text-lg font-semibold tracking-tight">Overdue tasks</h2>
                <button
                  type="button"
                  onClick={() => router.push('/projects/tasks')}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-600 shadow-sm transition"
                >
                  <Plus size={16} />
                  Create Task
                </button>
              </div>
              <div className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
                <table className="w-full text-left text-sm">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Task</th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Assignee</th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Due</th>
                      <th className="px-4 py-3 font-medium text-[11px] uppercase tracking-wider">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loading ? (
                      <tr><td colSpan={4} className="px-4 py-10 text-center text-muted-foreground italic">Loading…</td></tr>
                    ) : overdueTasks.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="px-4 py-10 text-center text-muted-foreground">
                          <p className="font-medium text-foreground">No overdue tasks</p>
                          <p className="text-xs mt-1">Tasks past their due date will show here.</p>
                        </td>
                      </tr>
                    ) : (
                      overdueTasks.map((t) => (
                        <tr key={t.id} className="hover:bg-muted/30">
                          <td className="px-4 py-3 font-medium">{t.title}</td>
                          <td className="px-4 py-3 text-muted-foreground">{userLabel(t.assignee)}</td>
                          <td className="px-4 py-3 text-rose-600">{formatDate(t.dueDate)}</td>
                          <td className="px-4 py-3">
                            <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusBadgeClass(t.status)}`}>
                              {String(t.status || '').replace(/_/g, ' ')}
                            </span>
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
                  <h3 className="font-semibold flex items-center gap-2"><Flag size={16} className="text-brand" /> Upcoming milestones</h3>
                  <Link href="/projects/milestones" className="text-xs text-brand hover:underline">All</Link>
                </div>
                {milestones.length ? (
                  <ul className="space-y-2.5">
                    {milestones.map((m) => (
                      <li key={m.id} className="flex items-start justify-between gap-2 text-sm">
                        <div>
                          <div className="font-medium">{m.title}</div>
                          <div className="text-[11px] text-muted-foreground">
                            {m.project?.name || m.projectName || `Project #${m.projectId}`}
                          </div>
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{formatDate(m.dueDate)}</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-sm text-muted-foreground italic py-4">
                    No upcoming milestones yet — add them on a project or the Milestones page.
                  </p>
                )}
              </div>

              <div className="glass-panel p-5 rounded-2xl border border-border/50 space-y-3">
                <h3 className="font-semibold flex items-center gap-2"><TrendingUp size={16} className="text-brand" /> Projects by status</h3>
                {statusEntries.length ? (
                  <div className="space-y-2.5">
                    {statusEntries.map(([k, v]) => (
                      <div key={k} className="space-y-1">
                        <div className="flex justify-between text-sm">
                          <span className="text-muted-foreground capitalize">{String(k).replace(/_/g, ' ')}</span>
                          <span className="font-semibold">{String(v)}</span>
                        </div>
                        <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full rounded-full bg-brand"
                            style={{ width: `${Math.max(8, (Number(v) / maxStatus) * 100)}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground italic py-4">No project status breakdown yet.</p>
                )}
                {stats?.asOf && (
                  <p className="text-[11px] text-muted-foreground pt-1">As of {new Date(stats.asOf).toLocaleString()}</p>
                )}
              </div>
            </div>
          </div>
        </main>
      </div>

      <PmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Project" icon={FolderKanban} wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <PmField label="Name">
            <input required className={pmInputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Job / project name" />
          </PmField>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Code">
              <input className={pmInputClass} value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} placeholder="JOB-001" />
            </PmField>
            <PmField label="Status">
              <select className={pmInputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </PmField>
          </div>
          <PmField label="Customer" hint="Optional ERP customer link">
            <CrmCustomerSelect
              value={form.customerId}
              onChange={(id) => setForm({ ...form, customerId: id })}
              options={customerOptions}
              allowEmpty
              emptyLabel="No customer"
            />
          </PmField>
          <PmField label="Scope">
            <textarea className={pmTextareaClass} value={form.scope} onChange={(e) => setForm({ ...form, scope: e.target.value })} placeholder="What is in / out of scope" />
          </PmField>
          <PmField label="Objectives">
            <textarea className={pmTextareaClass} value={form.objectives} onChange={(e) => setForm({ ...form, objectives: e.target.value })} placeholder="Success criteria" />
          </PmField>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Start date">
              <input type="date" className={pmInputClass} value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
            </PmField>
            <PmField label="End date">
              <input type="date" className={pmInputClass} value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
            </PmField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Budget">
              <input type="number" min="0" step="0.01" className={pmInputClass} value={form.budget} onChange={(e) => setForm({ ...form, budget: e.target.value })} />
            </PmField>
            <PmField label="Currency">
              <input className={pmInputClass} value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value.toUpperCase() })} maxLength={3} />
            </PmField>
          </div>
          <PmField label="Owner">
            <select className={pmInputClass} value={form.ownerUserId} onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}>
              <option value="">Assign later</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>{userLabel(u)}</option>
              ))}
            </select>
          </PmField>
          <PmModalActions onCancel={() => setShowCreate(false)} submitLabel="Create Project" submitting={saving} />
        </form>
      </PmModal>
    </div>
  );
}
