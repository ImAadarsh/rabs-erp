import { Request, Response } from 'express';
import { upsertInboundLead } from '@services/crm/leadIngest.service.js';

export class LeadIngestController {
  /**
   * POST /api/integrations/leads
   * Auth: X-Rabs-Api-Key or Authorization: Bearer <integration_key>
   */
  static async ingest(req: Request, res: Response): Promise<void> {
    try {
      const integration = (req as any).integration as {
        organizationId: string;
        source: string;
      };
      if (!integration?.organizationId) {
        res.status(401).json({ error: { message: 'Unauthorized' } });
        return;
      }

      const body = req.body;
      if (!body || typeof body !== 'object' || Array.isArray(body)) {
        res.status(400).json({ error: { message: 'JSON object body required' } });
        return;
      }

      // Support Salesforce-style batch { records: [...] } or single lead
      const records = Array.isArray(body.records) ? body.records : [body];
      if (!records.length) {
        res.status(400).json({ error: { message: 'No lead records provided' } });
        return;
      }
      if (records.length > 100) {
        res.status(400).json({ error: { message: 'Max 100 leads per request' } });
        return;
      }

      const results = [];
      for (const record of records) {
        const { lead, created, marketingSync } = await upsertInboundLead({
          organizationId: integration.organizationId,
          body: record,
          defaultSource: integration.source || 'generic',
          syncToMarketing: true
        });
        results.push({
          id: lead.id,
          created,
          externalId: lead.externalId,
          email: lead.email,
          name: lead.name,
          status: lead.status,
          source: lead.source,
          marketingSync
        });
      }

      const status = results.length === 1 && results[0].created ? 201 : 200;
      res.status(status).json({
        data: results.length === 1 ? results[0] : results,
        meta: { count: results.length, organizationId: integration.organizationId }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message || 'Ingest failed' } });
    }
  }
}
