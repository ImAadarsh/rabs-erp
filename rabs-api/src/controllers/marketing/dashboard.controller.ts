import { Request, Response } from 'express';
import { getMarketingDashboard } from '@services/marketing/dashboard.service.js';
import { orgIdFromReq } from '@services/marketing/marketingScope.js';

export class MarketingDashboardController {
  static async get(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const data = await getMarketingDashboard(orgId);
      res.json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
