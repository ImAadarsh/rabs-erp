'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listOnboardingChecklists, updateOnboardingChecklist, seedOnboardingChecklist,
  createOnboardingChecklist, listEmployees,
} from '@/lib/api';
import { employeeName, formatDate, hrApiError, isApiMissing, statusBadgeClass } from '@/lib/hr-utils';
import { HrModal, HrField, HrModalActions, hrInputClass } from '@/components/hr/hr-modal';
import { toast } from 'sonner';
import { AlertTriangle, CheckSquare, ClipboardList, Plus } from 'lucide-react';

const GOLD_BTN =
  'inline-flex items-center gap-2 h-11 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20 disabled:opacity-50';

export default function OnboardingPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN']);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [employees, setEmployees] = useState<any[]>([]);
  const [employeeId, setEmployeeId] = useState('');
  const [items, setItems] = useState<any[]>([]);
  const [seeding, setSeeding] = useState(false);
  const [itemOpen, setItemOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [itemForm, setItemForm] = useState({ itemLabel: '', itemKey: '', dueDate: '', sortOrder: 0 });

  const orgId = session?.user?.organizationId;

  const loadEmployees = useCallback(async () => {
    const emp = await listEmployees({ organizationId: orgId });
    setEmployees(emp.data || []);
  }, [orgId]);

  const loadChecklist = useCallback(async (eid: string) => {
    if (!eid) {
      setItems([]);
      return;
    }
    setLoading(true);
    try {
      const res = await listOnboardingChecklists({ employeeId: eid });
      setItems(res.data || []);
      setApiMissing(false);
    } catch (err) {
      if (isApiMissing(err)) {
        setApiMissing(true);
        setItems([]);
      } else {
        toast.error(hrApiError(err, 'Failed to load onboarding'));
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void loadEmployees().finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, router, loadEmployees]);

  useEffect(() => {
    if (employeeId) void loadChecklist(employeeId);
  }, [employeeId, loadChecklist]);

  async function onSeed() {
    if (!employeeId) {
      toast.error('Select an employee');
      return;
    }
    setSeeding(true);
    try {
      await seedOnboardingChecklist(employeeId);
      toast.success('Default checklist seeded');
      void loadChecklist(employeeId);
    } catch (err) {
      toast.error(isApiMissing(err) ? 'Onboarding API not live yet' : hrApiError(err, 'Seed failed'));
    } finally {
      setSeeding(false);
    }
  }

  async function onAddItem(e: React.FormEvent) {
    e.preventDefault();
    if (!employeeId) {
      toast.error('Select an employee');
      return;
    }
    setSaving(true);
    try {
      await createOnboardingChecklist({
        employeeId,
        organizationId: orgId,
        itemKey: itemForm.itemKey || itemForm.itemLabel.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 80) || `item_${Date.now()}`,
        itemLabel: itemForm.itemLabel,
        dueDate: itemForm.dueDate || undefined,
        sortOrder: itemForm.sortOrder || items.length + 1,
        isDone: false,
      });
      toast.success('Checklist item added');
      setItemOpen(false);
      setItemForm({ itemLabel: '', itemKey: '', dueDate: '', sortOrder: 0 });
      void loadChecklist(employeeId);
    } catch (err) {
      toast.error(isApiMissing(err) ? 'Onboarding API not live yet' : hrApiError(err, 'Add failed'));
    } finally {
      setSaving(false);
    }
  }

  async function toggleItem(row: any) {
    try {
      await updateOnboardingChecklist(row.id, { isDone: !row.isDone });
      void loadChecklist(employeeId);
    } catch (err) {
      toast.error(hrApiError(err, 'Update failed'));
    }
  }

  const done = items.filter((i) => i.isDone).length;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Onboarding" />
        <main className="p-6 md:p-8 space-y-6">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Onboarding API not deployed yet</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">/api/hr/onboarding</code>.</div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="space-y-1.5 min-w-[240px]">
              <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.14em]">Employee</label>
              <select
                className="flex h-11 w-full rounded-xl border border-border/80 bg-background px-3.5 text-sm"
                value={employeeId}
                onChange={(e) => setEmployeeId(e.target.value)}
              >
                <option value="">Select…</option>
                {employees.map((e) => (
                  <option key={e.id} value={e.id}>{employeeName(e)}</option>
                ))}
              </select>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={!employeeId}
                onClick={() => setItemOpen(true)}
                className="inline-flex items-center gap-2 h-11 px-4 rounded-xl border border-border bg-card text-sm font-medium disabled:opacity-50"
              >
                <Plus size={14} /> Add checklist item
              </button>
              <button
                type="button"
                disabled={!employeeId || seeding}
                onClick={() => void onSeed()}
                className={GOLD_BTN}
              >
                <Plus size={14} /> {seeding ? 'Seeding…' : 'Seed default checklist'}
              </button>
            </div>
          </div>

          {!employeeId && (
            <div className="glass-panel rounded-2xl border border-border/50 p-10 text-center text-sm text-muted-foreground">
              Select an employee to view or create their onboarding checklist.
            </div>
          )}

          {employeeId && (
            <section className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/40 flex justify-between gap-3">
                <div>
                  <Link href={`/hr/employees/${employeeId}`} className="font-semibold text-brand hover:underline inline-flex items-center gap-2">
                    <ClipboardList size={16} />
                    {employeeName(employees.find((e) => e.id === employeeId))}
                  </Link>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {done}/{items.length} complete
                  </div>
                </div>
                <span className={`text-[10px] font-bold uppercase self-start px-2 py-0.5 rounded-full ${statusBadgeClass(done === items.length && items.length ? 'completed' : 'pending')}`}>
                  {items.length === 0 ? 'empty' : done === items.length ? 'completed' : 'in progress'}
                </span>
              </div>
              {loading && <div className="p-6 text-sm text-muted-foreground">Loading…</div>}
              {!loading && items.length === 0 && (
                <div className="p-8 text-center">
                  <p className="text-sm text-muted-foreground mb-4">No checklist items — seed UK defaults or add a custom item.</p>
                  <div className="flex flex-wrap justify-center gap-2">
                    <button type="button" onClick={() => setItemOpen(true)} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border text-sm font-medium">
                      <Plus size={14} /> Add item
                    </button>
                    <button type="button" disabled={seeding} onClick={() => void onSeed()} className={GOLD_BTN.replace('h-11', 'h-10')}>
                      <Plus size={14} /> Seed defaults
                    </button>
                  </div>
                </div>
              )}
              <div className="p-3 space-y-1">
                {items.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => toggleItem(item)}
                    className="w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left hover:bg-muted/50"
                  >
                    <CheckSquare size={16} className={item.isDone ? 'text-emerald-600' : 'text-muted-foreground'} />
                    <span className={`flex-1 ${item.isDone ? 'line-through text-muted-foreground' : ''}`}>
                      {item.itemLabel || item.label}
                    </span>
                    {item.dueDate && <span className="text-[10px] text-muted-foreground">Due {formatDate(item.dueDate)}</span>}
                  </button>
                ))}
              </div>
            </section>
          )}
        </main>
      </div>

      <HrModal open={itemOpen} onClose={() => setItemOpen(false)} title="Add checklist item" icon={ClipboardList}>
        <form onSubmit={onAddItem} className="space-y-4">
          <HrField label="Item label">
            <input className={hrInputClass} required value={itemForm.itemLabel} onChange={(e) => setItemForm({ ...itemForm, itemLabel: e.target.value })} placeholder="e.g. Complete RTW check" />
          </HrField>
          <HrField label="Due date">
            <input type="date" className={hrInputClass} value={itemForm.dueDate} onChange={(e) => setItemForm({ ...itemForm, dueDate: e.target.value })} />
          </HrField>
          <HrModalActions onCancel={() => setItemOpen(false)} submitLabel="Add item" submitting={saving} />
        </form>
      </HrModal>
    </div>
  );
}
