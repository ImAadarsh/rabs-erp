'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import {
  listPmSchedule, createPmScheduleBlock, deletePmScheduleBlock,
  listPmProjects, listPmTasks, listUsers,
} from '@/lib/api';
import { formatDateTime, pmApiError, userLabel } from '@/lib/pm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Calendar, ChevronLeft, ChevronRight, Plus, Trash2 } from 'lucide-react';
import { PmModal, PmField, PmModalActions, pmInputClass, pmTextareaClass } from '@/components/pm/pm-modal';

function startOfWeek(d: Date) {
  const x = new Date(d);
  const day = x.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  x.setDate(x.getDate() + diff);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d: Date, n: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

export default function PmSchedulePage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [apiMissing, setApiMissing] = useState(false);
  const [weekStart, setWeekStart] = useState(() => startOfWeek(new Date()));
  const [view, setView] = useState<'week' | 'list'>('week');
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    userId: '',
    projectId: '',
    taskId: '',
    startAt: '',
    endAt: '',
    notes: '',
  });
  const [saving, setSaving] = useState(false);

  const orgId = session?.user?.organizationId;
  const weekFromIso = useMemo(() => weekStart.toISOString(), [weekStart]);
  const weekToIso = useMemo(() => addDays(weekStart, 7).toISOString(), [weekStart]);
  const filterUserId = filters.userId || undefined;
  const filterProjectId = filters.projectId || undefined;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listPmSchedule({
        organizationId: orgId,
        userId: filterUserId,
        projectId: filterProjectId,
        from: weekFromIso,
        to: weekToIso,
        limit: 500,
      });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(pmApiError(err, 'Failed to load schedule'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, filterUserId, filterProjectId, weekFromIso, weekToIso]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  useEffect(() => {
    if (!orgId) return;
    void Promise.all([
      listPmProjects({ organizationId: orgId, limit: 200 }),
      listPmTasks({ organizationId: orgId, limit: 200 }),
      listUsers(),
    ]).then(([p, t, u]) => {
      setProjects(p.data || []);
      setTasks(t.data || []);
      setUsers(u.data || []);
    }).catch(() => undefined);
  }, [orgId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPmScheduleBlock({
        organizationId: orgId,
        userId: form.userId,
        projectId: form.projectId || null,
        taskId: form.taskId || null,
        startAt: form.startAt,
        endAt: form.endAt,
        notes: form.notes || null,
      });
      toast.success('Schedule block created');
      setShowCreate(false);
      setForm({ userId: '', projectId: '', taskId: '', startAt: '', endAt: '', notes: '' });
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to create schedule block'));
    } finally {
      setSaving(false);
    }
  }

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(weekStart, i)), [weekStart]);

  const byUser = useMemo(() => {
    const map = new Map<string, { user: any; blocks: any[] }>();
    for (const b of items) {
      const uid = String(b.userId || b.user?.id || 'unknown');
      if (!map.has(uid)) map.set(uid, { user: b.user || users.find((u) => String(u.id) === uid), blocks: [] });
      map.get(uid)!.blocks.push(b);
    }
    if (filters.userId && !map.has(filters.userId)) {
      const u = users.find((x) => String(x.id) === filters.userId);
      if (u) map.set(filters.userId, { user: u, blocks: [] });
    }
    return Array.from(map.values()).sort((a, b) => userLabel(a.user).localeCompare(userLabel(b.user)));
  }, [items, users, filters.userId]);

  const filterFields = useMemo<FilterField[]>(() => [
    { key: 'userId', label: 'Staff', type: 'select', options: users.map((u) => ({ value: String(u.id), label: userLabel(u) })) },
    { key: 'projectId', label: 'Project', type: 'select', options: projects.map((p) => ({ value: String(p.id), label: p.name })) },
  ], [users, projects]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'user',
      header: 'Staff',
      cell: (info) => userLabel(info.row.original.user),
    },
    {
      id: 'project',
      header: 'Project',
      cell: (info) => {
        const p = info.row.original.project;
        const pid = info.row.original.projectId;
        if (!pid && !p) return '—';
        return (
          <Link href={`/projects/projects/${p?.id || pid}`} className="text-brand hover:underline text-sm">
            {p?.name || `#${pid}`}
          </Link>
        );
      },
    },
    {
      id: 'task',
      header: 'Task',
      cell: (info) => info.row.original.task?.title || '—',
    },
    {
      id: 'window',
      header: 'Window',
      cell: (info) => (
        <span className="text-sm">{formatDateTime(info.row.original.startAt)} → {formatDateTime(info.row.original.endAt)}</span>
      ),
    },
    {
      accessorKey: 'notes',
      header: 'Notes',
      cell: (i) => (i.getValue() as string) || '—',
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-rose-500/10 text-muted-foreground hover:text-rose-600"
          onClick={async () => {
            try {
              await deletePmScheduleBlock(info.row.original.id);
              toast.success('Deleted');
              void load();
            } catch (err) {
              toast.error(pmApiError(err));
            }
          }}
        >
          <Trash2 size={14} />
        </button>
      ),
    },
  ], [load]);

  const weekLabel = `${weekStart.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} – ${addDays(weekStart, 6).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Staff Schedule"
          actions={[{ label: 'Add Schedule Block', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Schedule API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">GET /api/pm/schedule-blocks</code>.</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setWeekStart(addDays(weekStart, -7))} className="p-2 rounded-xl border border-border hover:bg-muted">
                <ChevronLeft size={16} />
              </button>
              <div className="px-3 py-2 rounded-xl bg-muted/50 text-sm font-medium min-w-[200px] text-center">{weekLabel}</div>
              <button type="button" onClick={() => setWeekStart(addDays(weekStart, 7))} className="p-2 rounded-xl border border-border hover:bg-muted">
                <ChevronRight size={16} />
              </button>
              <button type="button" onClick={() => setWeekStart(startOfWeek(new Date()))} className="text-xs text-brand hover:underline ml-1">
                This week
              </button>
            </div>
            <div className="flex rounded-xl border border-border overflow-hidden text-sm">
              <button type="button" onClick={() => setView('week')} className={`px-3 py-1.5 ${view === 'week' ? 'bg-brand text-white' : 'hover:bg-muted'}`}>Week</button>
              <button type="button" onClick={() => setView('list')} className={`px-3 py-1.5 ${view === 'list' ? 'bg-brand text-white' : 'hover:bg-muted'}`}>List</button>
            </div>
          </div>

          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue=""
            onSearchChange={() => undefined}
            searchPlaceholder=""
            stats={[{ label: 'Blocks', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />

          {view === 'list' ? (
            !loading && items.length === 0 && !apiMissing ? (
              <EmptySchedule onAdd={() => setShowCreate(true)} />
            ) : (
              <RichDataTable columns={columns} data={items} hideSearch />
            )
          ) : (
            !loading && byUser.length === 0 && !apiMissing ? (
              <EmptySchedule onAdd={() => setShowCreate(true)} />
            ) : (
              <div className="glass-panel rounded-2xl border border-border/50 overflow-x-auto">
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="bg-muted/50 text-muted-foreground">
                      <th className="px-3 py-3 text-left font-medium text-[11px] uppercase tracking-wider w-40 sticky left-0 bg-muted/80">Staff</th>
                      {days.map((d) => (
                        <th key={d.toISOString()} className="px-2 py-3 text-center font-medium text-[11px] uppercase tracking-wider">
                          <div>{d.toLocaleDateString('en-GB', { weekday: 'short' })}</div>
                          <div className="text-foreground font-semibold normal-case tracking-normal">{d.getDate()}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/50">
                    {loading ? (
                      <tr><td colSpan={8} className="px-4 py-10 text-center text-muted-foreground italic">Loading…</td></tr>
                    ) : (
                      byUser.map(({ user, blocks }) => (
                        <tr key={user?.id || userLabel(user)}>
                          <td className="px-3 py-3 font-medium sticky left-0 bg-card/95">{userLabel(user)}</td>
                          {days.map((d) => {
                            const dayBlocks = blocks.filter((b) => {
                              const s = new Date(b.startAt);
                              return s.toDateString() === d.toDateString();
                            });
                            return (
                              <td key={d.toISOString()} className="px-1.5 py-2 align-top">
                                <div className="space-y-1 min-h-[48px]">
                                  {dayBlocks.map((b) => (
                                    <div
                                      key={b.id}
                                      className="rounded-lg bg-brand/15 border border-brand/25 px-2 py-1 text-[11px] leading-snug"
                                      title={b.notes || ''}
                                    >
                                      <div className="font-semibold truncate">{b.project?.name || b.task?.title || 'Block'}</div>
                                      <div className="text-muted-foreground">
                                        {new Date(b.startAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                        –
                                        {new Date(b.endAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              </td>
                            );
                          })}
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            )
          )}
        </main>
      </div>

      <PmModal open={showCreate} onClose={() => setShowCreate(false)} title="Add Schedule Block" icon={Calendar} wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <PmField label="Staff">
            <select required className={pmInputClass} value={form.userId} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
              <option value="">Select user</option>
              {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
            </select>
          </PmField>
          <PmField label="Project">
            <select className={pmInputClass} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, taskId: '' })}>
              <option value="">Optional</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </PmField>
          <PmField label="Task">
            <select className={pmInputClass} value={form.taskId} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
              <option value="">Optional</option>
              {tasks.filter((t) => !form.projectId || String(t.projectId) === String(form.projectId)).map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </PmField>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Start"><input required type="datetime-local" className={pmInputClass} value={form.startAt} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></PmField>
            <PmField label="End"><input required type="datetime-local" className={pmInputClass} value={form.endAt} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></PmField>
          </div>
          <PmField label="Notes"><textarea className={pmTextareaClass} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></PmField>
          <PmModalActions onCancel={() => setShowCreate(false)} submitLabel="Add Schedule Block" submitting={saving} />
        </form>
      </PmModal>
    </div>
  );
}

function EmptySchedule({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
      <Calendar className="mx-auto mb-3 opacity-40" size={32} />
      <p className="font-medium text-foreground">No schedule blocks this week</p>
      <p className="text-sm mt-1">Assign staff time to projects or tasks.</p>
      <button type="button" onClick={onAdd} className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600">
        <Plus size={16} /> Add Schedule Block
      </button>
    </div>
  );
}
