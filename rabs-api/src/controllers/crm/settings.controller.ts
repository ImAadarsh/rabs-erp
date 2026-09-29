import { Request, Response } from 'express';
import { z } from 'zod';
import { getOrCreateCrmSettings } from '@services/crm/crmSettings.service.js';
import {
  listAssignableUsers as fetchAssignableUsers,
  listSalesRepUserIds
} from '@services/crm/leadAssignment.service.js';
import { orgIdFromReq } from '@services/crm/crmScope.js';
import { AppDataSource } from '@config/data-source.js';
import { CrmSettings } from '@entities/crm/CrmSettings.js';
import { User } from '@entities/iam/User.js';

const patchSchema = z.object({
  autoAssignLeads: z.boolean().optional(),
  autoFollowupOnLead: z.boolean().optional()
});

export class CrmSettingsController {
  /** GET /api/crm/assignable-users — staff for lead/account owner dropdowns */
  static async listAssignableUsers(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const users = await fetchAssignableUsers(orgId);
      res.json({ data: users, meta: { total: users.length } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const settings = await getOrCreateCrmSettings(orgId);
      const salesRepIds = await listSalesRepUserIds(orgId);
      const assignableUsers = await fetchAssignableUsers(orgId);
      let salesReps: User[] = [];
      if (salesRepIds.length) {
        salesReps = await AppDataSource.getRepository(User)
          .createQueryBuilder('u')
          .where('u.id IN (:...ids)', { ids: salesRepIds })
          .getMany();
      }
      res.json({
        data: {
          ...settings,
          salesRepCount: salesRepIds.length,
          salesReps: salesReps.map((u) => ({
            id: u.id,
            email: u.email,
            firstName: u.firstName,
            lastName: u.lastName,
            role: 'SALES_REP'
          })),
          assignableUsers
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const data = patchSchema.parse(req.body);
      const settings = await getOrCreateCrmSettings(orgId);
      if (data.autoAssignLeads !== undefined) settings.autoAssignLeads = data.autoAssignLeads;
      if (data.autoFollowupOnLead !== undefined) settings.autoFollowupOnLead = data.autoFollowupOnLead;
      const saved = await AppDataSource.getRepository(CrmSettings).save(settings);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
