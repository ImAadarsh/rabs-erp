'use client';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import {
  listCrmPipelines, listCrmDeals, createCrmDeal, moveCrmDeal, listCrmAccounts
} from '@/lib/api';
import { crmApiError, formatMoney } from '@/lib/crm-utils';
import { toast } from 'sonner';
import { ColumnDef } from '@tanstack/react-table';
import {
  Plus, LayoutGrid, List, ArrowRight, AlertCircle, Columns3, Send
} from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';
import { CrmCustomerSelect, customerOptionFromRecord } from '@/components/crm/crm-customer-select';

export default function CrmPipelinePage() {
  return (
    <Suspense fallback={<div className="min-h-screen app-surface" />}>
      <CrmPipelinePageInner />
    </Suspense>
  );
}

function CrmPipelinePageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, hydrated } = useSession();
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [pipelineId, setPipelineId] = useState('');
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState<'kanban' | 'list'>('kanban');
  const [apiMissing, setApiMissing] = useState(false);
  const [showCreate, setShowCreate] = useState(searchParams.get('new') === 'true');
  const [moveDeal, setMoveDeal] = useState<any>(null);
  const [moveStageId, setMoveStageId] = useState('');
  const [accounts, setAccounts] = useState<any[]>([]);
  const [form, setForm] = useState({
    name: '',
    stageId: '',
    customerId: '',
    amount: '',
    currency: 'GBP',
    expectedClose: '',
  });
  const [saving, setSaving] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);

  const orgId = session?.user?.organizationId;
  const pipeline = pipelines.find((p) => p.id === pipelineId);
  const stages = useMemo(
    () => [...(pipeline?.stages || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0)),
    [pipeline]
  );
  const accountOptions = useMemo(() => accounts.map(customerOptionFromRecord), [accounts]);

  const loadPipelines = useCallback(async () => {
    if (!orgId) return;
    try {
      const res = await listCrmPipelines({ organizationId: orgId });
      const list = res.data || [];
      setPipelines(list);
      setApiMissing(false);
      setPipelineId((prev) => prev || list.find((p: any) => p.isDefault)?.id || list[0]?.id || '');
    } catch (err: any) {
      if (err?.response?.status === 404) setApiMissing(true);
      else toast.error(crmApiError(err, 'Failed to load pipelines'));
    }
  }, [orgId]);

  const loadDeals = useCallback(async () => {
    if (!orgId || !pipelineId) {
      setDeals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const res = await listCrmDeals({ organizationId: orgId, pipelineId });
      setDeals(res.data || []);
    } catch (err: any) {
      if (err?.response?.status === 404) setApiMissing(true);
      else toast.error(crmApiError(err, 'Failed to load deals'));
    } finally {
      setLoading(false);
    }
  }, [orgId, pipelineId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void loadPipelines();
  }, [hydrated, session?.accessToken, router, loadPipelines]);

  useEffect(() => {
    void loadDeals();
  }, [loadDeals]);

  useEffect(() => {
    if (!showCreate || !orgId) return;
    listCrmAccounts({ organizationId: orgId, limit: 100 })
      .then((r) => setAccounts(r.data || []))
      .catch(() => setAccounts([]));
  }, [showCreate, orgId]);

  function dealsForStage(stageId: string) {
    return deals.filter((d) => String(d.stageId) === String(stageId) || String(d.stage?.id) === String(stageId));
  }

  async function doMove(dealId: string, stageId: string) {
    try {
      const updated = await moveCrmDeal(dealId, { stageId });
      setDeals((prev) => prev.map((d) => (d.id === dealId ? { ...d, ...updated.data, stageId } : d)));
      toast.success('Deal moved');
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to move deal'));
      void loadDeals();
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!orgId || !pipelineId) return;
    if (!form.customerId) {
      toast.error('Select an account');
      return;
    }
    setSaving(true);
    try {
      await createCrmDeal({
        organizationId: orgId,
        name: form.name,
        pipelineId,
        stageId: form.stageId || stages[0]?.id,
        customerId: form.customerId,
        amount: form.amount ? Number(form.amount) : undefined,
        currency: form.currency,
        expectedClose: form.expectedClose || undefined,
        ownerUserId: session?.user?.id,
      });
      toast.success('Deal created');
      setShowCreate(false);
      setForm({ name: '', stageId: '', customerId: '', amount: '', currency: 'GBP', expectedClose: '' });
      void loadDeals();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create deal'));
    } finally {
      setSaving(false);
    }
  }

  async function handleMoveSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!moveDeal || !moveStageId) return;
    setSaving(true);
    try {
      await doMove(moveDeal.id, moveStageId);
      setMoveDeal(null);
    } finally {
      setSaving(false);
    }
  }

  const columns = useMemo<ColumnDef<any>[]>(() => [
    {
      accessorKey: 'name',
      header: 'Deal',
      cell: (info) => (
        <Link href={`/crm/deals/${info.row.original.id}`} className="font-semibold text-brand hover:underline">
          {info.getValue() as string}
        </Link>
      ),
    },
    {
      id: 'stage',
      header: 'Stage',
      accessorFn: (r) => r.stage?.name || stages.find((s: any) => String(s.id) === String(r.stageId))?.name || '—',
      cell: (i) => (
        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border border-border bg-muted/40">
          {i.getValue() as string}
        </span>
      ),
    },
    {
      accessorKey: 'amount',
      header: 'Amount',
      cell: (i) => formatMoney(i.getValue() as number, i.row.original.currency),
    },
    {
      id: 'customer',
      header: 'Account',
      accessorFn: (r) => r.customer?.companyName || r.customer?.email || r.customerId || '—',
    },
    {
      accessorKey: 'expectedClose',
      header: 'Close',
      cell: (i) => (i.getValue() ? new Date(i.getValue() as string).toLocaleDateString() : '—'),
    },
    {
      id: 'actions',
      header: '',
      cell: (info) => (
        <button
          type="button"
          className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
          onClick={() => {
            setMoveDeal(info.row.original);
            setMoveStageId(info.row.original.stageId || '');
          }}
        >
          <ArrowRight size={16} />
        </button>
      ),
    },
  ], [stages]);

  const openValue = useMemo(
    () => deals.filter((d) => d.status === 'open').reduce((s, d) => s + (Number(d.amount) || 0), 0),
    [deals]
  );

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="Pipeline"
          actions={[{
            label: 'Create Deal',
            onClick: () => {
              setForm((f) => ({ ...f, stageId: stages[0]?.id || '' }));
              setShowCreate(true);
            },
            icon: <Plus size={18} />,
          }]}
        />
        <main className="p-6 md:p-8 space-y-5">
          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Pipeline API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Waiting on <code className="font-mono">/api/crm/pipelines</code> and <code className="font-mono">/api/crm/deals</code>.
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-end gap-3 justify-between">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-muted-foreground uppercase tracking-[0.14em]">Pipeline</label>
                <select
                  value={pipelineId}
                  onChange={(e) => setPipelineId(e.target.value)}
                  className={`${crmInputClass} w-auto min-w-[240px] h-10`}
                  disabled={!pipelines.length}
                >
                  {!pipelines.length && <option value="">No pipelines</option>}
                  {pipelines.map((p) => (
                    <option key={p.id} value={p.id}>{p.name}{p.isDefault ? ' (default)' : ''}</option>
                  ))}
                </select>
              </div>
              <Link href="/crm/settings/pipelines" className="text-xs text-brand hover:underline mb-2.5">Manage stages</Link>
              {!loading && pipelineId && (
                <div className="mb-2.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">{deals.length}</span> deals ·{' '}
                  <span className="font-semibold text-foreground">{formatMoney(openValue)}</span> open
                </div>
              )}
            </div>
            <div className="flex items-center gap-1 rounded-xl border border-border bg-muted/30 p-1">
              <button
                type="button"
                onClick={() => setView('kanban')}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition ${view === 'kanban' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <LayoutGrid size={14} /> Board
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                className={`px-3 py-1.5 rounded-lg text-sm flex items-center gap-1.5 transition ${view === 'list' ? 'bg-background shadow-sm font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <List size={14} /> List
              </button>
            </div>
          </div>

          {loading ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground italic">Loading deals…</div>
          ) : !pipelineId || !stages.length ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <Columns3 className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">No pipeline stages</p>
              <p className="text-sm mt-1">Create a pipeline with stages in Settings first.</p>
              <Link href="/crm/settings/pipelines" className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm">Open settings</Link>
            </div>
          ) : view === 'list' ? (
            deals.length === 0 ? (
              <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
                <p className="font-medium text-foreground">No deals in this pipeline</p>
                <p className="text-sm mt-1">Create a deal to populate the board.</p>
                <button
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, stageId: stages[0]?.id || '' }));
                    setShowCreate(true);
                  }}
                  className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                >
                  <Plus size={16} /> Create Deal
                </button>
              </div>
            ) : (
              <RichDataTable data={deals} columns={columns} searchPlaceholder="Search deals…" />
            )
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-4 min-h-[460px]">
              {stages.map((stage: any) => {
                const columnDeals = dealsForStage(stage.id);
                const colValue = columnDeals.reduce((s, d) => s + (Number(d.amount) || 0), 0);
                const isTerminal = stage.isWon || stage.isLost;
                return (
                  <div
                    key={stage.id}
                    className={`w-[280px] shrink-0 flex flex-col rounded-2xl border bg-muted/15 ${
                      stage.isWon ? 'border-emerald-500/25' : stage.isLost ? 'border-rose-500/20' : 'border-border/60'
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.add('ring-2', 'ring-brand/40');
                    }}
                    onDragLeave={(e) => {
                      e.currentTarget.classList.remove('ring-2', 'ring-brand/40');
                    }}
                    onDrop={(e) => {
                      e.preventDefault();
                      e.currentTarget.classList.remove('ring-2', 'ring-brand/40');
                      const dealId = e.dataTransfer.getData('text/deal-id') || dragId;
                      if (dealId) void doMove(dealId, stage.id);
                      setDragId(null);
                    }}
                  >
                    <div className="px-3.5 py-3 border-b border-border/50 flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="text-sm font-semibold truncate flex items-center gap-2">
                          {stage.name}
                          {isTerminal && (
                            <span className={`text-[9px] uppercase font-bold px-1.5 py-0.5 rounded ${
                              stage.isWon ? 'bg-emerald-500/15 text-emerald-600' : 'bg-rose-500/15 text-rose-600'
                            }`}>
                              {stage.isWon ? 'Won' : 'Lost'}
                            </span>
                          )}
                        </div>
                        <div className="text-[10px] text-muted-foreground uppercase tracking-widest mt-0.5">
                          {columnDeals.length} deal{columnDeals.length === 1 ? '' : 's'} · {formatMoney(colValue)}
                        </div>
                      </div>
                      <button
                        type="button"
                        title="Create deal in this stage"
                        onClick={() => {
                          setForm((f) => ({ ...f, stageId: stage.id }));
                          setShowCreate(true);
                        }}
                        className="shrink-0 h-6 w-6 rounded-full bg-brand/15 text-brand hover:bg-brand hover:text-white flex items-center justify-center transition"
                      >
                        <Plus size={14} />
                      </button>
                    </div>
                    <div className="p-2.5 space-y-2.5 flex-1 overflow-y-auto max-h-[70vh]">
                      {columnDeals.length === 0 && (
                        <div className="rounded-xl border border-dashed border-border/70 bg-background/40 py-10 px-3 text-center">
                          <p className="text-xs text-muted-foreground">Empty stage</p>
                          <button
                            type="button"
                            className="text-[11px] text-brand hover:underline mt-1"
                            onClick={() => {
                              setForm((f) => ({ ...f, stageId: stage.id }));
                              setShowCreate(true);
                            }}
                          >
                            Create deal
                          </button>
                        </div>
                      )}
                      {columnDeals.map((deal) => (
                        <div
                          key={deal.id}
                          draggable
                          onDragStart={(e) => {
                            setDragId(deal.id);
                            e.dataTransfer.setData('text/deal-id', deal.id);
                            e.dataTransfer.effectAllowed = 'move';
                          }}
                          className="group rounded-xl border border-border/70 bg-card p-3.5 shadow-sm cursor-grab active:cursor-grabbing hover:border-brand/50 hover:shadow-md transition"
                        >
                          <Link href={`/crm/deals/${deal.id}`} className="font-medium text-sm hover:text-brand block leading-snug">
                            {deal.name}
                          </Link>
                          <div className="text-sm font-semibold text-foreground mt-2">{formatMoney(deal.amount, deal.currency)}</div>
                          {(deal.customer?.companyName || deal.customer?.email) && (
                            <div className="text-[11px] text-muted-foreground mt-1 truncate">
                              {deal.customer.companyName || deal.customer.email}
                            </div>
                          )}
                          <button
                            type="button"
                            className="mt-2.5 text-[11px] font-medium text-brand hover:underline opacity-80 group-hover:opacity-100"
                            onClick={() => {
                              setMoveDeal(deal);
                              setMoveStageId(deal.stageId || stage.id);
                            }}
                          >
                            Move…
                          </button>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </main>
      </div>

      <CrmModal open={showCreate} onClose={() => setShowCreate(false)} title="New Deal" icon={Plus}>
        <form onSubmit={handleCreate} className="space-y-4">
          <CrmField label="Deal name">
            <input
              required
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Khan Convenience — starter pack"
            />
          </CrmField>
          <CrmField label="Stage">
            <select required value={form.stageId} onChange={(e) => setForm({ ...form, stageId: e.target.value })} className={crmInputClass}>
              {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </CrmField>
          <CrmField label="Account">
            <CrmCustomerSelect
              required
              value={form.customerId}
              onChange={(customerId) => setForm({ ...form, customerId })}
              options={accountOptions}
              placeholder="Select account"
            />
          </CrmField>
          <div className="grid grid-cols-2 gap-4">
            <CrmField label="Amount">
              <input
                type="number"
                step="0.01"
                value={form.amount}
                onChange={(e) => setForm({ ...form, amount: e.target.value })}
                className={crmInputClass}
                placeholder="0.00"
              />
            </CrmField>
            <CrmField label="Close date">
              <input
                type="date"
                value={form.expectedClose}
                onChange={(e) => setForm({ ...form, expectedClose: e.target.value })}
                className={crmInputClass}
              />
            </CrmField>
          </div>
          <CrmModalActions
            onCancel={() => setShowCreate(false)}
            submitLabel="Create Deal"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={!!moveDeal} onClose={() => setMoveDeal(null)} title={moveDeal ? `Move ${moveDeal.name}` : 'Move deal'} icon={ArrowRight}>
        <form onSubmit={handleMoveSubmit} className="space-y-4">
          <CrmField label="Target stage">
            <select required value={moveStageId} onChange={(e) => setMoveStageId(e.target.value)} className={crmInputClass}>
              {stages.map((s: any) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </CrmField>
          <CrmModalActions
            onCancel={() => setMoveDeal(null)}
            submitLabel="Move Deal"
            submitting={saving}
            submitIcon={<ArrowRight size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
