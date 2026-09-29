'use client';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import {
  getPmProject, updatePmProject, getPmProjectProgress, markPmProjectProductionReady, completePmProject,
  listPmDeliverables, createPmDeliverable, updatePmDeliverable,
  listPmTasks, createPmTask, completePmTask, addPmTaskDependency,
  listPmWorkOrders, createPmWorkOrder,
  listPmMilestones, createPmMilestone, updatePmMilestone,
  listPmSchedule, createPmScheduleBlock,
  listPmProjectMembers, addPmProjectMember, removePmProjectMember,
  listPmStages, createPmStage, listUsers,
} from '@/lib/api';
import {
  DELIVERABLE_STATUSES, formatDate, formatDateTime, formatMoney, MEMBER_ROLES,
  MILESTONE_STATUSES, pmApiError, progressBarColor, PROJECT_STATUSES,
  statusBadgeClass, TASK_PRIORITIES, TASK_STATUSES, userLabel, WORK_ORDER_STATUSES,
} from '@/lib/pm-utils';
import { toast } from 'sonner';
import {
  ArrowLeft, CheckCircle, Flag, FolderKanban, Plus, Rocket, Users, Package,
} from 'lucide-react';
import { PmModal, PmField, PmModalActions, pmInputClass, pmTextareaClass } from '@/components/pm/pm-modal';
import { displayName } from '@/lib/crm-utils';

type Tab =
  | 'overview'
  | 'plan'
  | 'tasks'
  | 'work_orders'
  | 'milestones'
  | 'schedule'
  | 'members'
  | 'progress';

