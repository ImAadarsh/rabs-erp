'use client';
import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { listScheduledReports, createScheduledReport, updateScheduledReport, deleteScheduledReport, listReportDefinitions, runScheduledReportNow } from '@/lib/api';
import { toast } from 'sonner';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { useApiAccess } from '@/hooks/use-api-access';
import { ColumnDef } from '@tanstack/react-table';
import { Pencil, Trash2, Plus, X, Play } from 'lucide-react';

const EMPTY_FORM = {
  reportDefinitionId: '',
  scheduleName: '',
  frequency: 'weekly',
  runTime: '09:00',
  dayOfWeek: '1',
  dayOfMonth: '1',
  recipients: '',
  isActive: true
};
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function fmtDateTime(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function ScheduledReportsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const { can } = useApiAccess();
  const canCreate = can('POST', '/api/analytics/scheduled-reports');
  const canUpdate = can('PATCH', '/api/analytics/scheduled-reports/:id');
  const canDelete = can('DELETE', '/api/analytics/scheduled-reports/:id');
  const canRun = can('POST', '/api/analytics/scheduled-reports/:id/run');
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<any[]>([]);
  const [reports, setReports] = useState<any[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [form, setForm] = useState({ ...EMPTY_FORM });
  const [runningId, setRunningId] = useState<string | null>(null);
  const [editing, setEditing] = useState<any>(null);
  const [confirmDel, setConfirmDel] = useState<any>(null);
  const [submitting, setSubmitting] = useState(false);

  const loadData = async () => {
    try {
      const [schedRes, repRes] = await Promise.all([listScheduledReports(), listReportDefinitions()]);
      setItems(schedRes.data || []);
      setReports(repRes.data || []);
    } catch (e: any) {
      toast.error('Failed to load scheduled reports');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    loadData();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.reportDefinitionId) {
      toast.error('Select a report');
      return;
    }
    const emails = form.recipients.split(/[,;\s]+/).map((e) => e.trim()).filter(Boolean);
    const invalid = emails.filter((e) => !EMAIL_RE.test(e));
    if (invalid.length) {
      toast.error(`Invalid email: ${invalid.join(', ')}`);
      return;
    }
    setSubmitting(true);
    try {
      const payload: any = {
        reportDefinitionId: form.reportDefinitionId,
        scheduleName: form.scheduleName,
        frequency: form.frequency,
        runTime: form.runTime,
        isActive: form.isActive,
        recipients: { emailList: emails }
      };
      if (form.frequency === 'weekly') payload.dayOfWeek = Number(form.dayOfWeek);
      if (form.frequency !== 'daily' && form.frequency !== 'weekly') payload.dayOfMonth = Number(form.dayOfMonth);
      if (editing) {
        await updateScheduledReport(editing.id, payload);
        toast.success('Schedule updated');
      } else {
        await createScheduledReport(payload);
        toast.success('Schedule defined');
      }
      setShowCreate(false);
      setEditing(null);
      setForm({ ...EMPTY_FORM });
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error saving schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRunNow = async (row: any) => {
    setRunningId(String(row.id));
    try {
      const { data } = await runScheduledReportNow(row.id);
      toast.success(`Ran ${row.scheduleName}: ${data.rowCount} row(s) for ${data.range.from} to ${data.range.to}. ${data.delivery.message}`);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Run failed');
    } finally {
      setRunningId(null);
    }
  };

  const handleDelete = async () => {
    setSubmitting(true);
    try {
      await deleteScheduledReport(confirmDel.id);
      toast.success('Schedule deleted');
      setConfirmDel(null);
      loadData();
    } catch (error: any) {
      toast.error(error.response?.data?.error?.message || 'Error deleting schedule');
    } finally {
      setSubmitting(false);
    }
  };

  const columns = useMemo<ColumnDef<any>[]>(() => [
    { accessorKey: 'scheduleName', header: 'Schedule Name' },
    { accessorKey: 'reportDefinition.reportName', header: 'Report Source' },
    { accessorKey: 'frequency', header: 'Frequency', cell: ({ row }) => <span className="capitalize">{row.original.frequency}</span> },
    { accessorKey: 'runTime', header: 'Time', cell: ({ row }) => String(row.original.runTime || '').slice(0, 5) },
    {
      id: 'recipients',
      header: 'Recipients',
      accessorFn: (r: any) => (r.recipients?.emailList || []).join(', '),
      cell: ({ row }) => {
        const list: string[] = row.original.recipients?.emailList || [];
        return list.length ? <span className="text-xs">{list.join(', ')}</span> : <span className="text-xs text-amber-600">None</span>;
      }
    },
    { id: 'nextRunAt', header: 'Next run', accessorFn: (r: any) => r.nextRunAt || '', cell: ({ row }) => (row.original.isActive ? fmtDateTime(row.original.nextRunAt) : '—') },
    {
      id: 'lastRun',
      header: 'Last run',
      accessorFn: (r: any) => r.lastExecution?.completedAt || r.lastRunAt || '',
      cell: ({ row }) => {
        const e = row.original.lastExecution;
        if (!e) return <span className="text-muted-foreground text-xs">Never</span>;
        return (
          <div className="text-xs">
            <div>
              {fmtDateTime(e.completedAt)} ·{' '}
              <span className={e.status === 'completed' ? 'text-emerald-600' : e.status === 'failed' ? 'text-destructive' : ''}>{e.status}</span>
              {e.rowCount != null ? ` · ${e.rowCount} rows` : ''}
            </div>
            {e.errorMessage ? <div className="text-destructive">{e.errorMessage}</div> : null}
            {e.delivery?.message ? (
              <div className={e.delivery.status === 'sent' ? 'text-muted-foreground' : 'text-amber-600'}>{e.delivery.message}</div>
            ) : null}
          </div>
        );
      }
    },
    { accessorKey: 'isActive', header: 'Status', cell: ({ row }) => row.original.isActive ? <span className="text-emerald-500 font-medium">Active</span> : <span className="text-muted-foreground">Paused</span> },
    {
      id: 'actions',
      header: 'Actions',
      cell: ({ row }) => (
        <div className="flex gap-2">
          {canUpdate && (
          <button
            onClick={() => {
              setEditing(row.original);
              setForm({
                scheduleName: row.original.scheduleName,
                reportDefinitionId: String(row.original.reportDefinitionId),
                frequency: row.original.frequency,
                runTime: String(row.original.runTime || '09:00').slice(0, 5),
                dayOfWeek: String(row.original.dayOfWeek ?? 1),
                dayOfMonth: String(row.original.dayOfMonth ?? 1),
                recipients: (row.original.recipients?.emailList || []).join(', '),
                isActive: row.original.isActive
              });
              setShowCreate(true);
            }}
            className="p-1 hover:bg-secondary rounded text-primary transition-colors"
            title="Edit"
          >
            <Pencil className="h-4 w-4" />
          </button>
          )}
          {canRun && (
          <button
            onClick={() => handleRunNow(row.original)}
            disabled={runningId === String(row.original.id)}
            className="p-1 hover:bg-secondary rounded text-emerald-600 transition-colors disabled:opacity-50"
            title="Run now"
          >
            <Play className="h-4 w-4" />
          </button>
          )}
          {canDelete && (
          <button
            onClick={() => setConfirmDel(row.original)}
            className="p-1 hover:bg-destructive/10 rounded text-destructive transition-colors"
            title="Delete"
          >
            <Trash2 className="h-4 w-4" />
          </button>
          )}
        </div>
      )
    }
  ], [runningId, canUpdate, canRun, canDelete]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Analytics · Automation" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-muted-foreground animate-pulse">Loading...</div>
          </main>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Analytics · Automation" />
          <main className="flex-1 p-6 flex justify-center items-center">
            <div className="text-center">
              <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Analytics · Automation" />
        <main className="flex-1 overflow-auto p-4 md:p-6 pb-24">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-2xl font-bold">Scheduled Reports</h1>
              <p className="text-muted-foreground text-sm">Automate recurring report generation and distribution</p>
            </div>
            {canCreate && (
            <button
              onClick={() => {
                setEditing(null);
                setForm({ ...EMPTY_FORM });
                setShowCreate(true);
              }}
              className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors flex items-center gap-2"
            >
              <Plus className="h-4 w-4" /> New Schedule
            </button>
            )}
          </div>

          <div className="bg-card rounded-lg border shadow-sm">
            <RichDataTable columns={columns} data={items} />
          </div>

          {showCreate && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-md rounded-lg shadow-lg border border-border flex flex-col">
                <div className="p-4 border-b border-border flex justify-between items-center bg-muted/50 rounded-t-lg">
                  <h3 className="font-semibold">{editing ? 'Edit Automation' : 'New Automation Schedule'}</h3>
                  <button onClick={() => setShowCreate(false)} className="text-muted-foreground hover:text-foreground">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <form onSubmit={handleSubmit} className="p-4 space-y-4">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Schedule Name <span className="text-destructive">*</span></label>
                    <input
                      type="text"
                      required
                      value={form.scheduleName}
                      onChange={e => setForm({ ...form, scheduleName: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                    />
                  </div>
                  
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Source Report <span className="text-destructive">*</span></label>
                    <select
                      required
                      value={form.reportDefinitionId}
                      onChange={e => setForm({ ...form, reportDefinitionId: e.target.value })}
                      className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                    >
                      <option value="">-- Choose Report --</option>
                      {reports.map((r: any) => (
                        <option key={r.id} value={r.id}>{r.reportName} ({r.reportCode})</option>
                      ))}
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Frequency</label>
                      <select
                        value={form.frequency}
                        onChange={e => setForm({ ...form, frequency: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        <option value="daily">Daily</option>
                        <option value="weekly">Weekly</option>
                        <option value="monthly">Monthly</option>
                        <option value="quarterly">Quarterly</option>
                        <option value="yearly">Yearly</option>
                      </select>
                    </div>
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Time</label>
                      <input
                        type="time"
                        required
                        value={form.runTime}
                        onChange={e => setForm({ ...form, runTime: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      />
                    </div>
                  </div>

                  {form.frequency === 'weekly' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Day of week</label>
                      <select
                        value={form.dayOfWeek}
                        onChange={e => setForm({ ...form, dayOfWeek: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      >
                        {WEEKDAYS.map((d, i) => <option key={d} value={String(i)}>{d}</option>)}
                      </select>
                    </div>
                  )}
                  {form.frequency !== 'daily' && form.frequency !== 'weekly' && (
                    <div className="space-y-2">
                      <label className="text-sm font-medium">Day of month</label>
                      <input
                        type="number"
                        min={1}
                        max={31}
                        value={form.dayOfMonth}
                        onChange={e => setForm({ ...form, dayOfMonth: e.target.value })}
                        className="w-full h-10 px-3 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none"
                      />
                      <p className="text-xs text-muted-foreground">
                        {form.frequency === 'quarterly' ? 'Runs in January, April, July and October.' : form.frequency === 'yearly' ? 'Runs in January.' : ''} Short months use their last day.
                      </p>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-sm font-medium">Email recipients</label>
                    <textarea
                      value={form.recipients}
                      onChange={e => setForm({ ...form, recipients: e.target.value })}
                      placeholder="finance@example.com, manager@example.com"
                      rows={2}
                      className="w-full px-3 py-2 rounded-md border border-input bg-background/50 focus:ring-1 focus:ring-primary outline-none text-sm"
                    />
                    <p className="text-xs text-muted-foreground">
                      Comma-separated. Each run covers the previous period, saves a CSV under Data Exports and emails these addresses (needs an email connector under Marketing).
                    </p>
                  </div>

                  <label className="flex items-center gap-2 text-sm mt-2">
                    <input
                      type="checkbox"
                      checked={form.isActive}
                      onChange={e => setForm({ ...form, isActive: e.target.checked })}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4"
                    />
                    Active (Run automatically)
                  </label>
                  
                  <div className="pt-4 flex justify-end gap-2 border-t border-border">
                    <button
                      type="button"
                      onClick={() => setShowCreate(false)}
                      className="px-4 py-2 rounded-md hover:bg-secondary/80 text-sm font-medium transition-colors"
                      disabled={submitting}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={submitting}
                      className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium hover:bg-primary/90 transition-colors"
                    >
                      {submitting ? 'Saving...' : 'Save Schedule'}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

          {confirmDel && (
            <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
              <div className="bg-card w-full max-w-sm rounded-lg shadow-lg border border-border flex flex-col p-6 text-center">
                <h3 className="text-lg font-bold mb-2">Confirm Delete</h3>
                <p className="text-muted-foreground text-sm mb-6">
                  Delete schedule? The original report template will remain intact.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    onClick={() => setConfirmDel(null)}
                    className="px-4 py-2 rounded-md border border-input hover:bg-secondary/50 text-sm font-medium transition-colors"
                    disabled={submitting}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleDelete}
                    disabled={submitting}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-md text-sm font-medium hover:bg-destructive/90 transition-colors"
                  >
                    {submitting ? 'Deleting...' : 'Delete'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
