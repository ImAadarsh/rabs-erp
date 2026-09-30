'use client';
import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { getCrmDeal, updateCrmDeal, moveCrmDeal, listCrmPipelines, createCrmActivity } from '@/lib/api';
import { crmApiError, formatMoney } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { ArrowLeft, X, Pencil, ArrowRight, PhoneCall } from 'lucide-react';

export default function CrmDealDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [deal, setDeal] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [stages, setStages] = useState<any[]>([]);
  const [editOpen, setEditOpen] = useState(false);
  const [moveOpen, setMoveOpen] = useState(false);
  const [stageId, setStageId] = useState('');
  const [form, setForm] = useState({ name: '', amount: '', expectedClose: '', status: 'open', probabilityOverride: '' });
  const [activityOpen, setActivityOpen] = useState(false);
  const [activityForm, setActivityForm] = useState({ type: 'task' as 'task' | 'call' | 'meeting' | 'note', subject: '', dueAt: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getCrmDeal(id);
      setDeal(res.data);
      setForm({
        name: res.data.name || '',
        amount: res.data.amount != null ? String(res.data.amount) : '',
        expectedClose: res.data.expectedClose ? String(res.data.expectedClose).slice(0, 10) : '',
        status: res.data.status || 'open',
        probabilityOverride: res.data.probabilityOverride != null ? String(res.data.probabilityOverride) : '',
      });
      setStageId(res.data.stageId || res.data.stage?.id || '');
      if (res.data.pipelineId) {
        try {
          const pipes = await listCrmPipelines({ organizationId: session?.user?.organizationId });
          const pipe = (pipes.data || []).find((p: any) => String(p.id) === String(res.data.pipelineId));
          setStages([...(pipe?.stages || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)));
        } catch { /* optional */ }
      }
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to load deal'));
      setDeal(null);
    } finally {
      setLoading(false);
    }
  }, [id, session?.user?.organizationId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updateCrmDeal(id, {
        name: form.name,
        amount: form.amount ? Number(form.amount) : null,
        expectedClose: form.expectedClose || null,
        status: form.status,
        probabilityOverride: form.probabilityOverride !== '' ? Number(form.probabilityOverride) : null,
      });
      toast.success('Deal updated');
      setEditOpen(false);
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to update deal'));
    } finally {
      setSaving(false);
    }
  }

  async function handleMove(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await moveCrmDeal(id, { stageId });
      toast.success('Deal moved');
      setMoveOpen(false);
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to move deal'));
    } finally {
      setSaving(false);
    }
  }

  async function handleActivity(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await createCrmActivity({
        organizationId: session?.user?.organizationId,
        type: activityForm.type,
        subject: activityForm.subject,
        dueAt: activityForm.dueAt || undefined,
        dealId: id,
        customerId: deal?.customerId,
        ownerUserId: session?.user?.id,
      });
      toast.success('Activity logged');
      setActivityOpen(false);
      setActivityForm({ type: 'task', subject: '', dueAt: '' });
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create activity'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title={loading ? 'Deal…' : deal?.name || 'Deal'} />
        <main className="p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/crm/pipeline" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> Pipeline
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-medium">{deal?.name || '…'}</span>
          </div>

          {loading ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground italic">Loading…</div>
          ) : !deal ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center">
              <p className="font-medium">Deal not found</p>
              <Link href="/crm/pipeline" className="text-sm text-brand hover:underline mt-2 inline-block">Back to pipeline</Link>
            </div>
          ) : (
            <div className="glass-panel rounded-2xl border border-border/50 p-6 space-y-6">
              <div className="flex flex-wrap justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-semibold tracking-tight">{deal.name}</h1>
                  <p className="text-sm text-muted-foreground mt-1">
                    {deal.stage?.name || 'Stage'} · {formatMoney(deal.amount, deal.currency)} · {deal.status || 'open'}
                  </p>
                  {deal.customerId && (
                    <Link href={`/crm/accounts/${deal.customerId}`} className="text-sm text-brand hover:underline mt-1 inline-block">
                      View account
                    </Link>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setActivityOpen(true)} className="btn bg-muted gap-2 text-sm"><PhoneCall size={16} /> Activity</button>
                  <button type="button" onClick={() => setMoveOpen(true)} className="btn bg-muted gap-2 text-sm"><ArrowRight size={16} /> Move</button>
                  <button type="button" onClick={() => setEditOpen(true)} className="btn btn-primary gap-2 text-sm"><Pencil size={16} /> Edit</button>
                </div>
              </div>

              <dl className="grid gap-4 sm:grid-cols-2 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-widest">Expected close</dt>
                  <dd className="mt-1 font-medium">{deal.expectedClose ? new Date(deal.expectedClose).toLocaleDateString() : '—'}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs uppercase tracking-widest">Probability</dt>
                  <dd className="mt-1 font-medium">
                    {deal.probability != null ? `${deal.probability}%` : deal.stage?.probability != null ? `${deal.stage.probability}%` : '—'}
                    {deal.probabilitySource && (
                      <span className="text-xs text-muted-foreground font-normal ml-1">({deal.probabilitySource})</span>
                    )}
                  </dd>
                </div>
              </dl>

              {(deal.stageHistory || []).length > 0 && (
                <div>
                  <h3 className="text-sm font-semibold mb-2">Stage history</h3>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {deal.stageHistory.map((h: any) => (
                      <li key={h.id}>{h.createdAt ? new Date(h.createdAt).toLocaleString() : '—'} · {h.note || 'moved'}</li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </main>
      </div>

      {editOpen && (
        <Modal title="Edit deal" onClose={() => setEditOpen(false)}>
          <form onSubmit={handleSave} className="space-y-4">
            <input required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} className="input" placeholder="Name" />
            <input type="number" step="0.01" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} className="input" placeholder="Amount" />
            <input type="date" value={form.expectedClose} onChange={(e) => setForm({ ...form, expectedClose: e.target.value })} className="input" />
            <input
              type="number"
              min={0}
              max={100}
              value={form.probabilityOverride}
              onChange={(e) => setForm({ ...form, probabilityOverride: e.target.value })}
              className="input"
              placeholder={`Probability override (stage: ${deal?.stage?.probability ?? '—'}%)`}
            />
            <p className="text-[11px] text-muted-foreground -mt-2">Leave blank to use stage probability.</p>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })} className="input">
              <option value="open">Open</option>
              <option value="won">Won</option>
              <option value="lost">Lost</option>
            </select>
            <div className="flex gap-3">
              <button type="button" onClick={() => setEditOpen(false)} className="btn flex-1 bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </Modal>
      )}

      {moveOpen && (
        <Modal title="Move stage" onClose={() => setMoveOpen(false)}>
          <form onSubmit={handleMove} className="space-y-4">
            <select required value={stageId} onChange={(e) => setStageId(e.target.value)} className="input">
              {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <div className="flex gap-3">
              <button type="button" onClick={() => setMoveOpen(false)} className="btn flex-1 bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Moving…' : 'Move'}</button>
            </div>
          </form>
        </Modal>
      )}

      {activityOpen && (
        <Modal title="Log activity" onClose={() => setActivityOpen(false)}>
          <form onSubmit={handleActivity} className="space-y-4">
            <select value={activityForm.type} onChange={(e) => setActivityForm({ ...activityForm, type: e.target.value as any })} className="input">
              <option value="task">Task</option>
              <option value="call">Call</option>
              <option value="meeting">Meeting</option>
              <option value="note">Note</option>
            </select>
            <input required value={activityForm.subject} onChange={(e) => setActivityForm({ ...activityForm, subject: e.target.value })} className="input" placeholder="Subject" />
            <input type="datetime-local" value={activityForm.dueAt} onChange={(e) => setActivityForm({ ...activityForm, dueAt: e.target.value })} className="input" />
            <div className="flex gap-3">
              <button type="button" onClick={() => setActivityOpen(false)} className="btn flex-1 bg-muted">Cancel</button>
              <button type="submit" disabled={saving} className="btn btn-primary flex-1">{saving ? 'Saving…' : 'Create'}</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
      <div className="glass-card w-full max-w-md overflow-hidden">
        <div className="p-5 border-b border-border flex items-center justify-between bg-muted/30">
          <h2 className="text-lg font-bold">{title}</h2>
          <button type="button" onClick={onClose} className="p-2 hover:bg-muted rounded-full"><X size={18} /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}