export default function ProjectDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { session, hydrated } = useSession();
  const [project, setProject] = useState<any>(null);
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('overview');
  const [deliverables, setDeliverables] = useState<any[]>([]);
  const [tasks, setTasks] = useState<any[]>([]);
  const [workOrders, setWorkOrders] = useState<any[]>([]);
  const [milestones, setMilestones] = useState<any[]>([]);
  const [schedule, setSchedule] = useState<any[]>([]);
  const [members, setMembers] = useState<any[]>([]);
  const [stages, setStages] = useState<any[]>([]);
  const [users, setUsers] = useState<any[]>([]);
  const [actionBusy, setActionBusy] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [editForm, setEditForm] = useState({ scope: '', objectives: '', status: 'draft', startDate: '', endDate: '', budget: '', currency: 'GBP' });
  const [modal, setModal] = useState<'deliverable' | 'task' | 'wo' | 'milestone' | 'schedule' | 'member' | 'stage' | null>(null);
  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);

  const orgId = session?.user?.organizationId;

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const res = await getPmProject(id);
      const p = res.data?.project || res.data;
      setProject(p);
      setEditForm({
        scope: p?.scope || '',
        objectives: p?.objectives || '',
        status: p?.status || 'draft',
        startDate: p?.startDate ? String(p.startDate).slice(0, 10) : '',
        endDate: p?.endDate ? String(p.endDate).slice(0, 10) : '',
        budget: p?.budget != null ? String(p.budget) : '',
        currency: p?.currency || 'GBP',
      });

      const [dels, tsk, wos, ms, sched, mems, stgs, prog] = await Promise.allSettled([
        listPmDeliverables(id),
        listPmTasks({ projectId: id, limit: 200 }),
        listPmWorkOrders({ projectId: id, limit: 200 }),
        listPmMilestones({ projectId: id, limit: 200 }),
        listPmSchedule({ projectId: id, limit: 200 }),
        listPmProjectMembers(id),
        listPmStages({ projectId: id, organizationId: orgId }),
        getPmProjectProgress(id),
      ]);

      if (dels.status === 'fulfilled') setDeliverables(dels.value.data || []);
      else if (Array.isArray(res.data?.deliverables)) setDeliverables(res.data.deliverables);

      if (tsk.status === 'fulfilled') setTasks(tsk.value.data || []);
      else if (Array.isArray(res.data?.tasks)) setTasks(res.data.tasks);

      if (wos.status === 'fulfilled') setWorkOrders(wos.value.data || []);
      else if (Array.isArray(res.data?.workOrders)) setWorkOrders(res.data.workOrders);

      if (ms.status === 'fulfilled') setMilestones(ms.value.data || []);
      else if (Array.isArray(res.data?.milestones)) setMilestones(res.data.milestones);

      if (sched.status === 'fulfilled') setSchedule(sched.value.data || []);
      if (mems.status === 'fulfilled') setMembers(mems.value.data || []);
      if (stgs.status === 'fulfilled') setStages(stgs.value.data || []);
      if (prog.status === 'fulfilled') setProgress(prog.value.data);
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to load project'));
      setProject(null);
    } finally {
      setLoading(false);
    }
  }, [id, orgId]);

  useEffect(() => {
    if (!hydrated) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    void load();
    void listUsers().then((r) => setUsers(r.data || [])).catch(() => undefined);
  }, [hydrated, session?.accessToken, router, load]);

  async function saveOverview(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      await updatePmProject(id, {
        scope: editForm.scope || null,
        objectives: editForm.objectives || null,
        status: editForm.status,
        startDate: editForm.startDate || null,
        endDate: editForm.endDate || null,
        budget: editForm.budget ? Number(editForm.budget) : 0,
        currency: editForm.currency,
      });
      toast.success('Project updated');
      setEditOpen(false);
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to update'));
    } finally {
      setSaving(false);
    }
  }

  async function handleMarkReady() {
    setActionBusy(true);
    try {
      await markPmProjectProductionReady(id, { productionReady: true });
      toast.success('Marked production ready');
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to mark production ready'));
    } finally {
      setActionBusy(false);
    }
  }

  async function handleComplete() {
    if (!confirm('Mark this project as completed?')) return;
    setActionBusy(true);
    try {
      await completePmProject(id);
      toast.success('Project completed');
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to complete project'));
    } finally {
      setActionBusy(false);
    }
  }

  async function submitModal(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    try {
      if (modal === 'deliverable') {
        await createPmDeliverable(id, {
          title: form.title,
          description: form.description || null,
          dueDate: form.dueDate || null,
          status: form.status || 'pending',
        });
        toast.success('Deliverable added');
      } else if (modal === 'task') {
        const created = await createPmTask({
          organizationId: orgId,
          projectId: id,
          title: form.title,
          description: form.description || null,
          assigneeUserId: form.assigneeUserId || null,
          status: form.status || 'todo',
          priority: form.priority || 'medium',
          dueDate: form.dueDate || null,
          workOrderId: form.workOrderId || null,
          estimateHours: form.estimateHours ? Number(form.estimateHours) : 0,
        });
        if (form.dependsOnTaskId && created.data?.id) {
          await addPmTaskDependency(created.data.id, { dependsOnTaskId: form.dependsOnTaskId });
        }
        toast.success('Task created');
      } else if (modal === 'wo') {
        await createPmWorkOrder({
          organizationId: orgId,
          projectId: id,
          title: form.title,
          description: form.description || null,
          status: form.status || 'draft',
          assigneeUserId: form.assigneeUserId || null,
          stageId: form.stageId || null,
          scheduledStart: form.scheduledStart || null,
          scheduledEnd: form.scheduledEnd || null,
        });
        toast.success('Work order created');
      } else if (modal === 'milestone') {
        await createPmMilestone({
          projectId: id,
          title: form.title,
          description: form.description || null,
          dueDate: form.dueDate || null,
          status: form.status || 'pending',
        });
        toast.success('Milestone created');
      } else if (modal === 'schedule') {
        await createPmScheduleBlock({
          organizationId: orgId,
          userId: form.userId,
          projectId: id,
          taskId: form.taskId || null,
          startAt: form.startAt,
          endAt: form.endAt,
          notes: form.notes || null,
        });
        toast.success('Schedule block added');
      } else if (modal === 'member') {
        await addPmProjectMember(id, { userId: form.userId, role: form.role || 'member' });
        toast.success('Member added');
      } else if (modal === 'stage') {
        await createPmStage({
          organizationId: orgId,
          projectId: id,
          name: form.name,
          position: form.position ? Number(form.position) : stages.length,
        });
        toast.success('Stage created');
      }
      setModal(null);
      setForm({});
      void load();
    } catch (err) {
      toast.error(pmApiError(err, 'Failed to save'));
    } finally {
      setSaving(false);
    }
  }

  const tabs: { id: Tab; label: string; count?: number }[] = useMemo(() => [
    { id: 'overview', label: 'Overview' },
    { id: 'plan', label: 'Plan / Timeline' },
    { id: 'tasks', label: 'Tasks', count: tasks.length },
    { id: 'work_orders', label: 'Work Orders', count: workOrders.length },
    { id: 'milestones', label: 'Milestones', count: milestones.length },
    { id: 'schedule', label: 'Schedule', count: schedule.length },
    { id: 'members', label: 'Members', count: members.length },
    { id: 'progress', label: 'Progress' },
  ], [tasks.length, workOrders.length, milestones.length, schedule.length, members.length]);

  const pct = Number(progress?.progressPct ?? project?.progressPct) || 0;
  const title = project?.name || `Project #${id}`;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title={loading ? 'Project…' : title} />
        <main className="p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <Link href="/projects/projects" className="inline-flex items-center gap-1.5 text-muted-foreground hover:text-foreground">
              <ArrowLeft size={16} /> Projects
            </Link>
            <span className="text-muted-foreground/40">/</span>
            <span className="font-medium">{title}</span>
          </div>

          {project && (
            <div className="glass-panel rounded-2xl border border-border/50 p-5 space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-2 min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
                    <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border ${statusBadgeClass(project.status)}`}>
                      {String(project.status || '').replace(/_/g, ' ')}
                    </span>
                    {project.productionReady ? (
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide border bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                        Production ready
                      </span>
                    ) : null}
                  </div>
                  <div className="text-sm text-muted-foreground flex flex-wrap gap-x-4 gap-y-1">
                    {project.code && <span className="font-mono text-xs">{project.code}</span>}
                    <span>{formatDate(project.startDate)} → {formatDate(project.endDate)}</span>
                    <span>{formatMoney(project.budget, project.currency)}</span>
                    <span>Owner: {userLabel(project.owner)}</span>
                    {project.customer && <span>Customer: {displayName(project.customer)}</span>}
                  </div>
                  <div className="max-w-md space-y-1 pt-1">
                    <div className="flex justify-between text-xs"><span>Progress</span><span className="font-semibold">{pct.toFixed(0)}%</span></div>
                    <div className="h-2 rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${progressBarColor(pct)}`} style={{ width: `${Math.min(100, pct)}%` }} />
                    </div>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setEditOpen(true)} className="px-3 py-2 rounded-xl text-sm border border-border hover:bg-muted">
                    Edit overview
                  </button>
                  {!project.productionReady && project.status !== 'completed' && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleMarkReady()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                    >
                      <Rocket size={14} /> Production ready
                    </button>
                  )}
                  {project.status !== 'completed' && (
                    <button
                      type="button"
                      disabled={actionBusy}
                      onClick={() => void handleComplete()}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-600 disabled:opacity-50"
                    >
                      <CheckCircle size={14} /> Complete job
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-1 border-b border-border/60 pb-px">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3.5 py-2 text-sm font-medium rounded-t-lg transition ${
                  tab === t.id
                    ? 'text-brand border-b-2 border-brand bg-brand/5'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {t.label}
                {t.count != null ? <span className="ml-1.5 text-[10px] opacity-70">{t.count}</span> : null}
              </button>
            ))}
          </div>

          {loading ? (
            <p className="text-muted-foreground italic py-8">Loading…</p>
          ) : !project ? (
            <div className="glass-panel rounded-2xl border border-border/50 p-12 text-center text-muted-foreground">
              <FolderKanban className="mx-auto mb-3 opacity-40" size={32} />
              <p className="font-medium text-foreground">Project not found</p>
            </div>
          ) : (
            <>
              {tab === 'overview' && (
                <div className="grid gap-5 md:grid-cols-2">
                  <section className="glass-panel rounded-2xl border border-border/50 p-5 space-y-2">
                    <h3 className="font-semibold">Scope</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.scope || 'No scope defined yet.'}</p>
                  </section>
                  <section className="glass-panel rounded-2xl border border-border/50 p-5 space-y-2">
                    <h3 className="font-semibold">Objectives</h3>
                    <p className="text-sm text-muted-foreground whitespace-pre-wrap">{project.objectives || 'No objectives defined yet.'}</p>
                  </section>
                  <section className="md:col-span-2 glass-panel rounded-2xl border border-border/50 p-5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-semibold flex items-center gap-2"><Package size={16} /> Deliverables</h3>
                      <button type="button" onClick={() => { setForm({ status: 'pending' }); setModal('deliverable'); }} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-600">
                        <Plus size={14} /> Add Deliverable
                      </button>
                    </div>
                    {deliverables.length === 0 ? (
                      <div className="text-center py-6 text-muted-foreground">
                        <p className="text-sm italic">No deliverables yet.</p>
                        <button
                          type="button"
                          onClick={() => { setForm({ status: 'pending' }); setModal('deliverable'); }}
                          className="mt-3 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600"
                        >
                          <Plus size={16} /> Add Deliverable
                        </button>
                      </div>
                    ) : (
                      <ul className="divide-y divide-border/50">
                        {deliverables.map((d) => (
                          <li key={d.id} className="py-2.5 flex flex-wrap items-center justify-between gap-2 text-sm">
                            <div>
                              <div className="font-medium">{d.title}</div>
                              <div className="text-xs text-muted-foreground">Due {formatDate(d.dueDate)}</div>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(d.status)}`}>
                                {String(d.status || '').replace(/_/g, ' ')}
                              </span>
                              {d.status !== 'done' && (
                                <button
                                  type="button"
                                  className="text-xs text-emerald-600 hover:underline"
                                  onClick={async () => {
                                    try {
                                      await updatePmDeliverable(id, d.id, { status: 'done' });
                                      toast.success('Deliverable done');
                                      void load();
                                    } catch (err) {
                                      toast.error(pmApiError(err));
                                    }
                                  }}
                                >
                                  Mark done
                                </button>
                              )}
                            </div>
                          </li>
                        ))}
                      </ul>
                    )}
                  </section>
                </div>
              )}

              {tab === 'plan' && (
                <div className="space-y-4">
                  <div className="flex justify-between items-center">
                    <h3 className="font-semibold">Work stages</h3>
                    <button type="button" onClick={() => { setForm({}); setModal('stage'); }} className="text-sm text-brand inline-flex items-center gap-1 hover:underline">
                      <Plus size={14} /> Stage
                    </button>
                  </div>
                  {stages.length === 0 ? (
                    <p className="text-sm text-muted-foreground italic glass-panel rounded-2xl border border-border/50 p-8 text-center">
                      No stages yet — add org or project stages to drive work-order flow.
                    </p>
                  ) : (
                    <div className="flex flex-wrap gap-2">
                      {[...stages].sort((a, b) => (a.position || 0) - (b.position || 0)).map((s, i) => (
                        <div key={s.id} className="glass-panel rounded-xl border border-border/50 px-4 py-3 min-w-[140px]">
                          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Step {i + 1}</div>
                          <div className="font-medium text-sm mt-0.5">{s.name}</div>
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="glass-panel rounded-2xl border border-border/50 p-5 space-y-3">
                    <h3 className="font-semibold">Timeline</h3>
                    <div className="text-sm text-muted-foreground">
                      {formatDate(project.startDate)} → {formatDate(project.endDate)}
                    </div>
                    <div className="space-y-2">
                      {[...milestones]
                        .sort((a, b) => String(a.dueDate || '').localeCompare(String(b.dueDate || '')))
                        .map((m) => (
                          <div key={m.id} className="flex items-center gap-3 text-sm">
                            <Flag size={14} className="text-brand shrink-0" />
                            <span className="font-medium flex-1">{m.title}</span>
                            <span className="text-xs text-muted-foreground">{formatDate(m.dueDate)}</span>
                            <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(m.status)}`}>
                              {m.status}
                            </span>
                          </div>
                        ))}
                      {milestones.length === 0 && (
                        <p className="text-sm text-muted-foreground italic">Milestones will appear on the timeline when added.</p>
                      )}
                    </div>
                  </div>
                </div>
              )}

              {tab === 'tasks' && (
                <EntityList
                  title="Tasks"
                  addLabel="Add Task"
                  empty="No tasks on this project yet."
                  onAdd={() => { setForm({ status: 'todo', priority: 'medium' }); setModal('task'); }}
                  rows={tasks.map((t) => ({
                    id: t.id,
                    primary: t.title,
                    secondary: `${userLabel(t.assignee)} · due ${formatDate(t.dueDate)}`,
                    badge: t.status,
                    action: t.status !== 'done' ? (
                      <button
                        type="button"
                        className="text-xs text-emerald-600 hover:underline"
                        onClick={async () => {
                          try {
                            await completePmTask(t.id);
                            toast.success('Task completed');
                            void load();
                          } catch (err) {
                            toast.error(pmApiError(err));
                          }
                        }}
                      >
                        Complete
                      </button>
                    ) : null,
                  }))}
                />
              )}

              {tab === 'work_orders' && (
                <EntityList
                  title="Work orders"
                  addLabel="Add Work Order"
                  empty="No work orders yet."
                  onAdd={() => { setForm({ status: 'draft' }); setModal('wo'); }}
                  rows={workOrders.map((w) => ({
                    id: w.id,
                    primary: w.title,
                    secondary: `${w.stage?.name || 'No stage'} · ${userLabel(w.assignee)} · ${formatDateTime(w.scheduledStart)}–${formatDateTime(w.scheduledEnd)}`,
                    badge: w.status,
                  }))}
                />
              )}

              {tab === 'milestones' && (
                <EntityList
                  title="Milestones"
                  addLabel="Add Milestone"
                  empty="No milestones yet."
                  onAdd={() => { setForm({ status: 'pending' }); setModal('milestone'); }}
                  rows={milestones.map((m) => ({
                    id: m.id,
                    primary: m.title,
                    secondary: `Due ${formatDate(m.dueDate)}`,
                    badge: m.status,
                    action: m.status === 'pending' ? (
                      <button
                        type="button"
                        className="text-xs text-emerald-600 hover:underline"
                        onClick={async () => {
                          try {
                            await updatePmMilestone(m.id, { status: 'achieved', completedAt: new Date().toISOString() });
                            toast.success('Milestone achieved');
                            void load();
                          } catch (err) {
                            toast.error(pmApiError(err));
                          }
                        }}
                      >
                        Achieve
                      </button>
                    ) : null,
                  }))}
                />
              )}

              {tab === 'schedule' && (
                <EntityList
                  title="Schedule blocks"
                  addLabel="Add Schedule Block"
                  empty="No staff schedule blocks for this project."
                  onAdd={() => { setForm({}); setModal('schedule'); }}
                  rows={schedule.map((b) => ({
                    id: b.id,
                    primary: userLabel(b.user),
                    secondary: `${formatDateTime(b.startAt)} → ${formatDateTime(b.endAt)}${b.notes ? ` · ${b.notes}` : ''}`,
                    badge: b.task?.title || 'Block',
                  }))}
                />
              )}

              {tab === 'members' && (
                <EntityList
                  title="Members"
                  addLabel="Add Member"
                  empty="No members assigned yet."
                  onAdd={() => { setForm({ role: 'member' }); setModal('member'); }}
                  rows={members.map((m) => ({
                    id: m.id || m.userId,
                    primary: userLabel(m.user),
                    secondary: m.role,
                    badge: m.role,
                    action: (
                      <button
                        type="button"
                        className="text-xs text-rose-600 hover:underline"
                        onClick={async () => {
                          try {
                            await removePmProjectMember(id, m.id);
                            toast.success('Member removed');
                            void load();
                          } catch (err) {
                            toast.error(pmApiError(err));
                          }
                        }}
                      >
                        Remove
                      </button>
                    ),
                  }))}
                />
              )}

              {tab === 'progress' && (
                <div className="grid gap-4 md:grid-cols-3">
                  <StatMini label="Overall progress" value={`${pct.toFixed(0)}%`} />
                  <StatMini label="Tasks done" value={`${progress?.tasksDone ?? tasks.filter((t) => t.status === 'done').length} / ${progress?.tasksTotal ?? tasks.length}`} />
                  <StatMini label="Milestones achieved" value={`${progress?.milestonesAchieved ?? milestones.filter((m) => m.status === 'achieved').length} / ${progress?.milestonesTotal ?? milestones.length}`} />
                  <StatMini label="Production ready" value={project.productionReady ? 'Yes' : 'No'} />
                  <StatMini label="Completed at" value={project.completedAt ? formatDateTime(project.completedAt) : '—'} />
                  <StatMini label="Work orders done" value={`${workOrders.filter((w) => w.status === 'done').length} / ${workOrders.length}`} />
                </div>
              )}
            </>
          )}
        </main>
      </div>

      <PmModal open={editOpen} onClose={() => setEditOpen(false)} title="Edit project overview" icon={FolderKanban} wide>
        <form onSubmit={saveOverview} className="space-y-4">
          <PmField label="Status">
            <select className={pmInputClass} value={editForm.status} onChange={(e) => setEditForm({ ...editForm, status: e.target.value })}>
              {PROJECT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </PmField>
          <PmField label="Scope">
            <textarea className={pmTextareaClass} value={editForm.scope} onChange={(e) => setEditForm({ ...editForm, scope: e.target.value })} />
          </PmField>
          <PmField label="Objectives">
            <textarea className={pmTextareaClass} value={editForm.objectives} onChange={(e) => setEditForm({ ...editForm, objectives: e.target.value })} />
          </PmField>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Start"><input type="date" className={pmInputClass} value={editForm.startDate} onChange={(e) => setEditForm({ ...editForm, startDate: e.target.value })} /></PmField>
            <PmField label="End"><input type="date" className={pmInputClass} value={editForm.endDate} onChange={(e) => setEditForm({ ...editForm, endDate: e.target.value })} /></PmField>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <PmField label="Budget"><input type="number" className={pmInputClass} value={editForm.budget} onChange={(e) => setEditForm({ ...editForm, budget: e.target.value })} /></PmField>
            <PmField label="Currency"><input className={pmInputClass} value={editForm.currency} onChange={(e) => setEditForm({ ...editForm, currency: e.target.value })} maxLength={3} /></PmField>
          </div>
          <PmModalActions onCancel={() => setEditOpen(false)} submitLabel="Save" submitting={saving} />
        </form>
      </PmModal>

      <PmModal open={!!modal} onClose={() => setModal(null)} title={modalTitle(modal)} icon={Plus}>
        <form onSubmit={submitModal} className="space-y-4">
          {(modal === 'deliverable' || modal === 'task' || modal === 'wo' || modal === 'milestone') && (
            <PmField label="Title">
              <input required className={pmInputClass} value={form.title || ''} onChange={(e) => setForm({ ...form, title: e.target.value })} />
            </PmField>
          )}
          {(modal === 'deliverable' || modal === 'task' || modal === 'wo' || modal === 'milestone') && (
            <PmField label="Description">
              <textarea className={pmTextareaClass} value={form.description || ''} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </PmField>
          )}
          {modal === 'deliverable' && (
            <>
              <PmField label="Status">
                <select className={pmInputClass} value={form.status || 'pending'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {DELIVERABLE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </PmField>
              <PmField label="Due date"><input type="date" className={pmInputClass} value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></PmField>
            </>
          )}
          {modal === 'task' && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <PmField label="Status">
                  <select className={pmInputClass} value={form.status || 'todo'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                    {TASK_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </PmField>
                <PmField label="Priority">
                  <select className={pmInputClass} value={form.priority || 'medium'} onChange={(e) => setForm({ ...form, priority: e.target.value })}>
                    {TASK_PRIORITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                  </select>
                </PmField>
              </div>
              <PmField label="Assignee">
                <select className={pmInputClass} value={form.assigneeUserId || ''} onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
                </select>
              </PmField>
              <PmField label="Due date"><input type="date" className={pmInputClass} value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></PmField>
              <PmField label="Depends on task" hint="Optional dependency">
                <select className={pmInputClass} value={form.dependsOnTaskId || ''} onChange={(e) => setForm({ ...form, dependsOnTaskId: e.target.value })}>
                  <option value="">None</option>
                  {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </PmField>
              <PmField label="Work order">
                <select className={pmInputClass} value={form.workOrderId || ''} onChange={(e) => setForm({ ...form, workOrderId: e.target.value })}>
                  <option value="">None</option>
                  {workOrders.map((w) => <option key={w.id} value={w.id}>{w.title}</option>)}
                </select>
              </PmField>
            </>
          )}
          {modal === 'wo' && (
            <>
              <PmField label="Status">
                <select className={pmInputClass} value={form.status || 'draft'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {WORK_ORDER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </PmField>
              <PmField label="Stage">
                <select className={pmInputClass} value={form.stageId || ''} onChange={(e) => setForm({ ...form, stageId: e.target.value })}>
                  <option value="">No stage</option>
                  {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
                </select>
              </PmField>
              <PmField label="Assignee">
                <select className={pmInputClass} value={form.assigneeUserId || ''} onChange={(e) => setForm({ ...form, assigneeUserId: e.target.value })}>
                  <option value="">Unassigned</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
                </select>
              </PmField>
              <div className="grid grid-cols-2 gap-3">
                <PmField label="Scheduled start"><input type="datetime-local" className={pmInputClass} value={form.scheduledStart || ''} onChange={(e) => setForm({ ...form, scheduledStart: e.target.value })} /></PmField>
                <PmField label="Scheduled end"><input type="datetime-local" className={pmInputClass} value={form.scheduledEnd || ''} onChange={(e) => setForm({ ...form, scheduledEnd: e.target.value })} /></PmField>
              </div>
            </>
          )}
          {modal === 'milestone' && (
            <>
              <PmField label="Status">
                <select className={pmInputClass} value={form.status || 'pending'} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                  {MILESTONE_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </PmField>
              <PmField label="Due date"><input type="date" className={pmInputClass} value={form.dueDate || ''} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} /></PmField>
            </>
          )}
          {modal === 'schedule' && (
            <>
              <PmField label="Staff">
                <select required className={pmInputClass} value={form.userId || ''} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                  <option value="">Select user</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
                </select>
              </PmField>
              <PmField label="Task (optional)">
                <select className={pmInputClass} value={form.taskId || ''} onChange={(e) => setForm({ ...form, taskId: e.target.value })}>
                  <option value="">None</option>
                  {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
                </select>
              </PmField>
              <div className="grid grid-cols-2 gap-3">
                <PmField label="Start"><input required type="datetime-local" className={pmInputClass} value={form.startAt || ''} onChange={(e) => setForm({ ...form, startAt: e.target.value })} /></PmField>
                <PmField label="End"><input required type="datetime-local" className={pmInputClass} value={form.endAt || ''} onChange={(e) => setForm({ ...form, endAt: e.target.value })} /></PmField>
              </div>
              <PmField label="Notes"><textarea className={pmTextareaClass} value={form.notes || ''} onChange={(e) => setForm({ ...form, notes: e.target.value })} /></PmField>
            </>
          )}
          {modal === 'member' && (
            <>
              <PmField label="User">
                <select required className={pmInputClass} value={form.userId || ''} onChange={(e) => setForm({ ...form, userId: e.target.value })}>
                  <option value="">Select user</option>
                  {users.map((u) => <option key={u.id} value={u.id}>{userLabel(u)}</option>)}
                </select>
              </PmField>
              <PmField label="Role">
                <select className={pmInputClass} value={form.role || 'member'} onChange={(e) => setForm({ ...form, role: e.target.value })}>
                  {MEMBER_ROLES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </PmField>
            </>
          )}
          {modal === 'stage' && (
            <>
              <PmField label="Name"><input required className={pmInputClass} value={form.name || ''} onChange={(e) => setForm({ ...form, name: e.target.value })} /></PmField>
              <PmField label="Position"><input type="number" className={pmInputClass} value={form.position || ''} onChange={(e) => setForm({ ...form, position: e.target.value })} /></PmField>
            </>
          )}
          <PmModalActions onCancel={() => setModal(null)} submitLabel={modal === 'member' || modal === 'schedule' || modal === 'deliverable' || modal === 'stage' ? 'Add' : 'Create'} submitting={saving} />
        </form>
      </PmModal>
    </div>
  );
}

function modalTitle(modal: string | null) {
  switch (modal) {
    case 'deliverable': return 'Add Deliverable';
    case 'task': return 'Add Task';
    case 'wo': return 'Add Work Order';
    case 'milestone': return 'Add Milestone';
    case 'schedule': return 'Add Schedule Block';
    case 'member': return 'Add Member';
    case 'stage': return 'Add Stage';
    default: return '';
  }
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-panel rounded-2xl border border-border/50 p-4">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-xl font-bold mt-1 tracking-tight">{value}</div>
    </div>
  );
}

function EntityList({
  title,
  addLabel = 'Add',
  empty,
  onAdd,
  rows,
}: {
  title: string;
  addLabel?: string;
  empty: string;
  onAdd: () => void;
  rows: { id: string; primary: string; secondary: string; badge?: string; action?: React.ReactNode }[];
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold flex items-center gap-2">
          {title === 'Members' ? <Users size={16} /> : null}
          {title}
        </h3>
        <button type="button" onClick={onAdd} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-sm font-medium bg-brand text-white hover:bg-brand-600">
          <Plus size={14} /> {addLabel}
        </button>
      </div>
      {rows.length === 0 ? (
        <div className="glass-panel rounded-2xl border border-border/50 p-10 text-center text-muted-foreground">
          <p className="text-sm italic">{empty}</p>
          <button
            type="button"
            onClick={onAdd}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-brand text-white text-sm font-medium hover:bg-brand-600"
          >
            <Plus size={16} /> {addLabel}
          </button>
        </div>
      ) : (
        <ul className="glass-panel rounded-2xl border border-border/50 divide-y divide-border/50 overflow-hidden">
          {rows.map((r) => (
            <li key={r.id} className="px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm">
              <div className="min-w-0">
                <div className="font-medium">{r.primary}</div>
                <div className="text-xs text-muted-foreground truncate">{r.secondary}</div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {r.badge ? (
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase border ${statusBadgeClass(r.badge)}`}>
                    {String(r.badge).replace(/_/g, ' ')}
                  </span>
                ) : null}
                {r.action}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
