'use client';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import {
  listCrmPipelines, createCrmPipeline, updateCrmPipeline,
  createCrmStage, updateCrmStage, deleteCrmStage,
  getCrmSettings, updateCrmSettings
} from '@/lib/api';
import { crmApiError, PIPELINE_TYPES } from '@/lib/crm-utils';
import { toast } from 'sonner';
import {
  Plus, Pencil, Trash2, AlertCircle, Settings, ArrowLeft, GripVertical, Send
} from 'lucide-react';
import { CrmModal, CrmField, CrmModalActions, crmInputClass } from '@/components/crm/crm-modal';

export default function CrmPipelineSettingsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [pipelines, setPipelines] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiMissing, setApiMissing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showPipeline, setShowPipeline] = useState(false);
  const [pipelineForm, setPipelineForm] = useState({ name: '', type: 'onboarding' as string, isDefault: false });
  const [showStage, setShowStage] = useState(false);
  const [editingStage, setEditingStage] = useState<any>(null);
  const [stageForm, setStageForm] = useState({ name: '', probability: '0', isWon: false, isLost: false });
  const [saving, setSaving] = useState(false);
  const [crmSettings, setCrmSettings] = useState<any>(null);
  const [settingsSaving, setSettingsSaving] = useState(false);

  const orgId = session?.user?.organizationId;
  const selected = pipelines.find((p) => p.id === selectedId);

  const load = useCallback(async () => {
    if (!orgId) return;
    setLoading(true);
    try {
      const [res, settingsRes] = await Promise.all([
        listCrmPipelines({ organizationId: orgId }),
        getCrmSettings({ organizationId: orgId }).catch(() => ({ data: null })),
      ]);
      const list = res.data || [];
      setPipelines(list);
      setSelectedId((prev) => prev || list[0]?.id || null);
      setCrmSettings(settingsRes.data);
      setApiMissing(false);
    } catch (err: any) {
      if (err?.response?.status === 404) {
        setApiMissing(true);
        setPipelines([]);
      } else {
        toast.error(crmApiError(err, 'Failed to load pipelines'));
      }
    } finally {
      setLoading(false);
    }
  }, [orgId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
  }, [hydrated, session?.accessToken, router, load]);

  async function handleCreatePipeline(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await createCrmPipeline({
        organizationId: orgId,
        name: pipelineForm.name,
        type: pipelineForm.type as any,
        isDefault: pipelineForm.isDefault || pipelines.length === 0,
      });
      toast.success('Pipeline created — add stages below');
      setShowPipeline(false);
      setPipelineForm({ name: '', type: 'onboarding', isDefault: false });
      setSelectedId(res.data.id);
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to create pipeline'));
    } finally {
      setSaving(false);
    }
  }

  async function setDefault(pipeline: any) {
    try {
      await updateCrmPipeline(pipeline.id, { isDefault: true });
      toast.success('Default pipeline updated');
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to update pipeline'));
    }
  }

  function openStage(stage?: any) {
    if (stage) {
      setEditingStage(stage);
      setStageForm({
        name: stage.name || '',
        probability: stage.probability != null ? String(stage.probability) : '0',
        isWon: !!stage.isWon,
        isLost: !!stage.isLost,
      });
    } else {
      setEditingStage(null);
      setStageForm({ name: '', probability: '0', isWon: false, isLost: false });
    }
    setShowStage(true);
  }

  async function handleStageSave(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedId) return;
    setSaving(true);
    const payload = {
      name: stageForm.name,
      probability: Number(stageForm.probability) || 0,
      isWon: stageForm.isWon,
      isLost: stageForm.isLost,
    };
    try {
      if (editingStage) {
        await updateCrmStage(editingStage.id, payload);
        toast.success('Stage updated');
      } else {
        const stages = selected?.stages || [];
        await createCrmStage({
          pipelineId: selectedId,
          ...payload,
          position: stages.length,
        });
        toast.success('Stage added');
      }
      setShowStage(false);
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to save stage'));
    } finally {
      setSaving(false);
    }
  }

  async function removeStage(stage: any) {
    if (!confirm(`Delete stage "${stage.name}"?`)) return;
    try {
      await deleteCrmStage(stage.id);
      toast.success('Stage deleted');
      void load();
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to delete stage'));
    }
  }

  async function toggleSetting(key: 'autoAssignLeads' | 'autoFollowupOnLead', value: boolean) {
    setSettingsSaving(true);
    try {
      const res = await updateCrmSettings({ [key]: value, organizationId: orgId });
      setCrmSettings((prev: any) => ({ ...prev, ...res.data }));
      toast.success('Settings saved');
    } catch (err) {
      toast.error(crmApiError(err, 'Failed to update settings'));
    } finally {
      setSettingsSaving(false);
    }
  }

  const stages = [...(selected?.stages || [])].sort((a: any, b: any) => (a.position ?? 0) - (b.position ?? 0));

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header
          title="CRM Settings"
          actions={[
            ...(selected
              ? [{ label: 'Add Stage', onClick: () => openStage(), icon: <Plus size={16} />, variant: 'secondary' as const }]
              : []),
            { label: 'Add Pipeline', onClick: () => setShowPipeline(true), icon: <Plus size={18} /> },
          ]}
        />
        <main className="p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/crm/pipeline" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> Pipeline board
            </Link>
          </div>

          {crmSettings && (
            <div className="glass-panel rounded-2xl border border-border/50 p-5 space-y-4">
              <div>
                <h2 className="text-sm font-semibold">Lead automation</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Round-robin among {crmSettings.salesRepCount ?? 0} SALES_REP user(s). Follow-up tasks are due +1 day.
                </p>
              </div>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>Auto-assign new leads (round-robin)</span>
                <input
                  type="checkbox"
                  disabled={settingsSaving}
                  checked={!!crmSettings.autoAssignLeads}
                  onChange={(e) => void toggleSetting('autoAssignLeads', e.target.checked)}
                />
              </label>
              <label className="flex items-center justify-between gap-4 text-sm">
                <span>Auto follow-up task on lead create/assign</span>
                <input
                  type="checkbox"
                  disabled={settingsSaving}
                  checked={!!crmSettings.autoFollowupOnLead}
                  onChange={(e) => void toggleSetting('autoFollowupOnLead', e.target.checked)}
                />
              </label>
              {!!(crmSettings.assignableUsers?.length || crmSettings.salesReps?.length) && (
                <div className="pt-2 border-t border-border/40">
                  <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Assignable staff ({(crmSettings.assignableUsers || crmSettings.salesReps || []).length})
                  </div>
                  <ul className="space-y-1.5 max-h-40 overflow-y-auto text-sm">
                    {(crmSettings.assignableUsers || crmSettings.salesReps || []).map((u: any) => (
                      <li key={u.id} className="flex items-center justify-between gap-2">
                        <span>
                          {[u.firstName, u.lastName].filter(Boolean).join(' ') || u.email}
                        </span>
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {u.role || 'SALES_REP'}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {(crmSettings.salesRepCount ?? 0) === 0 && (
                <p className="text-xs text-amber-600">
                  No SALES_REP users yet — round-robin will not assign. Add the role or re-run CRM seed.
                </p>
              )}
            </div>
          )}

          {apiMissing && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400 text-sm">
              <AlertCircle size={18} className="mt-0.5 shrink-0" />
              <div>
                <div className="font-semibold">Pipelines API not ready</div>
                <div className="text-xs mt-0.5 opacity-80">Waiting on <code className="font-mono">/api/crm/pipelines</code>.</div>
              </div>
            </div>
          )}

          {loading ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground italic">Loading…</div>
          ) : (
            <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
              <div className="glass-panel rounded-2xl border border-border/50 p-3 space-y-1">
                <div className="px-2 py-2 text-xs font-bold uppercase tracking-widest text-muted-foreground flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-2"><Settings size={14} /> Pipelines</span>
                  <button type="button" onClick={() => setShowPipeline(true)} className="text-[10px] font-bold uppercase tracking-wide text-brand hover:underline">+ Add</button>
                </div>
                {pipelines.length === 0 ? (
                  <div className="px-2 py-6 text-center space-y-3">
                    <p className="text-sm text-muted-foreground italic">No pipelines yet.</p>
                    <button type="button" onClick={() => setShowPipeline(true)} className="inline-flex items-center gap-1.5 text-xs font-semibold text-brand hover:underline">
                      <Plus size={14} /> Add Pipeline
                    </button>
                  </div>
                ) : (
                  pipelines.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setSelectedId(p.id)}
                      className={`w-full text-left px-3 py-2.5 rounded-xl text-sm transition ${
                        selectedId === p.id ? 'bg-brand/15 text-foreground font-medium' : 'hover:bg-muted text-muted-foreground'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate">{p.name}</span>
                        {p.isDefault && <span className="text-[9px] uppercase font-bold text-brand">Default</span>}
                      </div>
                      <div className="text-[11px] opacity-70 mt-0.5">{p.type} · {(p.stages || []).length} stages</div>
                    </button>
                  ))
                )}
              </div>

              <div className="glass-panel rounded-2xl border border-border/50 p-6">
                {!selected ? (
                  <div className="text-center py-16 text-muted-foreground">
                    <Settings className="mx-auto mb-3 opacity-40" size={32} />
                    <p className="font-medium text-foreground">Select or create a pipeline</p>
                    <p className="text-sm mt-1">Stages become columns on the deal board.</p>
                    <button
                      type="button"
                      onClick={() => setShowPipeline(true)}
                      className="mt-4 inline-flex items-center gap-2 h-10 px-4 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                    >
                      <Plus size={16} /> Add Pipeline
                    </button>
                  </div>
                ) : (
                  <div className="space-y-6">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <h2 className="text-xl font-semibold">{selected.name}</h2>
                        <p className="text-sm text-muted-foreground mt-0.5 capitalize">{selected.type || 'pipeline'}</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {!selected.isDefault && (
                          <button type="button" onClick={() => setDefault(selected)} className="btn bg-muted text-sm">Set default</button>
                        )}
                        <button
                          type="button"
                          onClick={() => openStage()}
                          className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-xl text-sm font-medium bg-brand hover:bg-brand-600 text-white shadow-sm"
                        >
                          <Plus size={16} /> Add Stage
                        </button>
                      </div>
                    </div>

                    <ul className="space-y-2">
                      {stages.length === 0 && (
                        <li className="text-sm text-muted-foreground py-8 text-center space-y-3">
                          <p className="italic">No stages — add Qualification, Proposal, Won, Lost, etc.</p>
                          <button type="button" onClick={() => openStage()} className="inline-flex items-center gap-1.5 text-sm font-semibold text-brand hover:underline">
                            <Plus size={14} /> Add Stage
                          </button>
                        </li>
                      )}
                      {stages.map((stage: any) => (
                        <li key={stage.id} className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-3 bg-muted/10">
                          <GripVertical size={16} className="text-muted-foreground/50 shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-sm">{stage.name}</div>
                            <div className="text-[11px] text-muted-foreground">
                              {stage.probability != null ? `${stage.probability}%` : '—'}
                              {stage.isWon ? ' · Won' : ''}
                              {stage.isLost ? ' · Lost' : ''}
                            </div>
                          </div>
                          <button type="button" onClick={() => openStage(stage)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground"><Pencil size={14} /></button>
                          <button type="button" onClick={() => removeStage(stage)} className="p-2 rounded-lg hover:bg-muted text-muted-foreground hover:text-rose-500"><Trash2 size={14} /></button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}
        </main>
      </div>

      <CrmModal open={showPipeline} onClose={() => setShowPipeline(false)} title="New Pipeline" icon={Plus}>
        <form onSubmit={handleCreatePipeline} className="space-y-4">
          <CrmField label="Name">
            <input
              required
              value={pipelineForm.name}
              onChange={(e) => setPipelineForm({ ...pipelineForm, name: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Retailer Onboarding"
            />
          </CrmField>
          <CrmField label="Type">
            <select value={pipelineForm.type} onChange={(e) => setPipelineForm({ ...pipelineForm, type: e.target.value })} className={crmInputClass}>
              {PIPELINE_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </CrmField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={pipelineForm.isDefault} onChange={(e) => setPipelineForm({ ...pipelineForm, isDefault: e.target.checked })} />
            Set as default
          </label>
          <CrmModalActions
            onCancel={() => setShowPipeline(false)}
            submitLabel="Create Pipeline"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>

      <CrmModal open={showStage} onClose={() => setShowStage(false)} title={editingStage ? 'Edit Stage' : 'New Stage'} icon={editingStage ? Pencil : Plus}>
        <form onSubmit={handleStageSave} className="space-y-4">
          <CrmField label="Stage name">
            <input
              required
              value={stageForm.name}
              onChange={(e) => setStageForm({ ...stageForm, name: e.target.value })}
              className={crmInputClass}
              placeholder="e.g. Proposal"
            />
          </CrmField>
          <CrmField label="Probability %">
            <input
              type="number"
              min={0}
              max={100}
              value={stageForm.probability}
              onChange={(e) => setStageForm({ ...stageForm, probability: e.target.value })}
              className={crmInputClass}
            />
          </CrmField>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stageForm.isWon} onChange={(e) => setStageForm({ ...stageForm, isWon: e.target.checked, isLost: e.target.checked ? false : stageForm.isLost })} />
            Won stage
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={stageForm.isLost} onChange={(e) => setStageForm({ ...stageForm, isLost: e.target.checked, isWon: e.target.checked ? false : stageForm.isWon })} />
            Lost stage
          </label>
          <CrmModalActions
            onCancel={() => setShowStage(false)}
            submitLabel="Save Stage"
            submitting={saving}
            submitIcon={<Send size={16} />}
          />
        </form>
      </CrmModal>
    </div>
  );
}
