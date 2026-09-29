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
  listPmWorkOrders, createPmWorkOrder, updatePmWorkOrder,
  listPmProjects, listPmStages, listUsers,
} from '@/lib/api';
import { formatDateTime, pmApiError, statusBadgeClass, userLabel, WORK_ORDER_STATUSES } from '@/lib/pm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, ClipboardList, Plus } from 'lucide-react';
import { PmModal, PmField, PmModalActions, pmInputClass, pmTextareaClass } from '@/components/pm/pm-modal';

export default function PmWorkOrdersPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [apiMissing, setApiMissing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    projectId: '',
    title: '',
    description: '',
    status: 'draft',
    assigneeUserId: '',
    stageId: '',
    scheduledStart: '',
    scheduledEnd: '',
  });
  const [saving, setSaving] = useState(false);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listPmWorkOrders({
        organizationId: orgId,
        search: search || undefined,
        status: filters.status || undefined,
        projectId: filters.projectId || undefined,
        assigneeUserId: filters.assigneeUserId || undefined,
        limit: 200,
      });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(pmApiError(err, 'Failed to load work orders'));
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
      listPmStages({ organizationId: orgId }),
      listUsers(),
    ]).then(([p, s, u]) => {
      setProjects(p.data || []);
      setStages(s.data || []);
      setUsers(u.data || []);
    }).catch(() => undefined);
  }, [orgId]);

  const projectStages = useMemo(() => {
    if (!form.projectId) return stages.filter((s) => !s.projectId);
    return stages.filter((s) => !s.projectId || String(s.projectId) === String(form.projectId));
  }, [stages, form.projectId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPmWorkOrder({
        organizationId: orgId,
        projectId: form.projectId,
        title: form.title,
        description: form.description || null,
        status: form.status,
        assigneeUserId: form.assigneeUserId || null,
        stageId: form.stageId || null,
        scheduledStart: form.scheduledStart || null,
        scheduledEnd: form.scheduledEnd || null,
      });
      toast.success('Work order created');
      setShowCreate(false);
      setForm({ projectId: '', title: '', description: '', status: 'draft', assigneeUserId: '', stageId: '', scheduledStart: '', scheduledEnd: '' });
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to create work order'));
    } finally {
      setSaving(false);
    }
  }

  const filterFields = useMemo<FilterField[]>(() => [
    { key: 'status', label: 'Status', type: 'select', options: WORK_ORDER_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { key: 'projectId', label: 'Project', type: 'select', options: projects.map((p) => ({ value: String(p.id), label: p.name })) },
  ], [projects]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Work order',
      cell: (i) => <span className="font-semibold">{i.getValue() as string}</span>,
    },
    {
      id: 'project',
      header: 'Project',
      cell: (info) => {
        const p = info.row.original.project;
        const pid = info.row.original.projectId;
        return (
          <Link href={`/projects/projects/${p?.id || pid}`} className="text-brand hover:underline text-sm">
            {p?.name || `#${pid}`}
          </Link>
        );
      },
    },
    {
      id: 'stage',
      header: 'Stage',
      cell: (info) => info.row.original.stage?.name || '—',
    },
    {
      id: 'assignee',
      header: 'Assignee',
      cell: (info) => userLabel(info.row.original.assignee),
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
      id: 'window',
      header: 'Schedule window',
      cell: (info) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(info.row.original.scheduledStart)} → {formatDateTime(info.row.original.scheduledEnd)}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const w = info.row.original;
        if (w.status === 'done' || w.status === 'cancelled') return null;
        return (
          <button
            type="button"
            className="text-xs text-emerald-600 hover:underline"
            onClick={async () => {
              const next = w.status === 'draft' ? 'scheduled' : w.status === 'scheduled' ? 'in_progress' : 'done';
              try {
                await updatePmWorkOrder(w.id, { status: next });
                toast.success(`Status → ${next.replace(/_/g, ' ')}`);
                void load();
              } catch (err) {
                toast.error(pmApiError(err));
              }
            }}
          >
            Advance
          </button>
        );
      },
    },
  ], [load]);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Work Orders" actions={[{ label: 'Create Work Order', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]} />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Work orders API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">GET /api/pm/work-orders</code>.</div>
              </div>
            </div>
          )}
          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search work orders…"
            stats={[{ label: 'Work orders', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />
          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <ClipboardList className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No work orders yet</p>
              <p className="text-sm mt-1">Create one with a stage, assignee, and schedule window.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600"
              >
                <Plus size={16} /> Create Work Order
              </button>
            </div>
          ) : (
            <RichDataTable columns={columns} data={items} hideSearch />
          )}
        </main>
      </div>

      <PmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Work Order" icon={ClipboardList} wide>
        <form onSubmit={handleCreate} className="space-y-4">
          <PmField label="Project">
            <select required className={pmInputClass} value={form.projectId} onChange={(e) => setForm({ ...form, projectId: e.target.value, stageId: '' })}>
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
                {WORK_ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </PmField>
            <PmField label="Stage">
              <select className={pmInputClass} value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                <option value="">No stage</option>
                {projectStages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </PmField>
          </div>
          <PmField label="Assignee">
            <select className={pmInputClass} value={form.assigneeUserId} onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}>
              <option value="">Unassigned</option>
              {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
            </select>
          </PmField>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Scheduled start">
              <input type="datetime-local" className={pmInputClass} value={form.scheduledStart} onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })} />
            </PmField>
            <PmField label="Scheduled end">
              <input type="datetime-local" className={pmInputClass} value={form.scheduledEnd} onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })} />
            </PmField>
          </div>
          <PmModalActions onCancel={() => setShowCreate(false)} submitLabel="Create Work Order" submitting={saving} />
        </form>
      </PmModal>
    </div>
  );
}
