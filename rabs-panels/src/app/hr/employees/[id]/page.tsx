'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import {
  getEmployee360, listEmploymentContracts, listEmployeeDocuments,
  listLeaveRequests, listLeaveBalances, listImmigration, listRtwDocuments,
  updateEmployee, createImmigration, createLeaveRequest, createHrDocument,
  createEmployeeDocument, createRtwDocument,
} from '@/lib/api';
import {
  daysUntil, employeeName, formatDate, formatMoney, hrApiError,
  isApiMissing, LEAVE_TYPES, statusBadgeClass, visaRiskClass, VISA_TYPES,
} from '@/lib/hr-utils';
import { HrModal, HrField, HrModalActions, hrInputClass, hrTextareaClass } from '@/components/hr/hr-modal';
import { toast } from 'sonner';
import {
  ArrowLeft, User, Briefcase, ShieldCheck, Calendar, FileText, Pencil, Plus,
} from 'lucide-react';

const GOLD_BTN =
  'inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20';

type Tab = 'personal' | 'job' | 'immigration' | 'leave' | 'documents';

export default function Employee360Page() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [tab, setTab] = useState<Tab>('personal');
  const [loading, setLoading] = useState(true);
  const [emp, setEmp] = useState<any>(null);
  const [contracts, setContracts] = useState<any[]>([]);
  const [docs, setDocs] = useState<any[]>([]);
  const [leave, setLeave] = useState<any[]>([]);
  const [balances, setBalances] = useState<any[]>([]);
  const [immigration, setImmigration] = useState<any[]>([]);
  const [rtw, setRtw] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [immOpen, setImmOpen] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);
  const [docOpen, setDocOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [immForm, setImmForm] = useState({
    status: 'skilled_worker',
    visaType: '',
    visaExpiry: '',
    shareCode: '',
    notes: '',
  });
  const [leaveForm, setLeaveForm] = useState({
    leaveType: 'vacation',
    startDate: '',
    endDate: '',
    totalDays: 1,
    reason: '',
  });
  const [docForm, setDocForm] = useState({
    documentName: '',
    documentType: 'contract',
    documentUrl: '',
    expiryDate: '',
    isRtw: false,
  });

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getEmployee360(id);
      const data = res.data;
      setEmp(data?.employee || data);

      if (data?.contracts) setContracts(data.contracts);
      else {
        try {
          const c = await listEmploymentContracts({ employeeId: id });
          setContracts(c.data || []);
        } catch { setContracts([]); }
      }

      if (data?.documents) setDocs(data.documents);
      else {
        try {
          const d = await listEmployeeDocuments({ employeeId: id });
          setDocs(d.data || []);
        } catch { setDocs([]); }
      }

      if (data?.leaveRequests) setLeave(data.leaveRequests);
      else {
        try {
          const l = await listLeaveRequests({ employeeId: id });
          setLeave(l.data || []);
        } catch { setLeave([]); }
      }

      if (data?.leaveBalances) setBalances(data.leaveBalances);
      else {
        try {
          const b = await listLeaveBalances({ employeeId: id });
          setBalances(b.data || []);
        } catch { setBalances([]); }
      }

      if (data?.immigration) setImmigration(Array.isArray(data.immigration) ? data.immigration : [data.immigration].filter(Boolean));
      else {
        try {
          const i = await listImmigration({ employeeId: id });
          setImmigration(i.data || []);
        } catch { setImmigration([]); }
      }

      if (data?.rtwDocuments) setRtw(data.rtwDocuments);
      else {
        try {
          const r = await listRtwDocuments({ employeeId: id });
          setRtw(r.data || []);
        } catch { setRtw([]); }
      }
    } catch (err) {
      toast.error(hrApiError(err, 'Failed to load employee'));
      setEmp(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  function openEdit() {
    if (!emp) return;
    setEditForm({
      firstName: emp.firstName || '',
      lastName: emp.lastName || '',
      email: emp.email || '',
      phone: emp.phone || '',
      nationalId: emp.nationalId || emp.niNumber || '',
      taxId: emp.taxId || emp.taxCode || '',
      addressLine1: emp.addressLine1 || '',
      city: emp.city || '',
      postalCode: emp.postalCode || '',
      countryCode: emp.countryCode || 'GB',
      emergencyContactName: emp.emergencyContactName || '',
      emergencyContactPhone: emp.emergencyContactPhone || '',
      jobTitle: emp.jobTitle || '',
      department: emp.department || '',
      notes: emp.notes || '',
    });
    setEditOpen(true);
  }

  async function saveEdit(e: React.FormEvent) {
    e.preventDefault();
    if (!id) return;
    setSaving(true);
    try {
      await updateEmployee(id, {
        firstName: editForm.firstName,
        lastName: editForm.lastName,
        email: editForm.email || undefined,
        phone: editForm.phone || undefined,
        nationalId: editForm.nationalId || undefined,
        taxId: editForm.taxId || undefined,
        addressLine1: editForm.addressLine1 || undefined,
        city: editForm.city || undefined,
        postalCode: editForm.postalCode || undefined,
        countryCode: editForm.countryCode || undefined,
        emergencyContactName: editForm.emergencyContactName || undefined,
        emergencyContactPhone: editForm.emergencyContactPhone || undefined,
        notes: editForm.notes || undefined,
      } as any);
      toast.success('Employee updated');
      setEditOpen(false);
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Update failed'));
    } finally {
      setSaving(false);
    }
  }

  async function saveImmigration(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createImmigration({
        employeeId: id,
        organizationId: session?.user?.organizationId,
        ...immForm,
        visaExpiry: immForm.visaExpiry || undefined,
        shareCode: immForm.shareCode || undefined,
        notes: immForm.notes || undefined,
      });
      toast.success('Immigration record saved');
      setImmOpen(false);
      void load();
    } catch (err) {
      if (isApiMissing(err)) {
        toast.error('Immigration API not available yet');
      } else {
        toast.error(hrApiError(err, 'Failed to save immigration'));
      }
    } finally {
      setSaving(false);
    }
  }

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
    if (!id) return;
    setSaving(true);
    try {
      await createLeaveRequest({
        employeeId: id,
        leaveType: leaveForm.leaveType as any,
        startDate: leaveForm.startDate,
        endDate: leaveForm.endDate,
        totalDays: leaveForm.totalDays,
        reason: leaveForm.reason || undefined,
      });
      toast.success('Leave request created');
      setLeaveOpen(false);
      setLeaveForm({ leaveType: 'vacation', startDate: '', endDate: '', totalDays: 1, reason: '' });
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Failed to create leave request'));
    } finally {
      setSaving(false);
    }
  }

  async function saveDocument(e: React.FormEvent) {
    e.preventDefault();
    if (!id || !docForm.documentUrl) {
      toast.error('Document URL is required');
      return;
    }
    setSaving(true);
    try {
      if (docForm.isRtw) {
        try {
          await createRtwDocument({
            employeeId: id,
            docType: docForm.documentType,
            documentName: docForm.documentName,
            documentUrl: docForm.documentUrl,
            expiresAt: docForm.expiryDate || undefined,
          });
        } catch (err) {
          if (!isApiMissing(err)) throw err;
          await createEmployeeDocument({
            employeeId: id,
            documentType: docForm.documentType === 'passport' ? 'passport' : docForm.documentType === 'id' ? 'id' : 'other',
            documentName: docForm.documentName,
            documentUrl: docForm.documentUrl,
            expiryDate: docForm.expiryDate || undefined,
          });
        }
      } else {
        try {
          await createHrDocument({
            employeeId: id,
            docCategory: docForm.documentType,
            documentName: docForm.documentName,
            documentUrl: docForm.documentUrl,
            expiryDate: docForm.expiryDate || undefined,
          });
        } catch (err) {
          if (!isApiMissing(err)) throw err;
          await createEmployeeDocument({
            employeeId: id,
            documentType: (['contract', 'id', 'passport', 'certificate'].includes(docForm.documentType)
              ? docForm.documentType
              : 'other') as any,
            documentName: docForm.documentName,
            documentUrl: docForm.documentUrl,
            expiryDate: docForm.expiryDate || undefined,
          });
        }
      }
      toast.success('Document added');
      setDocOpen(false);
      setDocForm({ documentName: '', documentType: 'contract', documentUrl: '', expiryDate: '', isRtw: false });
      void load();
    } catch (err) {
      toast.error(hrApiError(err, 'Failed to add document'));
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: Tab; label: string; icon: typeof User }[] = [
    { id: 'personal', label: 'Personal', icon: User },
    { id: 'job', label: 'Job', icon: Briefcase },
    { id: 'immigration', label: 'Immigration', icon: ShieldCheck },
    { id: 'leave', label: 'Leave', icon: Calendar },
    { id: 'documents', label: 'Documents', icon: FileText },
  ];

  const currentContract = contracts.find((c) => c.isCurrent || c.status === 'active') || contracts[0];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Employee 360" />
        <main className="p-6 md:p-8 space-y-6">
          <Link href="/hr/employees" className="inline-flex items-center gap-1.5 text-sm text-brand hover:underline">
            <ArrowLeft size={14} /> Back to employees
          </Link>

          {loading && <div className="text-muted-foreground">Loading…</div>}
          {!loading && !emp && (
            <div className="text-center py-16">
              <p className="font-semibold">Employee not found</p>
              <Link href="/hr/employees" className="text-sm text-brand hover:underline mt-2 inline-block">Back</Link>
            </div>
          )}

          {emp && (
            <>
              <div className="glass-panel rounded-2xl border border-border/50 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-14 w-14 rounded-2xl bg-brand/15 text-brand ring-1 ring-brand/25 flex items-center justify-center">
                    <User size={24} />
                  </div>
                  <div>
                    <h1 className="text-xl font-bold tracking-tight">{employeeName(emp)}</h1>
                    <div className="text-sm text-muted-foreground mt-0.5">
                      #{emp.employeeNumber} · {emp.email || 'No email'}
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${statusBadgeClass(emp.status)}`}>
                        {emp.status}
                      </span>
                      <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-muted text-muted-foreground">
                        {(emp.employmentType || '').replace(/_/g, ' ')}
                      </span>
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={openEdit}
                  className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20"
                >
                  <Pencil size={14} /> Edit profile
                </button>
              </div>

              <div className="flex flex-wrap gap-2 border-b border-border/50 pb-2">
                {tabs.map((t) => {
                  const Icon = t.icon;
                  const active = tab === t.id;
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => setTab(t.id)}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-sm font-medium transition ${
                        active
                          ? 'bg-brand/15 text-foreground ring-1 ring-brand/30'
                          : 'text-muted-foreground hover:bg-muted'
                      }`}
                    >
                      <Icon size={14} className={active ? 'text-brand' : ''} />
                      {t.label}
                    </button>
                  );
                })}
              </div>

              {tab === 'personal' && (
                <div className="grid gap-4 sm:grid-cols-2">
                  {[
                    ['Date of birth', formatDate(emp.dateOfBirth)],
                    ['Phone', emp.phone || '—'],
                    ['NI / National ID', emp.niNumber || emp.nationalId || '—'],
                    ['Tax code', emp.taxCode || emp.taxId || '—'],
                    ['Address', [emp.addressLine1, emp.city, emp.postalCode, emp.countryCode].filter(Boolean).join(', ') || '—'],
                    ['Emergency', [emp.emergencyContactName, emp.emergencyContactPhone].filter(Boolean).join(' · ') || '—'],
                    ['Hire date', formatDate(emp.hireDate)],
                    ['Linked user', emp.user?.email || '—'],
                  ].map(([label, value]) => (
                    <div key={label as string} className="glass-panel rounded-xl border border-border/40 p-4">
                      <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
                      <div className="mt-1.5 text-sm font-medium">{value}</div>
                    </div>
                  ))}
                </div>
              )}

              {tab === 'job' && (
                <div className="space-y-4">
                  <div className="glass-panel rounded-2xl border border-border/50 p-5">
                    <h3 className="font-semibold mb-3">Current role</h3>
                    {currentContract ? (
                      <div className="grid gap-3 sm:grid-cols-2 text-sm">
                        <div><span className="text-muted-foreground">Title</span><div className="font-medium">{currentContract.jobTitle}</div></div>
                        <div><span className="text-muted-foreground">Department</span><div className="font-medium">{currentContract.department || emp.department || '—'}</div></div>
                        <div><span className="text-muted-foreground">Contract</span><div className="font-medium">{currentContract.contractType}</div></div>
                        <div><span className="text-muted-foreground">Salary</span><div className="font-medium">{formatMoney(currentContract.salaryAmount, currentContract.salaryCurrency || 'GBP')} / {currentContract.salaryPeriod || '—'}</div></div>
                        <div><span className="text-muted-foreground">Start</span><div className="font-medium">{formatDate(currentContract.startDate)}</div></div>
                        <div><span className="text-muted-foreground">Hours/week</span><div className="font-medium">{currentContract.workingHoursPerWeek ?? '—'}</div></div>
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground">No active contract. Add one under Employment Contracts.</p>
                    )}
                  </div>
                  {contracts.length > 1 && (
                    <div className="text-xs text-muted-foreground">{contracts.length} contract record(s) on file.</div>
                  )}
                </div>
              )}

              {tab === 'immigration' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setImmOpen(true)} className={GOLD_BTN}>
                      <Plus size={14} /> Add visa / status
                    </button>
                  </div>
                  {immigration.length === 0 && (
                    <div className="glass-panel rounded-2xl border border-border/50 p-8 text-center">
                      <p className="text-sm text-muted-foreground mb-3">No immigration records yet.</p>
                      <button type="button" onClick={() => setImmOpen(true)} className={GOLD_BTN}>
                        <Plus size={14} /> Add visa / status
                      </button>
                    </div>
                  )}
                  {immigration.map((row: any) => {
                    const days = daysUntil(row.visaExpiry || row.expiryDate);
                    return (
                      <div key={row.id} className="glass-panel rounded-2xl border border-border/50 p-5 flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <div className="font-semibold">{row.visaType || row.status}</div>
                          <div className="text-xs text-muted-foreground mt-1">
                            Share code: {row.shareCode || '—'} · Expiry {formatDate(row.visaExpiry || row.expiryDate)}
                          </div>
                        </div>
                        <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${visaRiskClass(days)}`}>
                          {days == null ? row.status : days < 0 ? 'Expired' : `${days}d left`}
                        </span>
                      </div>
                    );
                  })}
                  {rtw.length > 0 && (
                    <div>
                      <h3 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground mb-2">RTW documents</h3>
                      <div className="space-y-2">
                        {rtw.map((d: any) => (
                          <div key={d.id} className="rounded-xl border border-border/40 px-4 py-3 text-sm flex justify-between gap-2">
                            <span>{d.docType || d.documentType || d.documentName}</span>
                            <span className="text-muted-foreground text-xs">{formatDate(d.expiresAt || d.expiryDate)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {tab === 'leave' && (
                <div className="space-y-4">
                  <div className="flex justify-end">
                    <button type="button" onClick={() => setLeaveOpen(true)} className={GOLD_BTN}>
                      <Plus size={14} /> Add leave request
                    </button>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    {(balances.length ? balances : [{ leaveType: 'annual', remainingDays: '—', entitledDays: '—' }]).map((b: any, i: number) => (
                      <div key={b.id || i} className="glass-panel rounded-xl border border-border/40 p-4">
                        <div className="text-[11px] font-bold uppercase tracking-[0.14em] text-muted-foreground">
                          {(b.leaveType || 'balance').replace(/_/g, ' ')}
                        </div>
                        <div className="mt-1 text-2xl font-bold text-brand">{b.remainingDays ?? b.balance ?? '—'}</div>
                        <div className="text-xs text-muted-foreground">of {b.entitledDays ?? b.entitlement ?? '—'} days</div>
                      </div>
                    ))}
                  </div>
                  <div className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
                    <div className="px-4 py-3 border-b border-border/40 font-semibold text-sm">Recent requests</div>
                    {leave.length === 0 && (
                      <div className="p-8 text-center">
                        <p className="text-sm text-muted-foreground mb-3">No leave requests.</p>
                        <button type="button" onClick={() => setLeaveOpen(true)} className={GOLD_BTN}>
                          <Plus size={14} /> Add leave request
                        </button>
                      </div>
                    )}
                    {leave.slice(0, 12).map((r: any) => (
                      <div key={r.id} className="px-4 py-3 border-b border-border/30 last:border-0 flex justify-between gap-3 text-sm">
                        <div>
                          <div className="font-medium capitalize">{(r.leaveType || '').replace(/_/g, ' ')}</div>
                          <div className="text-xs text-muted-foreground">{formatDate(r.startDate)} → {formatDate(r.endDate)} · {r.totalDays}d</div>
                        </div>
                        <span className={`self-center text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${statusBadgeClass(r.status)}`}>{r.status}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {tab === 'documents' && (
                <div className="space-y-2">
                  <div className="flex justify-end gap-3 mb-2 items-center">
                    <Link href="/hr/documents" className="text-sm text-muted-foreground hover:text-brand">Manage all</Link>
                    <button type="button" onClick={() => setDocOpen(true)} className={GOLD_BTN}>
                      <Plus size={14} /> Add document
                    </button>
                  </div>
                  {docs.length === 0 && (
                    <div className="glass-panel rounded-2xl border border-border/50 p-8 text-center">
                      <p className="text-sm text-muted-foreground mb-3">No documents on file.</p>
                      <button type="button" onClick={() => setDocOpen(true)} className={GOLD_BTN}>
                        <Plus size={14} /> Add document
                      </button>
                    </div>
                  )}
                  {docs.map((d: any) => (
                    <div key={d.id} className="glass-panel rounded-xl border border-border/40 px-4 py-3 flex justify-between gap-3 text-sm">
                      <div>
                        <div className="font-medium">{d.documentName}</div>
                        <div className="text-xs text-muted-foreground capitalize">{d.documentType}</div>
                      </div>
                      <div className="text-right text-xs text-muted-foreground">
                        Exp {formatDate(d.expiryDate)}
                        {d.documentUrl && (
                          <a href={d.documentUrl} target="_blank" rel="noreferrer" className="block text-brand hover:underline mt-1">Open</a>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <HrModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit employee" icon={Pencil} wide>
        <form onSubmit={saveEdit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <HrField label="First name"><input className={hrInputClass} value={editForm.firstName || ''} onChange={(e) => setEditForm({ ...editForm, firstName: e.target.value })} required /></HrField>
            <HrField label="Last name"><input className={hrInputClass} value={editForm.lastName || ''} onChange={(e) => setEditForm({ ...editForm, lastName: e.target.value })} required /></HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Email"><input className={hrInputClass} type="email" value={editForm.email || ''} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} /></HrField>
            <HrField label="Phone"><input className={hrInputClass} value={editForm.phone || ''} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} /></HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="NI / National ID"><input className={hrInputClass} value={editForm.nationalId || ''} onChange={(e) => setEditForm({ ...editForm, nationalId: e.target.value })} /></HrField>
            <HrField label="Tax code"><input className={hrInputClass} value={editForm.taxId || ''} onChange={(e) => setEditForm({ ...editForm, taxId: e.target.value })} /></HrField>
          </div>
          <HrField label="Address"><input className={hrInputClass} value={editForm.addressLine1 || ''} onChange={(e) => setEditForm({ ...editForm, addressLine1: e.target.value })} /></HrField>
          <div className="grid grid-cols-3 gap-3">
            <HrField label="City"><input className={hrInputClass} value={editForm.city || ''} onChange={(e) => setEditForm({ ...editForm, city: e.target.value })} /></HrField>
            <HrField label="Postcode"><input className={hrInputClass} value={editForm.postalCode || ''} onChange={(e) => setEditForm({ ...editForm, postalCode: e.target.value })} /></HrField>
            <HrField label="Country"><input className={hrInputClass} value={editForm.countryCode || ''} onChange={(e) => setEditForm({ ...editForm, countryCode: e.target.value })} /></HrField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <HrField label="Emergency name"><input className={hrInputClass} value={editForm.emergencyContactName || ''} onChange={(e) => setEditForm({ ...editForm, emergencyContactName: e.target.value })} /></HrField>
            <HrField label="Emergency phone"><input className={hrInputClass} value={editForm.emergencyContactPhone || ''} onChange={(e) => setEditForm({ ...editForm, emergencyContactPhone: e.target.value })} /></HrField>
          </div>
          <HrField label="Notes"><textarea className={hrTextareaClass} value={editForm.notes || ''} onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })} /></HrField>
          <HrModalActions onCancel={() => setEditOpen(false)} submitLabel="Save" submitting={saving} />
        </form>
      </HrModal>

      <HrModal open={immOpen} onClose={() => setImmOpen(false)} title="Immigration status" icon={ShieldCheck}>
        <form onSubmit={saveImmigration} className="space-y-4">
          <HrField label="Immigration status">
            <select className={hrInputClass} value={immForm.status} onChange={(e) => setImmForm({ ...immForm, status: e.target.value })}>
              {VISA_TYPES.map((v) => <option key={v.value} value={v.value}>{v.label}</option>)}
            </select>
          </HrField>
          <HrField label="Visa type (free text)"><input className={hrInputClass} value={immForm.visaType} onChange={(e) => setImmForm({ ...immForm, visaType: e.target.value })} /></HrField>
          <HrField label="Visa expiry"><input className={hrInputClass} type="date" value={immForm.visaExpiry} onChange={(e) => setImmForm({ ...immForm, visaExpiry: e.target.value })} /></HrField>
          <HrField label="Share code"><input className={hrInputClass} value={immForm.shareCode} onChange={(e) => setImmForm({ ...immForm, shareCode: e.target.value })} /></HrField>
          <HrField label="Notes"><textarea className={hrTextareaClass} value={immForm.notes} onChange={(e) => setImmForm({ ...immForm, notes: e.target.value })} /></HrField>
          <HrModalActions onCancel={() => setImmOpen(false)} submitLabel="Save" submitting={saving} />
        </form>
      </HrModal>

      <HrModal open={leaveOpen} onClose={() => setLeaveOpen(false)} title="Add leave request" icon={Calendar}>
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

      <HrModal open={docOpen} onClose={() => setDocOpen(false)} title="Add document" icon={FileText}>
        <form onSubmit={saveDocument} className="space-y-4">
          <HrField label="Name"><input className={hrInputClass} required value={docForm.documentName} onChange={(e) => setDocForm({ ...docForm, documentName: e.target.value })} /></HrField>
          <HrField label="Type">
            <select className={hrInputClass} value={docForm.documentType} onChange={(e) => setDocForm({ ...docForm, documentType: e.target.value })}>
              <option value="contract">Contract</option>
              <option value="passport">Passport</option>
              <option value="id">Photo ID</option>
              <option value="certificate">Certificate</option>
              <option value="other">Other</option>
            </select>
          </HrField>
          <HrField label="Document URL"><input className={hrInputClass} required value={docForm.documentUrl} onChange={(e) => setDocForm({ ...docForm, documentUrl: e.target.value })} placeholder="https://…" /></HrField>
          <HrField label="Expiry"><input type="date" className={hrInputClass} value={docForm.expiryDate} onChange={(e) => setDocForm({ ...docForm, expiryDate: e.target.value })} /></HrField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={docForm.isRtw} onChange={(e) => setDocForm({ ...docForm, isRtw: e.target.checked })} />
            Right to Work document
          </label>
          <HrModalActions onCancel={() => setDocOpen(false)} submitLabel="Add" submitting={saving} />
        </form>
      </HrModal>
    </div>
  );
}
