'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import {
  listCrmLeads,
  createCrmLead,
  updateCrmLead,
  convertCrmLead,
  listCrmPipelines,
  syncCrmLeadToMarketing,
  listCrmAssignableUsers,
  bulkAssignCrmLeads,
} from '@/lib/api';
import { crmApiError, displayName, LEAD_SOURCES, LEAD_STATUSES, LEAD_PRIORITIES } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Pencil, ArrowRightLeft, AlertCircle, Target, Send, Megaphone, UserPlus, Users } from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass, crmTextareaClass } from '@/components/crm/crm-modal';

type AssignableUser = {
  id: string;
  email: string;
  firstName?: string | null;
  lastName?: string | null;
  role?: string;
};

const emptyForm = {
  name: '',
  company: '',
  email: '',
  phone: '',
  source: 'website',
  status: 'new',
  priority: 'medium',
  score: '',
  disqualifiedReason: '',
  notes: '',
  ownerUserId: '',
};

function statusBadgeClass(status: string) {
  switch (status) {
    case 'qualified':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'contacted':
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
    case 'new':
      return 'bg-brand/10 text-brand border-brand/25';
    case 'converted':
      return 'bg-zaam-500/10 text-zaam-600 border-zaam-500/20';
    case 'lost':
    case 'unqualified':
      return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    default:
      return 'bg-muted/40 text-muted-foreground border-border';
  }
}

function priorityBadgeClass(priority: string) {
  switch (priority) {
    case 'urgent':
      return 'bg-rose-500/15 text-rose-600 border-rose-500/25';
    case 'high':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'low':
      return 'bg-muted/40 text-muted-foreground border-border';
    default:
      return 'bg-blue-500/10 text-blue-600 border-blue-500/20';
  }
}

function ownerLabel(user?: AssignableUser | { firstName?: string | null; lastName?: string | null; email?: string; name?: string } | null) {
  if (!user) return 'Unassigned';
  return displayName({
    firstName: user.firstName ?? undefined,
    lastName: user.lastName ?? undefined,
    email: user.email,
    name: 'name' in user ? user.name : undefined,
  });
}

export default function CrmLeadsPage() {
  return (
    <Suspense fallback={<div className="min-h-screen app-surface" />}>
      <CrmLeadsPageInner />
    </Suspense>
  );
}

function CrmLeadsPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, hydrated } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [apiMissing, setApiMissing] = useState(false);
  const [modal, setModal] = useState<'create' | 'edit' | 'convert' | 'assign' | null>(
    searchParams.get('new') === 'true' ? 'create' : null
  );
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState(emptyForm);
  const [convertForm, setConvertForm] = useState({
    createDeal: true,
    dealName: '',
    pipelineId: '',
    stageId: '',
    dealAmount: '',
    currency: 'GBP',
  });
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [assignableUsers, setAssignableUsers] = useState<AssignableUser[]>([]);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignSearch, setAssignSearch] = useState('');
  const [assignTargets, setAssignTargets] = useState<any[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const orgId = session?.user?.organizationId;

  const loadUsers = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await listCrmAssignableUsers({ organizationId: orgId });
      setAssignableUsers(res.data || []);
    } catch {
      setAssignableUsers([]);
    }
  }, [orgId]);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const res = await listCrmLeads({
        organizationId: orgId,
        search: search || undefined,
        status: filters.status || undefined,
        priority: filters.priority || undefined,
        ownerUserId: filters.ownerUserId === 'unassigned' ? undefined : filters.ownerUserId || undefined,
      });
      let rows = res.data || [];
      if (filters.ownerUserId === 'unassigned') {
        rows = rows.filter((l: any) => !l.ownerUserId && !l.owner?.id);
      }
      setItems(rows);
      setApiMissing(false);
      setSelectedIds(new Set());
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(crmApiError(err, 'Failed to load leads'));
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
    void loadUsers();
  }, [hydrated, session?.accessToken, router, load, loadUsers]);

  useEffect(() => {
    if (modal !== 'convert' || !orgId) return;
    listCrmPipelines({ organizationId: orgId })
      .then((r) => {
        const list = r.data || [];
        setPipelines(list);
        const def = list.find((p: any) => p.isDefault) || list[0];
        if (def) {
          setConvertForm((f) => ({
            ...f,
            pipelineId: def.id,
            stageId: def.stages?.[0]?.id || '',
          }));
        }
      })
      .catch(() => setPipelines([]));
  }, [modal, orgId]);

  function openCreate() {
    setEditing(null);
    setForm({
      ...emptyForm,
      ownerUserId: session?.user?.id || '',
    });
    setModal('create');
  }

  function openEdit(lead: any) {
    setEditing(lead);
    setForm({
      name: lead.name || '',
      company: lead.company || '',
      email: lead.email || '',
      phone: lead.phone || '',
      source: lead.source || 'website',
      status: lead.status || 'new',
      priority: lead.priority || 'medium',
      score: lead.score != null ? String(lead.score) : '',
      disqualifiedReason: lead.disqualifiedReason || '',
      notes: lead.notes || '',
      ownerUserId: lead.ownerUserId || lead.owner?.id || '',
    });
    setModal('edit');
  }

  function openAssign(leads: any[]) {
    if (!leads.length) return;
    setAssignTargets(leads);
    setAssignUserId(leads.length === 1 ? (leads[0].ownerUserId || leads[0].owner?.id || '') : '');
    setAssignSearch('');
    setModal('assign');
  }

  function openConvert(lead: any) {
    setEditing(lead);
    setConvertForm({
      createDeal: true,
      dealName: lead.company ? `${lead.company} opportunity` : `Deal — ${lead.name}`,
      pipelineId: '',
      stageId: '',
      dealAmount: '',
      currency: 'GBP',
    });
    setModal('convert');
  }

  function toggleSelect(id: string) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAll() {
    if (selectedIds.size === items.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(items.map((l) => String(l.id))));
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload: Record<string, unknown> = {
      name: form.name,
      company: form.company || null,
      email: form.email || null,
      phone: form.phone || null,
      source: form.source,
      status: form.status,
      priority: form.priority,
      score: form.score !== '' ? Number(form.score) : null,
      disqualifiedReason: form.status === 'unqualified' ? (form.disqualifiedReason || null) : null,
      notes: form.notes || null,
    };
    if (form.ownerUserId) {
      payload.ownerUserId = form.ownerUserId;
    } else if (modal === 'edit') {
      payload.ownerUserId = null;
    }
    try {
      if (modal === 'edit' && editing) {
        await updateCrmLead(editing.id, payload);
        toast.success('Lead updated');
      } else {
        await createCrmLead({ organizationId: orgId, ...payload } as any);
        toast.success(form.ownerUserId ? 'Lead created' : 'Lead created (auto-assign if enabled)');
      }
      setModal(null);
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to save lead'));
    } finally {
      setSaving(false);
    }
  }

  async function handleAssign(e: React.FormEvent) {
    e.preventDefault();
    if (!assignUserId || !assignTargets.length) {
      toast.error('Select a person to assign to');
      return;
    }
    setSaving(true);
    try {
      if (assignTargets.length === 1) {
        await updateCrmLead(assignTargets[0].id, { ownerUserId: assignUserId });
        toast.success('Lead assigned');
      } else {
        const res = await bulkAssignCrmLeads({
          leadIds: assignTargets.map((l) => String(l.id)),
          ownerUserId: assignUserId,
          organizationId: orgId,
        });
        toast.success(`Assigned ${res.data?.updated ?? assignTargets.length} lead(s)`);
      }
      setModal(null);
      setSelectedIds(new Set());
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to assign lead'));
    } finally {
      setSaving(false);
    }
  }

  async function handleConvert(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    setSaving(true);
    try {
      const res = await convertCrmLead(editing.id, {
        createDeal: convertForm.createDeal,
        dealName: convertForm.dealName || undefined,
        dealAmount: convertForm.dealAmount ? Number(convertForm.dealAmount) : undefined,
        currency: convertForm.currency,
        pipelineId: convertForm.pipelineId || undefined,
        stageId: convertForm.stageId || undefined,
        ownerUserId: editing.ownerUserId || editing.owner?.id || session?.user?.id,
      });
      toast.success('Lead converted');
      setModal(null);
      if (res.data?.customer?.id) router.push(`/crm/accounts/${res.data.customer.id}`);
      else if (res.data?.deal?.id) router.push(`/crm/deals/${res.data.deal.id}`);
      else void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to convert lead'));
    } finally {
      setSaving(false);
    }
  }

  async function handleSyncToMarketing(lead: any) {
    if (!lead?.id) return;
    if (!lead.email) {
      toast.error('Lead needs an email to sync to Marketing');
      return;
    }
    setSaving(true);
    try {
      const res = await syncCrmLeadToMarketing(lead.id);
      if (res.data?.added) toast.success('Synced to Marketing · CRM Leads segment');
      else toast.success('Already in Marketing · CRM Leads segment');
    } catch (err) {
      toast.error(crmApiError(err, 'Sync to Marketing failed'));
    } finally {
      setSaving(false);
    }
  }

  const filteredAssignable = useMemo(() => {
    const q = assignSearch.trim().toLowerCase();
    if (!q) return assignableUsers;
    return assignableUsers.filter((u) => {
      const label = `${u.firstName || ''} ${u.lastName || ''} ${u.email} ${u.role || ''}`.toLowerCase();
      return label.includes(q);
    });
  }, [assignableUsers, assignSearch]);

  const filterFields = useMemo<FilterField[]>(() => [
    {
      key: 'status',
      label: 'Status',
      type: 'select',
      primary: true,
      options: LEAD_STATUSES.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      key: 'priority',
      label: 'Priority',
      type: 'select',
      primary: true,
      options: LEAD_PRIORITIES.map((s) => ({ value: s.value, label: s.label })),
    },
    {
      key: 'ownerUserId',
      label: 'Owner',
      type: 'select',
      primary: true,
      options: [
        { value: 'unassigned', label: 'Unassigned' },
        ...assignableUsers.map((u) => ({
          value: String(u.id),
          label: ownerLabel(u),
        })),
      ],
    },
  ], [assignableUsers]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'select',
      header: () => (
        <input
          type="checkbox"
          checked={items.length > 0 && selectedIds.size === items.length}
          onChange={toggleSelectAll}
          aria-label="Select all"
        />
      ),
      cell: (info) => {
        const id = String(info.row.original.id);
        return (
          <input
            type="checkbox"
            checked={selectedIds.has(id)}
            onChange={() => toggleSelect(id)}
            aria-label={`Select ${info.row.original.name}`}
          />
        );
      },
      enableSorting: false,
    },
    {
      accessorKey: 'name',
      header: 'Lead',
      cell: (info) => <span className="font-semibold">{(info.getValue() as string) || displayName(info.row.original)}</span>,
    },
    { accessorKey: 'company', header: 'Company', cell: (i) => (i.getValue() as string) || '—' },
    { accessorKey: 'email', header: 'Email', cell: (i) => (i.getValue() as string) || '—' },
    {
      id: 'owner',
      header: 'Assigned to',
      cell: (info) => {
        const lead = info.row.original;
        const name = ownerLabel(lead.owner);
        const unassigned = !lead.ownerUserId && !lead.owner?.id;
        return (
          <span className={unassigned ? 'text-amber-600 text-xs font-medium' : 'text-sm'}>
            {unassigned ? 'Unassigned' : name}
          </span>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: (info) => {
        const val = String(info.getValue() || '');
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusBadgeClass(val)}`}>
            {val}
          </span>
        );
      },
    },
    {
      accessorKey: 'priority',
      header: 'Priority',
      cell: (info) => {
        const val = String(info.getValue() || 'medium');
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${priorityBadgeClass(val)}`}>
            {val}
          </span>
        );
      },
    },
    {
      accessorKey: 'score',
      header: 'Score',
      cell: (i) => (i.getValue() != null ? String(i.getValue()) : '—'),
    },
    {
      accessorKey: 'source',
      header: 'Source',
      cell: (i) => (
        <span className="text-xs text-muted-foreground capitalize">{String(i.getValue() || '—').replace(/_/g, ' ')}</span>
      ),
    },
    {
      accessorKey: 'createdAt',
      header: 'Created',
      cell: (i) => (i.getValue() ? new Date(i.getValue() as string).toLocaleDateString() : '—'),
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const lead = info.row.original;
        return (
          <div className="flex items-center gap-1 justify-end">
            <button
              type="button"
              title="Assign to…"
              onClick={() => openAssign([lead])}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand"
            >
              <UserPlus size={16} />
            </button>
            <button
              type="button"
              title="Sync to Marketing"
              disabled={saving || !lead.email}
              onClick={() => void handleSyncToMarketing(lead)}
              className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand disabled:opacity-40"
            >
              <Megaphone size={16} />
            </button>
            {lead.status !== 'converted' && (
              <button type="button" title="Convert" onClick={() => openConvert(lead)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-brand">
                <ArrowRightLeft size={16} />
              </button>
            )}
            <button type="button" title="Edit" onClick={() => openEdit(lead)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
              <Pencil size={16} />
            </button>
          </div>
        );
      },
    },
  ], [saving, selectedIds, items]);

  const selectedPipeline = pipelines.find((p) => p.id === convertForm.pipelineId);
  const selectedLeads = items.filter((l) => selectedIds.has(String(l.id)));

  const ownerSelect = (
    <CrmField label="Owner / Assigned to" hint={modal === 'create' ? 'Leave blank to auto-assign (round-robin) when enabled' : undefined}>
      <select
        value={form.ownerUserId}
        onChange={(e) => setForm({ ...form, ownerUserId: e.target.value })}
        className={crmInputClass}
        required={modal === 'edit'}
      >
        <option value="">{modal === 'create' ? 'Auto-assign / Unassigned' : 'Unassigned'}</option>
        {assignableUsers.map((u) => (
          <option key={u.id} value={u.id}>
            {ownerLabel(u)}{u.role ? ` · ${u.role}` : ''}
          </option>
        ))}
      </select>
      {!assignableUsers.length && (
        <p className="text-[11px] text-amber-600 mt-1">
          No assignable users found. Add SALES_REP / ADMIN roles or re-run CRM seed.
        </p>
      )}
    </CrmField>
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Leads"
          actions={[
            {
              label: 'Assign',
              onClick: () => {
                if (selectedLeads.length) openAssign(selectedLeads);
                else if (items.length === 1) openAssign(items);
                else toast.info('Select one or more leads, then Assign');
              },
              icon: <UserPlus size={16} />,
              variant: 'secondary',
            },
            { label: 'Create Lead', onClick: openCreate, icon: <Plus size={18} /> },
          ]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Leads API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">/api/crm/leads</code>.</div>
              </div>
            </div>
          )}

          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search leads…"
            stats={[{ label: 'Leads', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />

          {selectedLeads.length > 0 && (
            <div className="flex flex-wrap items-center gap-3 rounded-xl border border-brand/30 bg-brand/5 px-4 py-3 text-sm">
              <Users size={16} className="text-brand" />
              <span className="font-medium">{selectedLeads.length} selected</span>
              <button
                type="button"
                onClick={() => openAssign(selectedLeads)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-brand text-white text-xs font-semibold hover:opacity-90"
              >
                <UserPlus size={14} /> Assign to…
              </button>
              <button
                type="button"
                onClick={() => setSelectedIds(new Set())}
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                Clear
              </button>
            </div>
          )}

          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <Target className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No leads yet</p>
              <p className="text-sm mt-1">Capture inbound interest and convert qualified leads into accounts and deals.</p>
              <button
                type="button"
                onClick={openCreate}
                className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
              >
                <Plus size={16} /> Create Lead
              </button>
            </div>
          ) : (
            <RichDataTable data={items} columns={columns} hideSearch />
          )}
        </main>
      </div>

      <CrmModal
        open={modal === 'create' || modal === 'edit'}
        onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Edit Lead' : 'New Lead'}
        icon={modal === 'edit' ? Pencil : Plus}
      >
        <form onSubmit={handleSave} className="space-y-4">
          <CrmField label="Name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Aisha Khan"
            />
          </CrmField>
          {ownerSelect}
          <CrmField label="Company">
            <input
              value={form.company}
              onChange={(e) => setForm({ ...form, company: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Khan Convenience"
            />
          </CrmField>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Email">
              <input
                type="email"
                value={form.email}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className={crmInputClass}
                placeholder="name@example.com"
              />
            </CrmField>
            <CrmField label="Phone">
              <input
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                className={crmInputClass}
                placeholder="+44…"
              />
            </CrmField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Source">
              <select value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} className={crmInputClass}>
                {LEAD_SOURCES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </CrmField>
            <CrmField label="Status">
              <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className={crmInputClass}>
                {LEAD_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </CrmField>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Priority">
              <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value })} className={crmInputClass}>
                {LEAD_PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </CrmField>
            <CrmField label="Score (0–100)">
              <input
                type="number"
                min={0}
                max={100}
                value={form.score}
                onChange={(e) => setForm({ ...form, score: e.target.value })}
                className={crmInputClass}
                placeholder="e.g. 75"
              />
            </CrmField>
          </div>
          {form.status === 'unqualified' && (
            <CrmField label="Disqualify reason">
              <input
                value={form.disqualifiedReason}
                onChange={(e) => setForm({ ...form, disqualifiedReason: e.target.value })}
                className={crmInputClass}
                placeholder="Why was this lead disqualified?"
              />
            </CrmField>
          )}
          <CrmField label="Notes">
            <textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              className={crmTextareaClass}
              placeholder="Context, next steps…"
            />
          </CrmField>
          <CrmModalActions
            onCancel={() => setModal(null)}
            submitLabel={modal === 'edit' ? 'Save Lead' : 'Create Lead'}
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal
        open={modal === 'assign'}
        onClose={() => setModal(null)}
        title={assignTargets.length > 1 ? `Assign ${assignTargets.length} leads` : `Assign ${assignTargets[0]?.name || 'lead'}`}
        icon={UserPlus}
      >
        <form onSubmit={handleAssign} className="space-y-4">
          <p className="text-xs text-muted-foreground">
            Choose who owns {assignTargets.length > 1 ? 'these leads' : 'this lead'}. A follow-up task is created when auto follow-up is enabled.
          </p>
          <CrmField label="Search staff">
            <input
              value={assignSearch}
              onChange={(e) => setAssignSearch(e.target.value)}
              className={crmInputClass}
              placeholder="Name, email, or role…"
              autoFocus
            />
          </CrmField>
          <CrmField label="Assign to">
            <select
              required
              value={assignUserId}
              onChange={(e) => setAssignUserId(e.target.value)}
              className={crmInputClass}
              size={Math.min(8, Math.max(4, filteredAssignable.length + 1))}
            >
              <option value="">Select person…</option>
              {filteredAssignable.map((u) => (
                <option key={u.id} value={u.id}>
                  {ownerLabel(u)}{u.role ? ` · ${u.role}` : ''} — {u.email}
                </option>
              ))}
            </select>
            {!assignableUsers.length && (
              <p className="text-[11px] text-amber-600 mt-1">
                No assignable users. Ensure staff have SALES_REP, ADMIN, or CS_AGENT roles.
              </p>
            )}
          </CrmField>
          <CrmModalActions
            onCancel={() => setModal(null)}
            submitLabel={assignTargets.length > 1 ? 'Assign all' : 'Assign'}
            submitting={saving}
            submitIcon={<UserPlus size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={modal === 'convert' && !!editing} onClose={() => setModal(null)} title={editing ? `Convert ${editing.name}` : 'Convert'} icon={ArrowRightLeft}>
        <form onSubmit={handleConvert} className="space-y-4">
          <p className="text-xs text-muted-foreground">Creates or links an ERP customer. Optionally create a deal on a pipeline.</p>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={convertForm.createDeal} onChange={(e) => setConvertForm({ ...convertForm, createDeal: e.target.checked })} />
            Create deal
          </label>
          {convertForm.createDeal && (
            <>
              <CrmField label="Deal name">
                <input
                  required
                  value={convertForm.dealName}
                  onChange={(e) => setConvertForm({ ...convertForm, dealName: e.target.value })}
                  className={crmInputClass}
                />
              </CrmField>
              <CrmField label="Pipeline">
                <select
                  value={convertForm.pipelineId}
                  onChange={(e) => {
                    const p = pipelines.find((x) => x.id === e.target.value);
                    setConvertForm({ ...convertForm, pipelineId: e.target.value, stageId: p?.stages?.[0]?.id || '' });
                  }}
                  className={crmInputClass}
                >
                  <option value="">Select pipeline</option>
                  {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </CrmField>
              <div className="grid grid-cols-2 gap-4">
                <CrmField label="Stage">
                  <select value={convertForm.stageId} onChange={(e) => setConvertForm({ ...convertForm, stageId: e.target.value })} className={crmInputClass}>
                    <option value="">Select stage</option>
                    {(selectedPipeline?.stages || []).map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
                  </select>
                </CrmField>
                <CrmField label="Amount">
                  <input
                    type="number"
                    step="0.01"
                    value={convertForm.dealAmount}
                    onChange={(e) => setConvertForm({ ...convertForm, dealAmount: e.target.value })}
                    className={crmInputClass}
                    placeholder="0.00"
                  />
                </CrmField>
              </div>
            </>
          )}
          <CrmModalActions
            onCancel={() => setModal(null)}
            submitLabel="Convert Lead"
            submitting={saving}
            submitIcon={<ArrowRightLeft size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
