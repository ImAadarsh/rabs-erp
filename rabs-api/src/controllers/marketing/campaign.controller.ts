import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Campaign } from '@entities/marketing/Campaign.js';
import {
  buildCampaignPayload,
  executeCampaignSend,
  listCampaignLogs,
  listCampaignSends,
  serializeCampaign
} from '@services/marketing/campaign.service.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/marketing/marketingScope.js';

const createFields = z.object({
  organizationId: z.string().optional(),
  name: z.string().min(1).optional(),
  campaignName: z.string().min(1).optional(),
  campaignCode: z.string().optional(),
  type: z.enum(['email', 'sms', 'social', 'affiliate', 'paid_ads', 'other', 'push', 'in_app']).optional(),
  campaignType: z.enum(['email', 'sms', 'social', 'affiliate', 'paid_ads', 'other']).optional(),
  status: z.enum(['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled', 'running']).optional(),
  description: z.string().optional(),
  subject: z.string().optional(),
  content: z.string().optional(),
  targetSegmentId: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  budget: z.number().optional(),
  currency: z.string().optional(),
  targetAudience: z.string().optional(),
  goals: z.string().optional()
});

const createSchema = createFields.refine((d) => d.name || d.campaignName, { message: 'name is required' });
const updateSchema = createFields.partial();

function mapStatus(status?: string): string | undefined {
  if (!status) return undefined;
  if (status === 'running') return 'active';
  return status;
}

function mapType(type?: string): string | undefined {
  if (!type) return undefined;
  if (type === 'push' || type === 'in_app') return 'other';
  return type;
}

export class CampaignController {
  static async list(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const items = await AppDataSource.getRepository(Campaign).find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items.map(serializeCampaign) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(Campaign).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      res.json({ data: serializeCampaign(item) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const raw = createSchema.parse(req.body);
      const orgId = raw.organizationId || orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const payload = buildCampaignPayload({
        ...raw,
        type: mapType(raw.campaignType || raw.type),
        status: mapStatus(raw.status),
        description: raw.description || raw.content || raw.subject,
        targetAudience: raw.targetAudience || (raw.targetSegmentId ? `segment:${raw.targetSegmentId}` : undefined)
      });
      const repo = AppDataSource.getRepository(Campaign);
      const item = repo.create({
        organizationId: orgId,
        campaignName: payload.campaignName!,
        campaignCode: payload.campaignCode!,
        campaignType: payload.campaignType as any,
        status: (payload.status as any) || 'draft',
        description: payload.description,
        startDate: payload.startDate,
        endDate: payload.endDate,
        budget: payload.budget as any,
        currency: payload.currency,
        targetAudience: payload.targetAudience,
        goals: payload.goals,
        createdById: userIdFromReq(req) ?? null
      });
      const saved = await repo.save(item);
      res.status(201).json({ data: serializeCampaign(saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const raw = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Campaign);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      const payload = buildCampaignPayload({
        campaignName: raw.campaignName || raw.name || item.campaignName,
        campaignCode: raw.campaignCode || item.campaignCode,
        type: mapType(raw.campaignType || raw.type) || item.campaignType,
        status: mapStatus(raw.status) || item.status,
        description: raw.description ?? raw.content ?? item.description,
        startDate: raw.startDate === undefined ? (item.startDate ? String(item.startDate) : undefined) : raw.startDate,
        endDate: raw.endDate === undefined ? (item.endDate ? String(item.endDate) : undefined) : raw.endDate,
        budget: raw.budget === undefined ? (item.budget as any) : raw.budget,
        currency: raw.currency || item.currency,
        targetAudience:
          raw.targetAudience ??
          (raw.targetSegmentId ? `segment:${raw.targetSegmentId}` : item.targetAudience),
        goals: raw.goals === undefined ? item.goals : raw.goals
      });
      Object.assign(item, {
        campaignName: payload.campaignName,
        campaignCode: payload.campaignCode,
        campaignType: payload.campaignType,
        status: payload.status,
        description: payload.description,
        startDate: payload.startDate,
        endDate: payload.endDate,
        budget: payload.budget,
        currency: payload.currency,
        targetAudience: payload.targetAudience,
        goals: payload.goals
      });
      const saved = await repo.save(item);
      res.json({ data: serializeCampaign(saved) });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Campaign);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listSends(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(Campaign).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      const sends = await listCampaignSends(item.id);
      res.json({ data: sends });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async send(req: Request, res: Response) {
    try {
      const parsed = z
        .object({
          segmentId: z.string().optional(),
          sendName: z.string().optional(),
          sendType: z.enum(['email', 'sms', 'push']).optional(),
          subject: z.string().optional(),
          content: z.string().optional()
        })
        .parse(req.body || {});
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });

      // Allow targetAudience segment:ID convention
      let segmentId = parsed.segmentId;
      const campaign = await AppDataSource.getRepository(Campaign).findOne({ where: { id: req.params.id } });
      if (!segmentId && campaign?.targetAudience?.startsWith('segment:')) {
        segmentId = campaign.targetAudience.replace(/^segment:/, '');
      }

      const result = await executeCampaignSend({
        campaignId: req.params.id,
        organizationId: orgId,
        segmentId,
        sendName: parsed.sendName,
        sendType: parsed.sendType,
        subject: parsed.subject,
        content: parsed.content
      });
      res.status(201).json({ data: result });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listLogs(req: Request, res: Response) {
    try {
      const send = await AppDataSource.getRepository(
        (await import('@entities/marketing/CampaignSend.js')).CampaignSend
      ).findOne({
        where: { id: req.params.sendId },
        relations: ['campaign']
      });
      if (!send) return res.status(404).json({ error: { message: 'Send not found' } });
      assertOrgAccess(req, send.campaign.organizationId);
      const logs = await listCampaignLogs(send.id);
      res.json({ data: logs });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
