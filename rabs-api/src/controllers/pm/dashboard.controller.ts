import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PmProject } from '@entities/pm/PmProject.js';
import { PmTask } from '@entities/pm/PmTask.js';
import { PmMilestone } from '@entities/pm/PmMilestone.js';
import { PmWorkOrder } from '@entities/pm/PmWorkOrder.js';
import { orgIdFromReq, userIdFromReq } from '@services/pm/pmScope.js';

export class PmDashboardController {
  static async get(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const userId = userIdFromReq(req);

      const projectRepo = AppDataSource.getRepository(PmProject);
      const statusRows: Array<{ status: string; cnt: string }> = await AppDataSource.query(
        `SELECT status, COUNT(*) AS cnt FROM pm_projects WHERE organization_id = ? GROUP BY status`,
        [orgId]
      );
      const projectsByStatus: Record<string, number> = {
        draft: 0,
        active: 0,
        on_hold: 0,
        completed: 0,
        cancelled: 0
      };
      for (const row of statusRows) {
        projectsByStatus[row.status] = Number(row.cnt);
      }

      const activeProjects = projectsByStatus.active;
      const productionReady = await projectRepo.count({
        where: { organizationId: orgId, productionReady: true }
      });

      let myOpenTasks = 0;
      if (userId) {
        myOpenTasks = await AppDataSource.getRepository(PmTask)
          .createQueryBuilder('t')
          .where('t.organization_id = :orgId', { orgId })
          .andWhere('t.assignee_user_id = :userId', { userId })
          .andWhere("t.status NOT IN ('done', 'cancelled')")
          .getCount();
      }

      const overdueTasks = await AppDataSource.getRepository(PmTask)
        .createQueryBuilder('t')
        .where('t.organization_id = :orgId', { orgId })
        .andWhere('t.due_date IS NOT NULL')
        .andWhere('t.due_date < CURDATE()')
        .andWhere("t.status NOT IN ('done', 'cancelled')")
        .getCount();

      const upcomingMilestones = await AppDataSource.getRepository(PmMilestone)
        .createQueryBuilder('m')
        .innerJoin('m.project', 'p')
        .where('p.organization_id = :orgId', { orgId })
        .andWhere("m.status = 'pending'")
        .andWhere('m.due_date IS NOT NULL')
        .andWhere('m.due_date >= CURDATE()')
        .andWhere('m.due_date <= DATE_ADD(CURDATE(), INTERVAL 14 DAY)')
        .orderBy('m.dueDate', 'ASC')
        .take(10)
        .getMany();

      const openWorkOrders = await AppDataSource.getRepository(PmWorkOrder)
        .createQueryBuilder('w')
        .where('w.organization_id = :orgId', { orgId })
        .andWhere("w.status NOT IN ('done', 'cancelled')")
        .getCount();

      res.json({
        data: {
          projectsByStatus,
          activeProjects,
          productionReadyCount: productionReady,
          myOpenTasks,
          overdueTasks,
          openWorkOrders,
          upcomingMilestones,
          asOf: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
