import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Affiliate } from '@entities/marketing/Affiliate.js';
import {
  createAffiliateLink,
  createPayout,
  ensureDefaultLink,
  listAffiliateLinks,
  listClicks,
  listConversions,
  listPayouts,
  recordAffiliateClick,
  updatePayoutStatus
} from '@services/marketing/affiliate.service.js';
import { assertOrgAccess, orgIdFromReq, userIdFromReq } from '@services/marketing/marketingScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  affiliateCode: z.string().min(1),
  companyName: z.string().optional(),
  contactName: z.string().min(1),
  email: z.string().email(),
  phone: z.string().optional(),
  website: z.string().optional(),
  commissionType: z.enum(['percentage', 'fixed_per_sale', 'tiered']).optional(),
  commissionValue: z.number(),
  currency: z.string().optional(),
  paymentTerms: z.string().optional(),
  paymentMethod: z.enum(['bank_transfer', 'paypal', 'check', 'other']).optional(),
  paymentDetails: z.string().optional(),
  payoutFrequency: z.enum(['weekly', 'biweekly', 'monthly', 'quarterly']).optional(),
  minimumPayout: z.number().optional(),
  status: z.enum(['pending', 'active', 'suspended', 'terminated']).optional(),
  notes: z.string().optional()
});

const updateSchema = createSchema.partial();

export class AffiliateController {
  static async list(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const items = await AppDataSource.getRepository(Affiliate).find({
        where: { organizationId: orgId },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(Affiliate).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      const links = await listAffiliateLinks(item.id);
      res.json({ data: { ...item, links } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const data = createSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const repo = AppDataSource.getRepository(Affiliate);
      const item = repo.create({
        ...data,
        organizationId: orgId,
        affiliateCode: data.affiliateCode.trim().toUpperCase(),
        status: data.status || 'active'
      });
      const saved = await repo.save(item);
      const link = await ensureDefaultLink(saved);
      res.status(201).json({ data: { ...saved, links: [link] } });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Affiliate);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      const { organizationId: _o, affiliateCode, ...rest } = data as any;
      Object.assign(item, rest);
      if (affiliateCode) item.affiliateCode = String(affiliateCode).trim().toUpperCase();
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Affiliate);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listLinks(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(Affiliate).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      res.json({ data: await listAffiliateLinks(item.id) });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async createLink(req: Request, res: Response) {
    try {
      const parsed = z
        .object({
          linkName: z.string().optional(),
          originalUrl: z.string().url(),
          trackingCode: z.string().optional(),
          shortUrl: z.string().optional()
        })
        .parse(req.body);
      const item = await AppDataSource.getRepository(Affiliate).findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      const link = await createAffiliateLink({ affiliateId: item.id, ...parsed });
      res.status(201).json({ data: link });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listClicks(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const affiliateId = req.query.affiliateId ? String(req.query.affiliateId) : req.params.id;
      const data = await listClicks({
        organizationId: orgId,
        affiliateId: affiliateId && affiliateId !== 'clicks' ? affiliateId : undefined
      });
      res.json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listConversions(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const affiliateId = req.query.affiliateId ? String(req.query.affiliateId) : req.params.id;
      const channel = req.query.channel ? String(req.query.channel) : undefined;
      const data = await listConversions({
        organizationId: orgId,
        affiliateId: affiliateId && affiliateId !== 'conversions' ? affiliateId : undefined,
        channel
      });
      res.json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listPayouts(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const affiliateId = req.query.affiliateId ? String(req.query.affiliateId) : req.params.id;
      const data = await listPayouts({
        organizationId: orgId,
        affiliateId: affiliateId && affiliateId !== 'payouts' ? affiliateId : undefined
      });
      res.json({ data });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async createPayout(req: Request, res: Response) {
    try {
      const parsed = z
        .object({
          affiliateId: z.string().optional(),
          periodStart: z.string(),
          periodEnd: z.string(),
          adjustments: z.number().optional(),
          notes: z.string().optional()
        })
        .parse(req.body);
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const affiliateId = parsed.affiliateId || req.params.id;
      const payout = await createPayout({
        affiliateId,
        organizationId: orgId,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
        adjustments: parsed.adjustments,
        notes: parsed.notes,
        approvedById: userIdFromReq(req)
      });
      res.status(201).json({ data: payout });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async updatePayout(req: Request, res: Response) {
    try {
      const parsed = z
        .object({
          status: z.enum(['pending', 'approved', 'processing', 'paid', 'failed'])
        })
        .parse(req.body);
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const payout = await updatePayoutStatus({
        payoutId: req.params.payoutId,
        organizationId: orgId,
        status: parsed.status,
        approvedById: userIdFromReq(req)
      });
      res.json({ data: payout });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  /** Public click tracking */
  static async trackClick(req: Request, res: Response) {
    try {
      const parsed = z
        .object({
          trackingCode: z.string().optional(),
          affiliateCode: z.string().optional(),
          organizationId: z.string().optional(),
          landingPage: z.string().optional(),
          sessionId: z.string().optional(),
          referrer: z.string().optional(),
          utmSource: z.string().optional(),
          utmMedium: z.string().optional(),
          utmCampaign: z.string().optional(),
          utmTerm: z.string().optional(),
          utmContent: z.string().optional(),
          redirect: z.boolean().optional()
        })
        .refine((d) => d.trackingCode || d.affiliateCode, { message: 'trackingCode or affiliateCode required' })
        .parse({ ...req.query, ...req.body });

      const result = await recordAffiliateClick({
        ...parsed,
        ipAddress: (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() || req.ip,
        userAgent: req.headers['user-agent']
      });

      if (parsed.redirect && result.redirectUrl) {
        res.redirect(302, result.redirectUrl);
        return;
      }

      res.json({
        data: {
          clickId: result.click.id,
          trackingCode: result.link.trackingCode,
          affiliateCode: result.affiliate.affiliateCode,
          redirectUrl: result.redirectUrl,
          sessionId: result.click.sessionId
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
