import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { MarketingEmailCampaign } from '@entities/marketing/MarketingEmailCampaign.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/crm/crmScope.js';
import {
  getSendStats,
  listSendsForCampaign,
  sendEmailCampaign,
  serializeEmailCampaign,
  serializeEmailSend
} from '@services/marketing/emailCampaign.service.js';
import { isSmtpConfigured } from '@services/marketing/smtpMail.service.js';
import { env } from '@config/env.js';

const audienceEnum = z.enum(['crm_leads', 'segment', 'manual']);

const createSchema = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).max(255),
  subject: z.string().min(1).max(500),
  htmlBody: z.string().min(1),
  builderJson: z.string().optional().nullable(),
  fromName: z.string().max(255).optional().nullable(),
  replyTo: z.string().email().max(255).optional().nullable().or(z.literal('')),
  connectorId: z.string().optional().nullable(),
  status: z.enum(['draft', 'scheduled', 'sending', 'sent', 'failed']).optional(),
  segmentId: z.string().optional().nullable(),
  source: audienceEnum.optional(),
  audienceType: audienceEnum.optional(),
  scheduledAt: z.string().datetime().optional().nullable()
});

const updateSchema = createSchema.partial();

export class EmailCampaignsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) {
        res.status(400).json({ error: { message: 'organizationId required' } });
        return;
      }
      const { status, page = '1', limit = '50' } = req.query;
      const take = Math.min(Number(limit) || 50, 200);
      const skip = (Math.max(Number(page) || 1, 1) - 1) * take;

      const qb = AppDataSource.getRepository(MarketingEmailCampaign)
        .createQueryBuilder('c')
        .where('c.organization_id = :orgId', { orgId })
        .orderBy('c.createdAt', 'DESC')
        .take(take)
        .skip(skip);
      if (status) qb.andWhere('c.status = :status', { status });

      const [items, total] = await qb.getManyAndCount();
      const stats = await getSendStats(items.map((i) => i.id));
      res.json({
        data: items.map((c) => ({
          ...serializeEmailCampaign(c),
          stats: stats.get(String(c.id)) || { sent: 0, failed: 0, queued: 0 }
        })),
        meta: {
          total,
          page: Number(page) || 1,
          limit: take,
          smtpConfigured: isSmtpConfigured(),
          sendgridConfigured: Boolean(env.SENDGRID_API_KEY)
        }
      });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(MarketingEmailCampaign).findOne({
        where: { id: req.params.id }
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Campaign not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const stats = await getSendStats([item.id]);
      res.json({
        data: {
          ...serializeEmailCampaign(item),
          stats: stats.get(String(item.id))
        },
        meta: {
          smtpConfigured: isSmtpConfigured(),
          sendgridConfigured: Boolean(env.SENDGRID_API_KEY)
        }
      });
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
      const audience = data.audienceType || data.source || 'crm_leads';
      if (audience === 'segment' && !data.segmentId) {
        res.status(400).json({ error: { message: 'segmentId required when audience=segment' } });
        return;
      }
      const repo = AppDataSource.getRepository(MarketingEmailCampaign);
      const saved = await repo.save(
        repo.create({
          organizationId: orgId,
          connectorId: data.connectorId ?? null,
          name: data.name,
          subject: data.subject,
          fromName: data.fromName ?? null,
          replyTo: data.replyTo ? data.replyTo : null,
          htmlBody: data.htmlBody,
          builderJson: data.builderJson ?? null,
          status: data.status || 'draft',
          segmentId: data.segmentId ?? null,
          source: audience,
          audienceType: audience,
          createdById: userIdFromReq(req) ?? null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null
        })
      );
      res.status(201).json({ data: serializeEmailCampaign(saved) });
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
      const repo = AppDataSource.getRepository(MarketingEmailCampaign);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Campaign not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      if (item.status === 'sending') {
        res.status(409).json({ error: { message: 'Cannot edit while sending' } });
        return;
      }
      const audience =
        data.audienceType !== undefined
          ? data.audienceType
          : data.source !== undefined
            ? data.source
            : undefined;
      Object.assign(item, {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.subject !== undefined ? { subject: data.subject } : {}),
        ...(data.htmlBody !== undefined ? { htmlBody: data.htmlBody } : {}),
        ...(data.builderJson !== undefined ? { builderJson: data.builderJson } : {}),
        ...(data.fromName !== undefined ? { fromName: data.fromName } : {}),
        ...(data.replyTo !== undefined ? { replyTo: data.replyTo || null } : {}),
        ...(data.connectorId !== undefined ? { connectorId: data.connectorId } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.segmentId !== undefined ? { segmentId: data.segmentId } : {}),
        ...(audience !== undefined ? { source: audience, audienceType: audience } : {}),
        ...(data.scheduledAt !== undefined
          ? { scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null }
          : {})
      });
      res.json({ data: serializeEmailCampaign(await repo.save(item)) });
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
      const repo = AppDataSource.getRepository(MarketingEmailCampaign);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Campaign not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listSends(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(MarketingEmailCampaign).findOne({
        where: { id: req.params.id }
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Campaign not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);
      const sends = await listSendsForCampaign(item.id);
      res.json({ data: sends.map(serializeEmailSend) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /**
   * POST /api/marketing/email-campaigns/:id/send?full=1
   * Uses campaign.connectorId or org default connector (SendGrid preferred for mass).
   */
  static async send(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(MarketingEmailCampaign).findOne({
        where: { id: req.params.id }
      });
      if (!item) {
        res.status(404).json({ error: { message: 'Campaign not found' } });
        return;
      }
      assertOrgAccess(req, item.organizationId);

      const full =
        req.query.full === '1' ||
        req.query.full === 'true' ||
        req.body?.full === true;
      const emails = Array.isArray(req.body?.emails)
        ? req.body.emails.map(String)
        : undefined;
      const connectorId =
        req.body?.connectorId != null ? String(req.body.connectorId) : undefined;

      const result = await sendEmailCampaign({
        campaignId: item.id,
        organizationId: item.organizationId,
        full,
        emails,
        connectorId
      });
      res.json({ data: result });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
