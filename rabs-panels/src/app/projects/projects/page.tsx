'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import { listPmProjects, createPmProject, listCustomers, listUsers } from '@/lib/api';
import {
  formatDate, formatMoney, pmApiError, progressBarColor, PROJECT_STATUSES,
  statusBadgeClass, userLabel,
} from '@/lib/pm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { AlertCircle, Eye, FolderKanban, Plus } from 'lucide-react';
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

export default function ProjectsListPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [apiMissing, setApiMissing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [customers, setCustomers] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listPmProjects({
        organizationId: orgId,
        search: search || undefined,
        status: filters.status || undefined,
        ownerUserId: filters.ownerUserId || undefined,
      });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(pmApiError(err, 'Failed to load projects'));
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
    void (async () => {
      try {
        const [cust, us] = await Promise.all([
          listCustomers({ organizationId: orgId, limit: 200 }),
          listUsers(),
        ]);
        setCustomers(cust.data || []);
        setUsers(us.data || []);
      } catch { /* optional */ }
    })();
  }, [orgId]);

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
        ownerUserId: form.ownerUserId || session?.user?.id || null,
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

  const customerOptions = useMemo(
    () => customers.map((c) => ({
      id: String(c.id),
      label: displayName(c),
      sublabel: c.email || c.companyName,
    })),
    [customers]
  );

  const filterFields = useMemo<FilterField[]>(() => [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      options: PROJECT_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    },
  ], []);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Project',
      cell: (info) => (
        <Link href={`/projects/projects/${info.row.original.id}`} className="font-semibold text-brand hover:underline">
          {info.getValue() as string}
        </Link>
      ),
    },
    {
      accessorKey: 'code',
      header: 'Code',
      cell: (i) => <span className="font-mono text-xs">{(i.getValue() as string) || '—'}</span>,
    },
    {
      id: 'customer',
      header: 'Customer',
      cell: (info) => {
        const r = info.row.original;
        return displayName(r.customer) !== '—' ? displayName(r.customer) : (r.customerId ? `#${r.customerId}` : '—');
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (i) => (
        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusBadgeClass(i.getValue() as string)}`}>
          {String(i.getValue() || '').replace(/_/g, ' ')}
        </span>
      ),
    },
    {
      id: 'dates',
      header: 'Timeline',
      cell: (info) => {
        const r = info.row.original;
        return <span className="text-sm text-muted-foreground">{formatDate(r.startDate)} → {formatDate(r.endDate)}</span>;
      },
    },
    {
      id: 'budget',
      header: 'Budget',
      cell: (info) => formatMoney(info.row.original.budget, info.row.original.currency),
    },
    {
      id: 'progress',
      header: 'Progress',
      cell: (info) => {
        const pct = Number(info.row.original.progressPct) || 0;
        return (
          <div className="min-w-[100px] space-y-1">
            <div className="text-xs font-medium">{pct.toFixed(0)}%</div>
            <div className="h-1.5 rounded-full bg-muted overflow-hidden">
              <div className={`h-full rounded-full ${progressBarColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
          </div>
        );
      },
    },
    {
      id: 'owner',
      header: 'Owner',
      cell: (info) => userLabel(info.row.original.owner),
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => (
        <Link href={`/projects/projects/${info.row.original.id}`} className="p-2 rounded-lg hover:bg-muted text-muted-foreground inline-flex">
          <Eye size={16} />
        </Link>
      ),
    },
  ], []);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Projects"
          actions={[{ label: 'Create Project', onClick: () => setShowCreate(true), icon: <Plus size={18} /> }]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Projects API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">GET /api/pm/projects</code>.</div>
              </div>
            </div>
          )}

          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search projects…"
            stats={[{ label: 'Projects', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />

          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <FolderKanban className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No projects yet</p>
              <p className="text-sm mt-1">Create a job with scope, objectives, dates, and budget.</p>
              <button
                type="button"
                onClick={() => setShowCreate(true)}
                className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600"
              >
                <Plus size={16} /> Create Project
              </button>
            </div>
          ) : (
            <RichDataTable columns={columns} data={items} hideSearch searchPlaceholder="Filter table…" />
          )}
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
