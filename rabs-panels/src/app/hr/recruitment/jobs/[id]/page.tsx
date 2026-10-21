'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { createApplicant, getJobPosting, updateApplicant, updateJobPosting } from '@/lib/api';
import { APPLICANT_STAGES, formatDate, hrApiError, statusBadgeClass } from '@/lib/hr-utils';
import { HrModal, HrField, HrModalActions, hrInputClass, hrTextareaClass } from '@/components/hr/hr-modal';
import { toast } from 'sonner';
import { ArrowLeft, Briefcase, Users } from 'lucide-react';

const JOB_STATUSES = ['draft', 'open', 'closed', 'filled', 'cancelled'] as const;

const EMPTY_APPLICANT = { firstName: '', lastName: '', email: '', phone: '', stage: 'applied', notes: '' };

export default function JobPostingDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [job, setJob] = useState<any>(null);
  const [appOpen, setAppOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [appForm, setAppForm] = useState(EMPTY_APPLICANT);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getJobPosting(id);
      setJob(res.data || null);
    } catch (err) {
      if ((err as any)?.response?.status !== 404) toast.error(hrApiError(err, 'Failed to load job'));
      setJob(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function setStatus(status: string) {
    try {
      await updateJobPosting(id, { status });
      toast.success('Job status updated');
      setJob((j: any) => ({ ...j, status }));
    } catch (err) {
      toast.error(hrApiError(err, 'Update failed'));
    }
  }

  const moveStage = useCallback(async (applicantId: string, stage: string) => {
    try {
      await updateApplicant(applicantId, { stage });
      toast.success('Stage updated');
      setJob((j: any) => ({
        ...j,
        applicants: (j?.applicants || []).map((a: any) => (a.id === applicantId ? { ...a, stage } : a)),
      }));
    } catch (err) {
      toast.error(hrApiError(err, 'Update failed'));
    }
  }, []);

  async function saveApplicant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createApplicant({
        ...appForm,
        jobPostingId: id,
        email: appForm.email || null,
        phone: appForm.phone || null,
        notes: appForm.notes || null,
      });
      toast.success('Applicant added');
      setAppOpen(false);
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  const applicants: any[] = job?.applicants || [];

  const stageCounts = useMemo(() => {
    const m: Record<string, number> = {};
    for (const a of applicants) m[a.stage || 'applied'] = (m[a.stage || 'applied'] || 0) + 1;
    return m;
  }, [applicants]);

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      id: 'name',
      accessorFn: (a) => [a.firstName, a.lastName].filter(Boolean).join(' '),
      header: 'Name',
      cell: ({ getValue }) => <span className="font-medium">{String(getValue() || '—')}</span>,
    },
    { id: 'email', accessorFn: (a) => a.email || '', header: 'Email', cell: ({ getValue }) => String(getValue() || '—') },
    { id: 'phone', accessorFn: (a) => a.phone || '', header: 'Phone', cell: ({ getValue }) => String(getValue() || '—') },
    {
      id: 'stage',
      accessorFn: (a) => a.stage || '',
      header: 'Stage',
      cell: ({ row }) => (
        <select
          className="h-8 rounded-lg border border-border/80 bg-background px-2 text-xs"
          value={row.original.stage || 'applied'}
          onChange={(e) => void moveStage(row.original.id, e.target.value)}
        >
          {APPLICANT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
          {row.original.stage === 'withdrawn' && <option value="withdrawn">Withdrawn</option>}
        </select>
      ),
    },
    { id: 'notes', accessorFn: (a) => a.notes || '', header: 'Notes', cell: ({ getValue }) => <span className="text-xs text-muted-foreground">{String(getValue() || '—')}</span> },
    { id: 'createdAt', accessorFn: (a) => a.createdAt || '', header: 'Applied', cell: ({ row }) => formatDate(row.original.createdAt) },
  ], [moveStage]);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Job posting" />
        <main className="p-6 md:p-8 space-y-6">
          <Link href="/hr/recruitment" className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
            <ArrowLeft size={14} /> Back to recruitment
          </Link>

          {loading && <div className="text-muted-foreground">Loading…</div>}
          {!loading && !job && (
            <div className="text-center py-16">
              <p className="font-semibold">Job posting not found</p>
              <Link href="/hr/recruitment" className="text-sm text-brand hover:underline mt-2 inline-block">Back</Link>
            </div>
          )}

          {job && (
            <>
              <div className="glass-panel rounded-2xl border border-border/50 p-5 flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-brand/15 text-brand ring-1 ring-brand/25 flex items-center justify-center">
                    <Briefcase size={24} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">{job.title}</h1>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      {job.department || '—'} · {job.location || '—'} · <span className="capitalize">{(job.employmentType || '').replace(/_/g, ' ')}</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2 items-center">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeClass(job.status)}`}>{job.status}</span>
                      <span className="text-xs text-muted-foreground">Posted {formatDate(job.postedAt || job.createdAt)}{job.closesAt ? ` · closes ${formatDate(job.closesAt)}` : ''}</span>
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Status</label>
                  <select className="h-10 rounded-xl border border-border/80 bg-background px-3 text-sm capitalize" value={job.status} onChange={(e) => void setStatus(e.target.value)}>
                    {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              </div>

              <div className="glass-panel rounded-2xl border border-border/50 p-5">
                <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">Description</div>
                <p className="text-sm whitespace-pre-wrap">{job.description || '—'}</p>
              </div>

              <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 lg:grid-cols-6">
                {APPLICANT_STAGES.map((s) => (
                  <div key={s.value} className="glass-panel rounded-xl border border-border/40 p-3">
                    <div className="text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{s.label}</div>
                    <div className="mt-1 text-xl font-bold text-brand">{stageCounts[s.value] || 0}</div>
                  </div>
                ))}
              </div>

              <section className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
                <div className="px-5 py-4 border-b border-border/50 font-semibold flex items-center justify-between gap-2">
                  <span className="flex items-center gap-2"><Users size={16} className="text-brand" /> Applicants ({applicants.length})</span>
                  <button
                    type="button"
                    onClick={() => { setAppForm(EMPTY_APPLICANT); setAppOpen(true); }}
                    className="inline-flex items-center gap-2 h-9 px-3 rounded-xl border border-border bg-card text-sm font-medium"
                  >
                    <Users size={14} /> Add applicant
                  </button>
                </div>
                <div className="p-4">
                  <RichDataTable columns={columns} data={applicants} searchPlaceholder="Search applicants…" />
                </div>
              </section>
            </>
          )}
        </main>
      </div>

      <HrModal open={appOpen} onClose={() => setAppOpen(false)} title="Add applicant" icon={Users}>
        <form onSubmit={saveApplicant} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <HrField label="First name"><input className={hrInputClass} required value={appForm.firstName} onChange={(e) => setAppForm({ ...appForm, firstName: e.target.value })} /></HrField>
            <HrField label="Last name"><input className={hrInputClass} required value={appForm.lastName} onChange={(e) => setAppForm({ ...appForm, lastName: e.target.value })} /></HrField>
          </div>
          <HrField label="Email"><input type="email" autoComplete="off" className={hrInputClass} required value={appForm.email} onChange={(e) => setAppForm({ ...appForm, email: e.target.value })} /></HrField>
          <HrField label="Phone"><input className={hrInputClass} value={appForm.phone} onChange={(e) => setAppForm({ ...appForm, phone: e.target.value })} /></HrField>
          <HrField label="Stage">
            <select className={hrInputClass} value={appForm.stage} onChange={(e) => setAppForm({ ...appForm, stage: e.target.value })}>
              {APPLICANT_STAGES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </HrField>
          <HrField label="Notes"><textarea className={hrTextareaClass} value={appForm.notes} onChange={(e) => setAppForm({ ...appForm, notes: e.target.value })} /></HrField>
          <HrModalActions onCancel={() => setAppOpen(false)} submitLabel="Add" submitting={saving} />
        </form>
      </HrModal>
    </div>
  );
}
