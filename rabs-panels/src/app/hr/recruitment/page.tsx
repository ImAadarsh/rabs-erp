'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listJobPostings, createJobPosting, updateJobPosting,
  listApplicants, createApplicant, updateApplicant,
} from '@/lib/api';
import { APPLICANT_STAGES, formatDate, hrApiError, isApiMissing, statusBadgeClass } from '@/lib/hr-utils';
import { HrModal, HrField, HrModalActions, hrInputClass, hrTextareaClass } from '@/components/hr/hr-modal';
import { toast } from 'sonner';
import { AlertTriangle, Briefcase, Plus, Users } from 'lucide-react';

export default function RecruitmentPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [jobs, setJobs] = useState<any[]>([]);
  const [applicants, setApplicants] = useState<any[]>([]);
  const [selectedJob, setSelectedJob] = useState<string | null>(null);
  const [jobOpen, setJobOpen] = useState(false);
  const [appOpen, setAppOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [jobForm, setJobForm] = useState({
    title: '',
    department: '',
    location: 'UK',
    employmentType: 'full_time',
    status: 'open',
    description: '',
  });
  const [appForm, setAppForm] = useState({
    jobPostingId: '',
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    stage: 'applied',
    notes: '',
  });

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const j = await listJobPostings({ organizationId: orgId });
      setJobs(j.data || []);
      setApiMissing(false);
      const a = await listApplicants({
        organizationId: orgId,
        jobPostingId: selectedJob || undefined,
        limit: 100,
      });
      setApplicants(a.data || []);
    } catch (err) {
      if (isApiMissing(err)) {
        setApiMissing(true);
        setJobs([]);
        setApplicants([]);
      } else {
        toast.error(hrApiError(err, 'Failed to load recruitment'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId, selectedJob]);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, hasAccess, session?.accessToken, router, load]);

  async function saveJob(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createJobPosting({ ...jobForm, organizationId: orgId });
      toast.success('Job posting created');
      setJobOpen(false);
      void load();
    } catch (err) {
      toast.error(isApiMissing(err) ? 'Recruitment API not live yet' : hrApiError(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  async function saveApplicant(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createApplicant({ ...appForm, organizationId: orgId });
      toast.success('Applicant added');
      setAppOpen(false);
      void load();
    } catch (err) {
      toast.error(isApiMissing(err) ? 'Applicants API not live yet' : hrApiError(err, 'Save failed'));
    } finally {
      setSaving(false);
    }
  }

  async function moveStage(id: string, stage: string) {
    try {
      await updateApplicant(id, { stage });
      toast.success('Stage updated');
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Update failed'));
    }
  }

  async function closeJob(id: string) {
    try {
      await updateJobPosting(id, { status: 'closed' });
      toast.success('Job closed');
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Update failed'));
    }
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Recruitment" />
        <main className="p-6 md:p-8 space-y-6">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Recruitment API not deployed yet</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">/api/hr/job-postings</code> and applicants.</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 justify-end">
            <button type="button" onClick={() => { setAppForm((f) => ({ ...f, jobPostingId: selectedJob || '' })); setAppOpen(true); }} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium">
              <Users size={14} /> Add applicant
            </button>
            <button type="button" onClick={() => setJobOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20">
              <Plus size={14} /> Create job
            </button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 font-semibold flex items-center gap-2">
                <Briefcase size={16} className="text-brand" /> Jobs
              </div>
              {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
              {!loading && jobs.length === 0 && (
                <div className="p-8 text-sm text-muted-foreground text-center">
                  <p className="mb-3">No job postings.</p>
                  <button type="button" onClick={() => setJobOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-medium">
                    <Plus size={14} /> Post job
                  </button>
                </div>
              )}
              {jobs.map((j) => (
                <button
                  key={j.id}
                  type="button"
                  onClick={() => setSelectedJob(j.id === selectedJob ? null : j.id)}
                  className={`w-full text-left px-5 py-3 border-b border-border/30 last:border-0 hover:bg-muted/40 ${selectedJob === j.id ? 'bg-brand/5' : ''}`}
                >
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium text-sm">{j.title}</div>
                      <div className="text-xs text-muted-foreground">{j.department || '—'} · {j.location || '—'}</div>
                    </div>
                    <span className={`text-[10px] font-bold uppercase self-start px-2 py-0.5 rounded-full ${statusBadgeClass(j.status)}`}>{j.status}</span>
                  </div>
                  {j.status === 'open' && (
                    <button type="button" className="mt-2 text-xs text-muted-foreground hover:text-red-600" onClick={(e) => { e.stopPropagation(); void closeJob(j.id); }}>
                      Close posting
                    </button>
                  )}
                </button>
              ))}
            </section>

            <section className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 font-semibold flex items-center gap-2">
                <Users size={16} className="text-brand" /> Applicants {selectedJob ? '(filtered)' : ''}
              </div>
              {applicants.length === 0 && (
                <div className="p-8 text-sm text-muted-foreground text-center">
                  <p className="mb-3">No applicants.</p>
                  <button type="button" onClick={() => { setAppForm((f) => ({ ...f, jobPostingId: selectedJob || '' })); setAppOpen(true); }} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border text-sm font-medium">
                    <Users size={14} /> Add applicant
                  </button>
                </div>
              )}
              {applicants.map((a) => (
                <div key={a.id} className="px-5 py-3 border-b border-border/30 last:border-0 text-sm">
                  <div className="flex justify-between gap-2">
                    <div>
                      <div className="font-medium">{[a.firstName, a.lastName].filter(Boolean).join(' ') || a.name}</div>
                      <div className="text-xs text-muted-foreground">{a.email} · {a.jobPosting?.title || '—'}</div>
                    </div>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {APPLICANT_STAGES.map((s) => (
                      <button
                        key={s.value}
                        type="button"
                        onClick={() => moveStage(a.id, s.value)}
                        className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full transition ${
                          (a.stage || a.status) === s.value
                            ? 'bg-brand text-white'
                            : 'bg-muted text-muted-foreground hover:bg-brand/15'
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          </div>
        </main>
      </div>

      <HrModal open={jobOpen} onClose={() => setJobOpen(false)} title="Post a job" icon={Briefcase}>
        <form onSubmit={saveJob} className="space-y-4">
          <HrField label="Title"><input className={hrInputClass} required value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} /></HrField>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Department"><input className={hrInputClass} value={jobForm.department} onChange={(e) => setJobForm({ ...jobForm, department: e.target.value })} /></HrField>
            <HrField label="Location"><input className={hrInputClass} value={jobForm.location} onChange={(e) => setJobForm({ ...jobForm, location: e.target.value })} /></HrField>
          </div>
          <HrField label="Employment type">
            <select className={hrInputClass} value={jobForm.employmentType} onChange={(e) => setJobForm({ ...jobForm, employmentType: e.target.value })}>
              <option value="full_time">Full time</option>
              <option value="part_time">Part time</option>
              <option value="contract">Contract</option>
              <option value="temporary">Temporary</option>
            </select>
          </HrField>
          <HrField label="Description"><textarea className={hrTextareaClass} value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} /></HrField>
          <HrModalActions onCancel={() => setJobOpen(false)} submitLabel="Publish" submitting={saving} />
        </form>
      </HrModal>

      <HrModal open={appOpen} onClose={() => setAppOpen(false)} title="Add applicant" icon={Users}>
        <form onSubmit={saveApplicant} className="space-y-4">
          <HrField label="Job">
            <select className={hrInputClass} required value={appForm.jobPostingId} onChange={(e) => setAppForm({ ...appForm, jobPostingId: e.target.value })}>
              <option value="">Select…</option>
              {jobs.map((j) => <option key={j.id} value={j.id}>{j.title}</option>)}
            </select>
          </HrField>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="First name"><input className={hrInputClass} required value={appForm.firstName} onChange={(e) => setAppForm({ ...appForm, firstName: e.target.value })} /></HrField>
            <HrField label="Last name"><input className={hrInputClass} required value={appForm.lastName} onChange={(e) => setAppForm({ ...appForm, lastName: e.target.value })} /></HrField>
          </div>
          <HrField label="Email"><input type="email" className={hrInputClass} required value={appForm.email} onChange={(e) => setAppForm({ ...appForm, email: e.target.value })} /></HrField>
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
