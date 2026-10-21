import { Request, Response } from 'express';
import { upsertInboundLead } from '@services/crm/leadIngest.service.js';

const SF_ACK =
  '<?xml version="1.0" encoding="UTF-8"?>' +
  '<soapenv:Envelope xmlns:soapenv="http://schemas.xmlsoap.org/soap/envelope/"><soapenv:Body>' +
  '<notificationsResponse xmlns="http://soap.sforce.com/2005/09/outbound"><Ack>true</Ack></notificationsResponse>' +
  '</soapenv:Body></soapenv:Envelope>';

function decodeXml(s: string): string {
  return s
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/** Extract sObject field maps from a Salesforce Outbound Message SOAP envelope. */
function parseSalesforceOutboundMessage(xml: string): Record<string, string>[] {
  const records: Record<string, string>[] = [];
  const sobjRe = /<(?:\w+:)?sObject\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sObject>/g;
  let m: RegExpExecArray | null;
  while ((m = sobjRe.exec(xml))) {
    const rec: Record<string, string> = {};
    const fieldRe = /<(?:\w+:)?(\w+)(?:\s[^>]*)?>([^<]*)<\/(?:\w+:)?\1>/g;
    let f: RegExpExecArray | null;
    while ((f = fieldRe.exec(m[1]))) {
      rec[f[1]] = decodeXml(f[2]);
    }
    if (Object.keys(rec).length) records.push(rec);
  }
  return records;
}

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
      const isSoap = typeof body === 'string';
      let records: any[];
      if (isSoap) {
        records = parseSalesforceOutboundMessage(body);
        if (!records.length) {
          res.status(400).json({ error: { message: 'No sObject records found in XML body' } });
          return;
        }
      } else {
        if (!body || typeof body !== 'object' || Array.isArray(body) || !Object.keys(body).length) {
          res.status(400).json({
            error: { message: 'JSON object body required (send Content-Type: application/json)' }
          });
          return;
        }
        // Support Salesforce-style batch { records: [...] } or single lead
        records = Array.isArray(body.records) ? body.records : [body];
      }
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

      if (isSoap) {
        res.status(200).type('text/xml').send(SF_ACK);
        return;
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
