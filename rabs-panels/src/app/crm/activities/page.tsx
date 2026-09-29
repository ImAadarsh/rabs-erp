'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import { useSession } from '@/hooks/use-session';
import { listCrmActivities, createCrmActivity, completeCrmActivity, updateCrmActivity } from '@/lib/api';
import { ACTIVITY_TYPES, crmApiError } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Plus, Check, AlertCircle, PhoneCall, RotateCcw, Send } from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass, crmTextareaClass } from '@/components/crm/crm-modal';

export default function CrmActivitiesPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filters, setFilters] = useState<Record<string, string>>({ mine: '0', openOnly: '1' });
  const [apiMissing, setApiMissing] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({
    type: 'task' as 'task' | 'call' | 'meeting' | 'note',
    subject: '',
    body: '',
    dueAt: '',
  });
  const [saving, setSaving] = useState(false);

  const orgId = session?.user?.organizationId;
  const userId = session?.user?.id;

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const params: Record<string, any> = {
        organizationId: orgId,
        type: filters.type || undefined,
      };
      if (filters.mine === '1' && userId) params.ownerUserId = userId;
      if (filters.openOnly === '1') params.openOnly = true;
      if (filters.overdue === '1') params.overdue = true;
      const res = await listCrmActivities(params);
      let rows = res.data || [];
      if (search.trim()) {
        const q = search.trim().toLowerCase();
        rows = rows.filter((a: any) =>
          [a.subject, a.body, a.type].filter(Boolean).some((v) => String(v).toLowerCase().includes(q))
        );
      }
      setItems(rows);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(crmApiError(err, 'Failed to load activities'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, userId, filters, search]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createCrmActivity({
        organizationId: orgId,
        type: form.type,
        subject: form.subject,
        body: form.body || undefined,
        dueAt: form.dueAt || undefined,
        ownerUserId: userId,
      });
      toast.success('Activity created');
      setShowCreate(false);
      setForm({ type: 'task', subject: '', body: '', dueAt: '' });
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create activity'));
    } finally {
      setSaving(false);
    }
  }

  async function handleComplete(activity: any) {
    try {
      await completeCrmActivity(activity.id);
      toast.success('Marked complete');
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to complete activity'));
    }
  }

  async function handleReopen(activity: any) {
    try {
      await updateCrmActivity(activity.id, { completed: false });
      toast.success('Reopened');
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to reopen'));
    }
  }

  const filterFields = useMemo<FilterField[]>(() => [
    {
      key: 'mine',
      label: 'Assignee',
      type: 'select',
      primary: true,
      options: [
        { value: '0', label: 'All' },
        { value: '1', label: 'My tasks' },
      ],
    },
    {
      key: 'openOnly',
      label: 'Open only',
      type: 'select',
      primary: true,
      options: [
        { value: '1', label: 'Open' },
        { value: '0', label: 'All statuses' },
      ],
    },
    {
      key: 'overdue',
      label: 'Overdue',
      type: 'select',
      primary: true,
      options: [{ value: '1', label: 'Overdue only' }],
    },
    {
      key: 'type',
      label: 'Type',
      type: 'select',
      options: ACTIVITY_TYPES.map((t) => ({ value: t.value, label: t.label })),
    },
  ], []);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'type',
      header: 'Type',
      cell: (i) => (
        <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border border-border bg-muted/40">
          {i.getValue() as string}
        </span>
      ),
    },
    { accessorKey: 'subject', header: 'Subject', cell: (i) => <span className="font-semibold">{i.getValue() as string}</span> },
    {
      accessorKey: 'dueAt',
      header: 'Due',
      cell: (i) => {
        const v = i.getValue() as string;
        if (!v) return '—';
        const d = new Date(v);
        const overdue = !i.row.original.completedAt && d.getTime() < Date.now();
        return <span className={overdue ? 'text-rose-600 font-medium' : ''}>{d.toLocaleString()}</span>;
      },
    },
    {
      id: 'status',
      header: 'Status',
      cell: (info) => {
        const done = !!info.row.original.completedAt;
        return (
          <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${
            done ? 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20' : 'bg-brand/10 text-brand border-brand/25'
          }`}>
            {done ? 'completed' : 'open'}
          </span>
        );
      },
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => {
        const a = info.row.original;
        return (
          <div className="flex justify-end gap-1">
            {!a.completedAt ? (
              <button type="button" title="Complete" onClick={() => handleComplete(a)} className="p-2 rounded-lg hover:bg-muted text-emerald-600">
                <Check size={16} />
              </button>
            ) : (
              <button type="button" title="Reopen" onClick={() => handleReopen(a)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground">
                <RotateCcw size={16} />
              </button>
            )}
          </div>
        );
      },
    },
  ], []);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Activities"
          actions={[
            {
              label: 'Log Call',
              onClick: () => {
                setForm({ type: 'call', subject: '', body: '', dueAt: '' });
                setShowCreate(true);
              },
              icon: <PhoneCall size={16} />,
              variant: 'secondary',
            },
            {
              label: 'New Task',
              onClick: () => {
                setForm({ type: 'task', subject: '', body: '', dueAt: '' });
                setShowCreate(true);
              },
              icon: <Plus size={16} />,
              variant: 'secondary',
            },
            {
              label: 'Create Activity',
              onClick: () => {
                setForm({ type: 'task', subject: '', body: '', dueAt: '' });
                setShowCreate(true);
              },
              icon: <Plus size={18} />,
            },
          ]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Activities API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">/api/crm/activities</code>.</div>
              </div>
            </div>
          )}

          <FilterBar
            fields={filterFields}
            values={filters}
            onChange={setFilters}
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Search activities…"
            stats={[{ label: 'Items', value: loading ? '…' : String(items.length) }]}
            loading={loading}
          />

          {!loading && items.length === 0 && !apiMissing ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <PhoneCall className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No activities match</p>
              <p className="text-sm mt-1">Create a task, call, or note — or clear filters.</p>
              <div className="mt-4 flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setForm({ type: 'call', subject: '', body: '', dueAt: '' });
                    setShowCreate(true);
                  }}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium border border-border bg-background hover:bg-muted"
                >
                  <PhoneCall size={16} /> Log Call
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setForm({ type: 'task', subject: '', body: '', dueAt: '' });
                    setShowCreate(true);
                  }}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                >
                  <Plus size={16} /> Create Activity
                </button>
              </div>
            </div>
          ) : (
            <RichDataTable data={items} columns={columns} hideSearch />
          )}
        </main>
      </div>

      <CrmModal open={showCreate} onClose={() => setShowCreate(false)} title="New Activity" icon={Plus}>
        <form onSubmit={handleCreate} className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Type">
              <select value={form.type} onChange={(e) => setForm({ ...form, type: e.target.value as any })} className={crmInputClass}>
                {ACTIVITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </CrmField>
            <CrmField label="Due">
              <input
                type="datetime-local"
                value={form.dueAt}
                onChange={(e) => setForm({ ...form, dueAt: e.target.value })}
                className={crmInputClass}
              />
            </CrmField>
          </div>
          <CrmField label="Subject">
            <input
              required
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Follow up on credit docs"
            />
          </CrmField>
          <CrmField label="Details">
            <textarea
              value={form.body}
              onChange={(e) => setForm({ ...form, body: e.target.value })}
              className={crmTextareaClass}
              placeholder="Notes for the assignee…"
            />
          </CrmField>
          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel="Create Activity"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
