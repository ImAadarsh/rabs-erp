import { AppDataSource } from '@config/data-source.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { PmTask } from '@entities/pm/PmTask.js';
import { PmMilestone } from '@entities/pm/PmMilestone.js';
import { PmDeliverable } from '@entities/pm/PmDeliverable.js';
import { PmWorkOrder } from '@entities/pm/PmWorkOrder.js';

export type ProjectProgress = {
  progressPct: number;
  taskProgressPct: number;
  milestoneProgressPct: number;
  deliverableProgressPct: number;
  tasksTotal: number;
  tasksDone: number;
  milestonesTotal: number;
  milestonesAchieved: number;
  deliverablesTotal: number;
  deliverablesDone: number;
  workOrdersTotal: number;
  workOrdersDone: number;
};

function avg(nums: number[]): number {
  if (!nums.length) return 0;
  return Math.round((nums.reduce((a, b) => a + b, 0) / nums.length) * 100) / 100;
}

/** Compute progress from tasks (70%) + milestones (20%) + deliverables (10%); persist on project. */
export async function computeAndPersistProgress(projectId: string): Promise<ProjectProgress> {
  const taskRepo = AppDataSource.getRepository(PmTask);
  const milestoneRepo = AppDataSource.getRepository(PmMilestone);
  const deliverableRepo = AppDataSource.getRepository(PmDeliverable);
  const woRepo = AppDataSource.getRepository(PmWorkOrder);
  const projectRepo = AppDataSource.getRepository(PmProject);

  const tasks = await taskRepo.find({ where: { projectId } });
  const activeTasks = tasks.filter((t) => t.status !== 'cancelled');
  const taskPcts = activeTasks.map((t) => {
    if (t.status === 'done') return 100;
    return Number(t.progressPct) || 0;
  });
  const taskProgressPct = avg(taskPcts);
  const tasksDone = activeTasks.filter((t) => t.status === 'done').length;

  const milestones = await milestoneRepo.find({ where: { projectId } });
  const activeMs = milestones.filter((m) => m.status !== 'cancelled');
  const milestonesAchieved = activeMs.filter((m) => m.status === 'achieved').length;
  const milestoneProgressPct = activeMs.length
    ? Math.round((milestonesAchieved / activeMs.length) * 10000) / 100
    : 0;

  const deliverables = await deliverableRepo.find({ where: { projectId } });
  const activeDel = deliverables.filter((d) => d.status !== 'cancelled');
  const deliverablesDone = activeDel.filter((d) => d.status === 'done').length;
  const deliverableProgressPct = activeDel.length
    ? Math.round((deliverablesDone / activeDel.length) * 10000) / 100
    : 0;

  const workOrders = await woRepo.find({ where: { projectId } });
  const activeWo = workOrders.filter((w) => w.status !== 'cancelled');
  const workOrdersDone = activeWo.filter((w) => w.status === 'done').length;

  let progressPct: number;
  const hasTasks = activeTasks.length > 0;
  const hasMs = activeMs.length > 0;
  const hasDel = activeDel.length > 0;
  if (!hasTasks && !hasMs && !hasDel) {
    progressPct = 0;
  } else if (hasTasks && hasMs && hasDel) {
    progressPct =
      Math.round((taskProgressPct * 0.7 + milestoneProgressPct * 0.2 + deliverableProgressPct * 0.1) * 100) /
      100;
  } else if (hasTasks && hasMs) {
    progressPct = Math.round((taskProgressPct * 0.8 + milestoneProgressPct * 0.2) * 100) / 100;
  } else if (hasTasks) {
    progressPct = taskProgressPct;
  } else if (hasMs) {
    progressPct = milestoneProgressPct;
  } else {
    progressPct = deliverableProgressPct;
  }

  await projectRepo.update({ id: projectId }, { progressPct });

  return {
    progressPct,
    taskProgressPct,
    milestoneProgressPct,
    deliverableProgressPct,
    tasksTotal: activeTasks.length,
    tasksDone,
    milestonesTotal: activeMs.length,
    milestonesAchieved,
    deliverablesTotal: activeDel.length,
    deliverablesDone,
    workOrdersTotal: activeWo.length,
    workOrdersDone
  };
}
