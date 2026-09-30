import { Request, Response } from 'express';
import { z } from 'zod';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';
import {
  createConnector,
  deleteConnector,
  getConnector,
  listConnectors,
  serializeConnector,
  testConnector,
  testRawCredentials,
  updateConnector
} from '@services/marketing/emailConnector.service.js';

const providerEnum = z.enum(['sendgrid', 'gmail_smtp', 'brevo', 'ses', 'mailchimp']);

const credentialsSchema = z.record(z.unknown());

const createSchema = z.object({
  organizationId: z.string().optional(),
  provider: providerEnum,
  name: z.string().min(1).max(150),
  credentials: credentialsSchema,
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'error']).optional()
});

const updateSchema = z.object({
  name: z.string().min(1).max(150).optional(),
  credentials: credentialsSchema.optional(),
  isDefault: z.boolean().optional(),
  status: z.enum(['active', 'inactive', 'error']).optional()
});

export class EmailConnectorsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const items = await listConnectors(orgId);
      res.json({ data: items.map(serializeConnector) });
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
      const item = await getConnector(req.params.id, orgId);
      if (!item) {
        res.status(404).json({ error: { message: 'Connector not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      res.json({ data: serializeConnector(item) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const data = createSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const saved = await createConnector({
        organizationId: orgId,
        provider: data.provider,
        name: data.name,
        credentials: data.credentials,
        isDefault: data.isDefault,
        status: data.status,
        createdById: userIdFromReq(req) ?? null
      });
      res.status(201).json({ data: serializeConnector(saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const data = updateSchema.parse(req.body);
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const item = await getConnector(req.params.id, orgId);
      if (!item) {
        res.status(404).json({ error: { message: 'Connector not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const saved = await updateConnector(item, data);
      res.json({ data: serializeConnector(saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const item = await getConnector(req.params.id, orgId);
      if (!item) {
        res.status(404).json({ error: { message: 'Connector not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      await deleteConnector(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /** POST /email-connectors/:id/test */
  static async test(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const item = await getConnector(req.params.id, orgId);
      if (!item) {
        res.status(404).json({ error: { message: 'Connector not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const result = await testConnector(item);
      res.json({
        data: {
          ok: result.ok,
          message: result.message,
          connector: serializeConnector(item)
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /** POST /email-connectors/test — probe credentials without saving */
  static async testDraft(req: Request, res: Response): Promise<void> {
    try {
      const schema = z.object({
        provider: providerEnum,
        credentials: credentialsSchema
      });
      const data = schema.parse(req.body);
      const result = await testRawCredentials(data.provider, data.credentials);
      res.json({ data: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        res.status(400).json({ error: { message: 'Invalid payload', details: error.issues } });
        return;
      }
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
