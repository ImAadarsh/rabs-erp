import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Ticket } from '@entities/crm/Ticket.js';
import { CrmDeal } from '@entities/crm/CrmDeal.js';
import { CrmActivity } from '@entities/crm/CrmActivity.js';
import { orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';

const OPEN_TICKET_STATUSES = ['new', 'open', 'pending_customer', 'pending_internal'] as const;

export class CrmDashboardController {
  static async get(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const userId = userIdFromReq(req);

      const openTickets = await AppDataSource.getRepository(Ticket)
        .createQueryBuilder('t')
        .where('t.organization_id = :orgId', { orgId })
        .andWhere('t.status IN (:...statuses)', { statuses: [...OPEN_TICKET_STATUSES] })
        .getCount();

      const dealRepo = AppDataSource.getRepository(CrmDeal);
      let myOpenDeals = 0;
      if (userId) {
        myOpenDeals = await dealRepo.count({
          where: { organizationId: orgId, status: 'open', ownerUserId: userId }
        });
      }
      const openDealsTotal = await dealRepo.count({
        where: { organizationId: orgId, status: 'open' }
      });

      const overdueActivities = await AppDataSource.getRepository(CrmActivity)
        .createQueryBuilder('a')
        .where('a.organization_id = :orgId', { orgId })
        .andWhere('a.completed_at IS NULL')
        .andWhere('a.due_at IS NOT NULL')
        .andWhere('a.due_at < NOW()')
        .getCount();

      const leadRows: Array<{ status: string; cnt: string }> = await AppDataSource.query(
        `SELECT status, COUNT(*) AS cnt FROM crm_leads WHERE organization_id = ? GROUP BY status`,
        [orgId]
      );
      const leadsByStatus: Record<string, number> = {
        new: 0,
        contacted: 0,
        qualified: 0,
        unqualified: 0,
        converted: 0,
        lost: 0
      };
      for (const row of leadRows) {
        leadsByStatus[row.status] = Number(row.cnt);
      }

      res.json({
        data: {
          openTickets,
          myOpenDeals,
          openDealsTotal,
          overdueActivities,
          leadsByStatus,
          asOf: new Date().toISOString()
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
