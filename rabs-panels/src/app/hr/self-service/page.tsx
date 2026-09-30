'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import {
  getHrMe, updateHrMe, listHrMeLeaveRequests, createHrMeLeaveRequest,
  listHrMePayslips, listHrMeDocuments, listEmployees, listLeaveRequests,
  createLeaveRequest, listPayrollLines, listEmployeeDocuments,
} from '@/lib/api';
import { employeeName, formatDate, formatMoney, hrApiError, isApiMissing, LEAVE_TYPES, statusBadgeClass } from '@/lib/hr-utils';
import { HrModal, HrField, HrModalActions, hrInputClass, hrTextareaClass } from '@/components/hr/hr-modal';
import { toast } from 'sonner';
import { AlertTriangle, Calendar, FileText, User, Wallet } from 'lucide-react';

export default function SelfServicePage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [me, setMe] = useState<any>(null);
  const [leave, setLeave] = useState<any[]>([]);
  const [payslips, setPayslips] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [tab, setTab] = useState<'profile' | 'leave' | 'payslips' | 'documents'>('profile');
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    totalDays: 1,
    reason: '',
  });
  const [profileForm, setProfileForm] = useState({
    phone: '',
    addressLine1: '',
    city: '',
    postalCode: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      try {
        const res = await getHrMe();
        setMe(res.data);
        setApiMissing(false);
        const [l, p, d] = await Promise.all([
          listHrMeLeaveRequests().catch(() => ({ data: [] })),
          listHrMePayslips().catch(() => ({ data: [] })),
          listHrMeDocuments().catch(() => ({ data: [] })),
        ]);
        setLeave(l.data || []);
        setPayslips(p.data || []);
        setDocs(d.data || []);
      } catch (err) {
        if (!isApiMissing(err)) throw err;
        setApiMissing(true);
        // Fallback: find employee linked to current user
        const empRes = await listEmployees({ organizationId: session?.user?.organizationId });
        const linked = (empRes.data || []).find(
          (e: any) => e.userId === session?.user?.id || e.user?.id === session?.user?.id || e.email === session?.user?.email
        );
        if (!linked) {
          setMe(null);
          setLeave([]);
          setPayslips([]);
          setDocs([]);
        } else {
          setMe(linked);
          const [l, pl, d] = await Promise.all([
            listLeaveRequests({ employeeId: linked.id }).catch(() => ({ data: [] })),
            listPayrollLines({ employeeId: linked.id }).catch(() => ({ data: [] })),
            listEmployeeDocuments({ employeeId: linked.id }).catch(() => ({ data: [] })),
          ]);
          setLeave(l.data || []);
          setPayslips((pl.data || []).map((x: any) => ({
            id: x.id,
            netPay: x.netPay,
            grossPay: x.grossPay,
            periodLabel: x.payrollRun?.payrollNumber,
            payslipUrl: x.payslipUrl,
          })));
          setDocs(d.data || []);
        }
      }
    } catch (err) {
      toast.error(hrApiError(err, 'Failed to load self-service'));
    } finally {
      setLoading(false);
    }
  }, [session?.user?.organizationId, session?.user?.id, session?.user?.email]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  useEffect(() => {
    if (leaveForm.startDate && leaveForm.endDate) {
      const start = new Date(leaveForm.startDate);
      const end = new Date(leaveForm.endDate);
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000) + 1);
      setLeaveForm((f) => ({ ...f, totalDays: days }));
    }
  }, [leaveForm.startDate, leaveForm.endDate]);

  async function saveLeave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      try {
        await createHrMeLeaveRequest(leaveForm);
      } catch (err) {
        if (!isApiMissing(err) || !me?.id) throw err;
        await createLeaveRequest({
          employeeId: me.id,
          leaveType: leaveForm.leaveType as any,
          startDate: leaveForm.startDate,
          endDate: leaveForm.endDate,
          totalDays: leaveForm.totalDays,
          reason: leaveForm.reason || undefined,
        });
      }
      toast.success('Leave request submitted');
      setLeaveOpen(false);
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Request failed'));
    } finally {
      setSaving(false);
    }
  }

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateHrMe(profileForm);
      toast.success('Profile updated');
      setEditOpen(false);
      void load();
    } catch (err) {
      toast.error(isApiMissing(err) ? 'Self-service update API not live yet' : hrApiError(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  }

  function openEdit() {
    setProfileForm({
      phone: me?.phone || '',
      addressLine1: me?.addressLine1 || '',
      city: me?.city || '',
      postalCode: me?.postalCode || '',
      emergencyContactName: me?.emergencyContactName || '',
      emergencyContactPhone: me?.emergencyContactPhone || '',
    });
    setEditOpen(true);
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Self-service" />
        <main className="p-6 md:p-8 space-y-6">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Using linked-employee fallback</div>
                <div className="text-xs mt-0.5 opacity-80">
                  <code className="font-mono">/api/hr/me</code> not live — showing data for the employee linked to your user account when found.
                </div>
              </div>
            </div>
          )}

          {loading && <div className="text-muted-foreground">Loading…</div>}

          {!loading && !me && (
            <div className="glass-panel rounded-2xl border border-border/50 p-10 text-center">
              <User className="mx-auto text-brand mb-3" size={28} />
              <h2 className="font-semibold">No employee profile linked</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                Ask HR to link your user account to an employee record to use self-service.
              </p>
            </div>
          )}

          {me && (
            <>
              <div className="glass-panel rounded-2xl border border-border/50 p-5 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h1 className="text-xl font-bold">{employeeName(me)}</h1>
                  <div className="text-sm text-muted-foreground mt-0.5">#{me.employeeNumber} · {me.email || session?.user?.email}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setLeaveOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20">
                    <Calendar size={14} /> Request leave
                  </button>
                  <button type="button" onClick={openEdit} className="h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium">
                    Update my details
                  </button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                {([
                  ['profile', 'Profile', User],
                  ['leave', 'Leave', Calendar],
                  ['payslips', 'Payslips', Wallet],
                  ['documents', 'Documents', FileText],
                ] as const).map(([id, label, Icon]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setTab(id)}
                    className={`inline-flex items-center gap-1.5 h-10 px-3.5 rounded-xl text-sm font-medium ${
                      tab === id ? 'bg-brand/15 ring-1 ring-brand/30' : 'bg-muted'
                    }`}
                  >
                    <Icon size={14} /> {label}
                  </button>
                ))}
              </div>

              {tab === 'profile' && (
                <div className="grid gap-3 sm:grid-cols-2">
                  {[
                    ['Phone', me.phone || '—'],
                    ['Address', [me.addressLine1, me.city, me.postalCode].filter(Boolean).join(', ') || '—'],
                    ['Emergency', [me.emergencyContactName, me.emergencyContactPhone].filter(Boolean).join(' · ') || '—'],
                    ['Hire date', formatDate(me.hireDate)],
                  ].map(([k, v]) => (
                    <div key={k as string} className="glass-panel rounded-xl border border-border/40 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{k}</div>
                      <div className="mt-1 text-sm font-medium">{v}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'leave' && (
                <div className="space-y-3">
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setLeaveOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-medium">
                      <Calendar size={14} /> Request leave
                    </button>
                  </div>
                  <div className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
                    {leave.length === 0 && (
                      <div className="p-8 text-center">
                        <p className="text-sm text-muted-foreground mb-3">No leave requests.</p>
                        <button type="button" onClick={() => setLeaveOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand text-white text-sm font-medium">
                          Request leave
                        </button>
                      </div>
                    )}
                    {leave.map((r: any) => (
                      <div key={r.id} className="px-5 py-3 border-b border-border/30 last:border-0 flex justify-between text-sm">
                        <div>
                          <div className="font-medium capitalize">{(r.leaveType || '').replace(/_/g, ' ')}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(r.startDate)} → {formatDate(r.endDate)}</div>
                        </div>
                        <span className={`self-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadgeClass(r.status)}`}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'payslips' && (
                <div className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
                  {payslips.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No payslips.</div>}
                  {payslips.map((p: any) => (
                    <div key={p.id} className="px-5 py-3 border-b border-border/30 last:border-0 flex justify-between text-sm">
                      <div>
                        <div className="font-medium">{p.periodLabel || formatDate(p.paymentDate) || 'Payslip'}</div>
                        <div className="text-xs text-muted-foreground">Gross {formatMoney(p.grossPay)}</div>
                      </div>
                      <div className="text-right">
                        <div className="font-semibold text-brand">{formatMoney(p.netPay)}</div>
                        {p.payslipUrl && <a href={p.payslipUrl} className="text-xs text-brand hover:underline" target="_blank" rel="noreferrer">Open</a>}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'documents' && (
                <div className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
                  {docs.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No documents.</div>}
                  {docs.map((d: any) => (
                    <div key={d.id} className="px-5 py-3 border-b border-border/30 last:border-0 flex justify-between text-sm">
                      <div>
                        <div className="font-medium">{d.documentName}</div>
                        <div className="text-xs text-muted-foreground capitalize">{d.documentType}</div>
                      </div>
                      {d.documentUrl && <a href={d.documentUrl} className="text-xs text-brand hover:underline" target="_blank" rel="noreferrer">Open</a>}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <HrModal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Request leave" icon={Calendar}>
        <form onSubmit={saveLeave} className="space-y-4">
          <HrField label="Type">
            <select className={hrInputClass} value={leaveForm.leaveType} onChange={(e) => setLeaveForm({ ...leaveForm, leaveType: e.target.value })}>
              {LEAVE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </HrField>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Start"><input type="date" className={hrInputClass} required value={leaveForm.startDate} onChange={(e) => setLeaveForm({ ...leaveForm, startDate: e.target.value })} /></HrField>
            <HrField label="End"><input type="date" className={hrInputClass} required value={leaveForm.endDate} onChange={(e) => setLeaveForm({ ...leaveForm, endDate: e.target.value })} /></HrField>
          </div>
          <HrField label="Days"><input type="number" step="0.5" className={hrInputClass} value={leaveForm.totalDays} onChange={(e) => setLeaveForm({ ...leaveForm, totalDays: Number(e.target.value) })} /></HrField>
          <HrField label="Reason"><textarea className={hrTextareaClass} value={leaveForm.reason} onChange={(e) => setLeaveForm({ ...leaveForm, reason: e.target.value })} /></HrField>
          <HrModalActions onCancel={() => setLeaveOpen(false)} submitLabel="Submit" submitting={saving} />
        </form>
      </HrModal>

      <HrModal open={editOpen} onClose={() => setEditOpen(false)} title="Update my details" icon={User}>
        <form onSubmit={saveProfile} className="space-y-4">
          <HrField label="Phone"><input className={hrInputClass} value={profileForm.phone} onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })} /></HrField>
          <HrField label="Address"><input className={hrInputClass} value={profileForm.addressLine1} onChange={(e) => setProfileForm({ ...profileForm, addressLine1: e.target.value })} /></HrField>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="City"><input className={hrInputClass} value={profileForm.city} onChange={(e) => setProfileForm({ ...profileForm, city: e.target.value })} /></HrField>
            <HrField label="Postcode"><input className={hrInputClass} value={profileForm.postalCode} onChange={(e) => setProfileForm({ ...profileForm, postalCode: e.target.value })} /></HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Emergency name"><input className={hrInputClass} value={profileForm.emergencyContactName} onChange={(e) => setProfileForm({ ...profileForm, emergencyContactName: e.target.value })} /></HrField>
            <HrField label="Emergency phone"><input className={hrInputClass} value={profileForm.emergencyContactPhone} onChange={(e) => setProfileForm({ ...profileForm, emergencyContactPhone: e.target.value })} /></HrField>
          </div>
          <HrModalActions onCancel={() => setEditOpen(false)} submitLabel="Save" submitting={saving} />
        </form>
      </HrModal>
    </div>
  );
}
