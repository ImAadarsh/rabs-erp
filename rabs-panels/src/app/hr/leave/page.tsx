'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listLeaveRequests, createLeaveRequest, listEmployees,
  approveLeaveRequest, rejectLeaveRequest, listLeaveBalances,
  listSickEpisodes, createSickEpisode,
} from '@/lib/api';
import { employeeName, formatDate, hrApiError, isApiMissing, LEAVE_TYPES, statusBadgeClass } from '@/lib/hr-utils';
import { HrModal, HrField, HrModalActions, hrInputClass, hrTextareaClass } from '@/components/hr/hr-modal';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import { Check, Plus, Thermometer, X } from 'lucide-react';

export default function LeavePage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [employees, setEmployees] = useState<any[]>([]);
  const [sick, setSick] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [view, setView] = useState<'leave' | 'ssp'>('leave');
  const [open, setOpen] = useState(false);
  const [sickOpen, setSickOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    employeeId: '',
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    totalDays: 1,
    reason: '',
    notes: '',
  });
  const [sickForm, setSickForm] = useState({
    employeeId: '',
    startDate: '',
    endDate: '',
    waitingDays: 3,
    fitNoteReceived: false,
    notes: '',
  });

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [leaveRes, empRes] = await Promise.all([
        listLeaveRequests({}),
        listEmployees({ organizationId: orgId }),
      ]);
      setItems(leaveRes.data || []);
      setEmployees(empRes.data || []);
      try {
        const b = await listLeaveBalances({ organizationId: orgId });
        setBalances(b.data || []);
      } catch { setBalances([]); }
      try {
        const s = await listSickEpisodes({ organizationId: orgId });
        setSick(s.data || []);
      } catch { setSick([]); }
    } catch (err) {
      toast.error(hrApiError(err, 'Failed to load leave'));
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  useEffect(() => {
    if (form.startDate && form.endDate) {
      const start = new Date(form.startDate);
      const end = new Date(form.endDate);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      setForm((f) => ({ ...f, totalDays: days }));
    }
  }, [form.startDate, form.endDate]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createLeaveRequest({
        employeeId: form.employeeId,
        leaveType: form.leaveType as any,
        startDate: form.startDate,
        endDate: form.endDate,
        totalDays: form.totalDays,
        reason: form.reason || undefined,
        notes: form.notes || undefined,
      });
      toast.success('Leave request submitted');
      setOpen(false);
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Failed to create leave request'));
    } finally {
      setSaving(false);
    }
  }

  async function onApprove(id: string) {
    try {
      await approveLeaveRequest(id);
      toast.success('Approved');
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Approve failed'));
    }
  }

  async function onReject(id: string) {
    const reason = window.prompt('Rejection reason (optional)') || undefined;
    try {
      await rejectLeaveRequest(id, { rejectionReason: reason });
      toast.success('Rejected');
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Reject failed'));
    }
  }

  async function onSick(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createSickEpisode({ ...sickForm, organizationId: orgId });
      toast.success('Sick / SSP episode recorded');
      setSickOpen(false);
      void load();
    } catch (err) {
      toast.error(isApiMissing(err) ? 'SSP API not live yet' : hrApiError(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'employee',
      header: 'Employee',
      cell: ({ row }) => employeeName(row.original.employee),
    },
    {
      accessorKey: 'leaveType',
      header: 'Type',
      cell: ({ row }) => <span className="capitalize">{(row.original.leaveType || '').replace(/_/g, ' ')}</span>,
    },
    {
      id: 'dates',
      header: 'Dates',
      cell: ({ row }) => `${formatDate(row.original.startDate)} → ${formatDate(row.original.endDate)}`,
    },
    { accessorKey: 'totalDays', header: 'Days' },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => (
        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadgeClass(row.original.status)}`}>
          {row.original.status}
        </span>
      ),
    },
    {
      id: 'actions',
      header: '',
      cell: ({ row }) => {
        if (row.original.status !== 'pending') return null;
        return (
          <div className="flex gap-1">
            <button type="button" onClick={() => onApprove(row.original.id)} className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/10" title="Approve">
              <Check size={16} />
            </button>
            <button type="button" onClick={() => onReject(row.original.id)} className="p-1.5 rounded-lg text-red-600 hover:bg-red-500/10" title="Reject">
              <X size={16} />
            </button>
          </div>
        );
      },
    },
  ], []);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Leave & SSP" />
        <main className="p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setView('leave')} className={`h-10 px-4 rounded-xl text-sm font-medium ${view === 'leave' ? 'bg-brand/15 ring-1 ring-brand/30' : 'bg-muted'}`}>Leave requests</button>
              <button type="button" onClick={() => setView('ssp')} className={`h-10 px-4 rounded-xl text-sm font-medium ${view === 'ssp' ? 'bg-brand/15 ring-1 ring-brand/30' : 'bg-muted'}`}>SSP / Sick</button>
            </div>
            <div className="flex gap-2">
              {view === 'ssp' ? (
                <button type="button" onClick={() => setSickOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20">
                  <Thermometer size={14} /> Record sick episode
                </button>
              ) : (
                <button type="button" onClick={() => setOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20">
                  <Plus size={14} /> Create leave request
                </button>
              )}
            </div>
          </div>

          {view === 'leave' && balances.length > 0 && (
            <div className="grid gap-3 sm:grid-cols-3">
              {balances.slice(0, 6).map((b: any) => (
                <div key={b.id} className="glass-panel rounded-xl border border-border/40 p-4">
                  <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                    {employeeName(b.employee)} · {(b.leaveType || 'leave').replace(/_/g, ' ')}
                  </div>
                  <div className="mt-1 text-xl font-bold text-brand">{b.remainingDays ?? b.balance ?? '—'}</div>
                  <div className="text-xs text-muted-foreground">remaining of {b.entitledDays ?? '—'}</div>
                </div>
              ))}
            </div>
          )}

          {view === 'leave' ? (
            <RichDataTable columns={columns} data={items} searchPlaceholder="Search leave…" />
          ) : (
            <div className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
              {sick.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-3">No SSP / sick episodes recorded yet.</p>
                  <button type="button" onClick={() => setSickOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-medium">
                    <Thermometer size={14} /> Record sick episode
                  </button>
                </div>
              )}
              {sick.map((s: any) => (
                <div key={s.id} className="px-5 py-3 border-b border-border/30 last:border-0 flex justify-between gap-3 text-sm">
                  <div>
                    <div className="font-medium">{employeeName(s.employee)}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDate(s.startDate)} → {formatDate(s.endDate)} · waiting days {s.waitingDays ?? 3}
                    </div>
                  </div>
                  <span className={`self-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadgeClass(s.status || 'open')}`}>
                    {s.status || 'open'} · wait {s.waitingDays ?? 3}d
                  </span>
                </div>
              ))}
            </div>
          )}
        </main>
      </div>

      <HrModal open={open} onClose={() => setOpen(false)} title="Request leave" icon={Plus}>
        <form onSubmit={onCreate} className="space-y-4">
          <HrField label="Employee">
            <select className={hrInputClass} required value={form.employeeId} onChange={(e) => setForm({ ...form, employeeId: e.target.value })}>
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{employeeName(e)}</option>)}
            </select>
          </HrField>
          <HrField label="Type">
            <select className={hrInputClass} value={form.leaveType} onChange={(e) => setForm({ ...form, leaveType: e.target.value })}>
              {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </HrField>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Start"><input type="date" className={hrInputClass} required value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} /></HrField>
            <HrField label="End"><input type="date" className={hrInputClass} required value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} /></HrField>
          </div>
          <HrField label="Total days"><input type="number" step="0.5" className={hrInputClass} value={form.totalDays} onChange={(e) => setForm({ ...form, totalDays: Number(e.target.value) })} /></HrField>
          <HrField label="Reason"><textarea className={hrTextareaClass} value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} /></HrField>
          <HrModalActions onCancel={() => setOpen(false)} submitLabel="Submit" submitting={saving} />
        </form>
      </HrModal>

      <HrModal open={sickOpen} onClose={() => setSickOpen(false)} title="Sick / SSP episode" icon={Thermometer}>
        <form onSubmit={onSick} className="space-y-4">
          <HrField label="Employee">
            <select className={hrInputClass} required value={sickForm.employeeId} onChange={(e) => setSickForm({ ...sickForm, employeeId: e.target.value })}>
              <option value="">Select…</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{employeeName(e)}</option>)}
            </select>
          </HrField>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Start"><input type="date" className={hrInputClass} required value={sickForm.startDate} onChange={(e) => setSickForm({ ...sickForm, startDate: e.target.value })} /></HrField>
            <HrField label="End"><input type="date" className={hrInputClass} value={sickForm.endDate} onChange={(e) => setSickForm({ ...sickForm, endDate: e.target.value })} /></HrField>
          </div>
          <HrField label="Waiting days"><input type="number" className={hrInputClass} value={sickForm.waitingDays} onChange={(e) => setSickForm({ ...sickForm, waitingDays: Number(e.target.value) })} /></HrField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={sickForm.fitNoteReceived} onChange={(e) => setSickForm({ ...sickForm, fitNoteReceived: e.target.checked })} />
            Fit note received
          </label>
          <HrField label="Notes"><textarea className={hrTextareaClass} value={sickForm.notes} onChange={(e) => setSickForm({ ...sickForm, notes: e.target.value })} /></HrField>
          <HrModalActions onCancel={() => setSickOpen(false)} submitLabel="Save" submitting={saving} />
        </form>
      </HrModal>
    </div>
  );
}
