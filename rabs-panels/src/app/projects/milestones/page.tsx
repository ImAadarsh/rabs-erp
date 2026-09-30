'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import { listPmMilestones, createPmMilestone, updatePmMilestone, listPmProjects } from '@/lib/api';
import { formatDate, MILESTONE_STATUSES, pmApiError, statusBadgeClass } from '@/lib/pm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Flag, Plus } from 'lucide-react';
import { PmModal, PmField, PmModalActions, pmInputClass, pmTextareaClass } from '@/components/pm/pm-modal';

export default function PmMilestonesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [projects, setProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [apiMissing, setApiMissing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    projectId: '',
    title: '',
    description: '',
    dueDate: '',
    status: 'pending',
  });
  const [saving, setSaving] = useState(false);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listPmMilestones({
        organizationId: orgId,
        status: filters.status || undefined,
        projectId: filters.projectId || undefined,
        limit: 200,
      });
      let rows = res.data || [];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter((m: any) =>
          [m.title, m.description, m.project?.name].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        );
      }
      setItems(rows);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(pmApiError(err, 'Failed to load milestones'));
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
    void listPmProjects({ organizationId: orgId, limit: 200 })
      .then((p) => setProjects(p.data || []))
      .catch(() => undefined);
  }, [orgId]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createPmMilestone({
        projectId: form.projectId,
        title: form.title,
        description: form.description || null,
        dueDate: form.dueDate || null,
        status: form.status,
      });
      toast.success('Milestone created');
      setShowCreate(false);
      setForm({ projectId: '', title: '', description: '', dueDate: '', status: 'pending' });
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to create milestone'));
    } finally {
      setSaving(false);
    }
  }

  const filterFields = useMemo<FilterField[]>(() => [
    { key: 'status', label: 'Status', type: 'select', options: MILESTONE_STATUSES.map((s) => ({ value: s.value, label: s.label })) },
    { key: 'projectId', label: 'Project', type: 'select', options: projects.map((p) => ({ value: String(p.id), label: p.name })) },
  ], [projects]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'title',
      header: 'Milestone',
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
      accessorKey: 'dueDate',
      header: 'Due',
      cell: (i) => formatDate(i.getValue() as string),
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (i) => (
        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(i.getValue() as string)}`}>
          {String(i.getValue() || '')}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const m = info.row.original;
        if (m.status !== 'pending') return null;
        return (
          <button
            type="button"
            className="text-xs text-emerald-600 hover:underline"
            onClick={async () => {
              try {
                await updatePmMilestone(m.id, { status: 'achieved', completedAt: new Date().toISOString() });
                toast.success('Milestone achieved');
                void load();
              } catch (err) {
                toast.error(pmApiError(err));
              }
            }}
          >
            Achieve
          </button>
        );
      },
    },
  ], [load]);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Milestones" actions={[{ label: 'Create Milestone', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]} />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Milestones API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">GET /api/pm/milestones</code>.</div>
              </div>
            </div>
          )}
          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search milestones…"
            stats={[{ label: 'Milestones', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />
          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <Flag className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No milestones yet</p>
              <p className="text-sm mt-1">Track key dates and mark them achieved when hit.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600"
              >
                <Plus size={16} /> Create Milestone
              </button>
            </div>
          ) : (
            <RichDataTable columns={columns} data={items} hideSearch />
          )}
        </main>
      </div>

      <PmModal open={showCreate} onClose={() => setShowCreate(false)} title="Create Milestone" icon={Flag}>
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
          <PmField label="Due date">
            <input type="date" className={pmInputClass} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
          </PmField>
          <PmField label="Status">
            <select className={pmInputClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
              {MILESTONE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </PmField>
          <PmModalActions onCancel={() => setShowCreate(false)} submitLabel="Create Milestone" submitting={saving} />
        </form>
      </PmModal>
    </div>
  );
}
