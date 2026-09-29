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
  listPmTasks, createPmTask, completePmTask, updatePmTask, addPmTaskDependency,
  listPmProjects, listUsers,
} from '@/lib/api';
import {
  formatDate, pmApiError, statusBadgeClass, TASK_PRIORITIES, TASK_STATUSES, userLabel,
} from '@/lib/pm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, CheckSquare, Plus } from 'lucide-react';
import { PmModal, PmField, PmModalActions, pmInputClass, pmTextareaClass } from '@/components/pm/pm-modal';

export default function PmTasksPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [apiMissing, setApiMissing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [depModal, setDepModal] = useState<any>(null);
  const [form, setForm] = useState({
    projectId: '',
    title: '',
    description: '',
    assigneeUserId: '',
    status: 'todo',
    priority: 'medium',
    dueDate: '',
    dependsOnTaskId: '',
  });
  const [saving, setSaving] = useState(false);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listPmTasks({
        organizationId: orgId,
        search: search || undefined,
        status: filters.status || undefined,
        projectId: filters.projectId || undefined,
        assigneeUserId: filters.assigneeUserId || undefined,
        priority: filters.priority || undefined,
        limit: 200,
      });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(pmApiError(err, 'Failed to load tasks'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, search, filters]);

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
      listUsers(),
    ]).then(([p, u]) => {
      setProjects(p.data || []);
      setUsers(u.data || []);
    }).catch(() => undefined);
  }, [orgId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const created = await createPmTask({
        organizationId: orgId,
        projectId: form.projectId,
        title: form.title,
        description: form.description || null,
        assigneeUserId: form.assigneeUserId || null,
        status: form.status,
        priority: form.priority,
        dueDate: form.dueDate || null,
      });
      if (form.dependsOnTaskId && created.data?.id) {
        await addPmTaskDependency(created.data.id, { dependsOnTaskId: form.dependsOnTaskId });
      }
      toast.success('Task created');
      setShowCreate(false);
      setForm({ projectId: '', title: '', description: '', assigneeUserId: '', status: 'todo', priority: 'medium', dueDate: '', dependsOnTaskId: '' });
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to create task'));
    } finally {
      setSaving(false);
    }
  }

  async function handleAddDep(e: React.FormEvent) {
    e.preventDefault();
    if (!depModal?.id || !form.dependsOnTaskId) return;
    setSaving(true);
    try {
      await addPmTaskDependency(depModal.id, { dependsOnTaskId: form.dependsOnTaskId });
      toast.success('Dependency added');
      setDepModal(null);
      setForm((f) => ({ ...f, dependsOnTaskId: '' }));
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to add dependency'));
    } finally {
      setSaving(false);
    }
  }

  const filterFields = useMemo<FilterField[]>(() => [
    { key: 'status', label: 'Status', type: 'select', options: TASK_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { key: 'priority', label: 'Priority', type: 'select', options: TASK_PRIORITIES.map((s) => ({ value: s.value, label: s.label })) },
    { key: 'projectId', label: 'Project', type: 'select', options: projects.map((p) => ({ value: String(p.id), label: p.name })) },
  ], [projects]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Task',
      cell: (i) => <span className="font-semibold">{i.getValue() as string}</span>,
    },
    {
      id: 'project',
      header: 'Project',
      cell: (info) => {
        const p = info.row.original.project;
        const pid = info.row.original.projectId;
        return p ? (
          <Link href={`/projects/projects/${p.id || pid}`} className="text-brand hover:underline text-sm">{p.name}</Link>
        ) : pid ? (
          <Link href={`/projects/projects/${pid}`} className="text-brand hover:underline text-sm">#{pid}</Link>
        ) : '—';
      },
    },
    {
      id: 'assignee',
      header: 'Assignee',
      cell: (info) => userLabel(info.row.original.assignee),
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: (i) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(i.getValue() as string)}`}>
          {String(i.getValue() || '')}
        </span>
      ),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (i) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(i.getValue() as string)}`}>
          {String(i.getValue() || '').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      accessorKey: 'dueDate',
      header: 'Due',
      cell: (i) => formatDate(i.getValue() as string),
    },
    {
      id: 'deps',
      header: 'Deps',
      cell: (info) => {
        const deps = info.row.original.dependencies || info.row.original.dependsOn || [];
        const n = Array.isArray(deps) ? deps.length : Number(info.row.original.dependencyCount) || 0;
        return <span className="text-xs text-muted-foreground">{n || '—'}</span>;
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const t = info.row.original;
        return (
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="text-xs text-brand hover:underline"
              onClick={() => { setDepModal(t); setForm((f) => ({ ...f, dependsOnTaskId: '' })); }}
            >
              Dep
            </button>
            {t.status !== 'done' && (
              <button
                type="button"
                className="text-xs text-emerald-600 hover:underline"
                onClick={async () => {
                  try {
                    await completePmTask(t.id);
                    toast.success('Completed');
                    void load();
                  } catch (err) {
                    toast.error(pmApiError(err));
                  }
                }}
              >
                Complete
              </button>
            )}
            {t.status === 'todo' && (
              <button
                type="button"
                className="text-xs text-blue-600 hover:underline"
                onClick={async () => {
                  try {
                    await updatePmTask(t.id, { status: 'in_progress' });
                    toast.success('In progress');
                    void load();
                  } catch (err) {
                    toast.error(pmApiError(err));
                  }
                }}
              >
                Start
              </button>
            )}
          </div>
        );
      },
    },
  ], [load]);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Tasks" actions={[{ label: 'Create Task', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]} />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Tasks API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">GET /api/pm/tasks</code>.</div>
              </div>
            </div>
          )}
          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search tasks…"
            stats={[{ label: 'Tasks', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />
          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <CheckSquare className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No tasks yet</p>
              <p className="text-sm mt-1">Assign work with status, priority, and optional dependencies.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600"
              >
                <Plus size={16} /> Create Task
              </button>
            </div>
          ) : (
            <RichDataTable columns={columns} data={items} hideSearch />
          )}
        </main>
      </div>

      <PmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Task" icon={CheckSquare} wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <PmField label="Project">
            <select required className={pmInputClass} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value })}>
              <option value="">Select project</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </PmField>
          <PmField label="Title">
            <input required className={pmInputClass} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </PmField>
          <PmField label="Description">
            <textarea className={pmTextareaClass} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </PmField>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Status">
              <select className={pmInputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </PmField>
            <PmField label="Priority">
              <select className={pmInputClass} value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                {TASK_PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </PmField>
          </div>
          <PmField label="Assignee">
            <select className={pmInputClass} value={form.assigneeUserId} onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
            </select>
          </PmField>
          <PmField label="Due date">
            <input type="date" className={pmInputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </PmField>
          <PmField label="Depends on" hint="Optional — blocks until dependency completes">
            <select className={pmInputClass} value={form.dependsOnTaskId} onChange={(e) => setForm({ ...form, dependsOnTaskId: e.target.value })}>
              <option value="">None</option>
              {items.filter((t) => String(t.projectId) === String(form.projectId)).map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </PmField>
          <PmModalActions onCancel={() => setShowCreate(false)} submitLabel="Create Task" submitting={saving} />
        </form>
      </PmModal>

      <PmModal open={!!depModal} onClose={() => setDepModal(null)} title={`Dependency · ${depModal?.title || ''}`} icon={CheckSquare}>
        <form onSubmit={handleAddDep} className="space-y-4">
          <PmField label="This task depends on">
            <select required className={pmInputClass} value={form.dependsOnTaskId} onChange={(e) => setForm({ ...form, dependsOnTaskId: e.target.value })}>
              <option value="">Select task</option>
              {items.filter((t) => t.id !== depModal?.id && String(t.projectId) === String(depModal?.projectId)).map((t) => (
                <option key={t.id} value={t.id}>{t.title}</option>
              ))}
            </select>
          </PmField>
          <PmModalActions onCancel={() => setDepModal(null)} submitLabel="Add dependency" submitting={saving} />
        </form>
      </PmModal>
    </div>
  );
}
