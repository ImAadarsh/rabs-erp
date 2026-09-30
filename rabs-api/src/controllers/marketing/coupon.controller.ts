import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { Coupon } from '@entities/marketing/Coupon.js';
import { listCouponUsage, validateCoupon } from '@services/marketing/coupon.service.js';
import { assertOrgAccess, orgIdFromReq } from '@services/marketing/marketingScope.js';

const createSchema = z.object({
  organizationId: z.string().optional(),
  campaignId: z.string().nullable().optional(),
  couponCode: z.string().min(1),
  couponName: z.string().min(1),
  discountType: z.enum(['percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y']),
  discountValue: z.number().optional(),
  currency: z.string().optional(),
  minimumPurchase: z.number().optional(),
  maximumDiscount: z.number().optional(),
  appliesTo: z.enum(['all', 'category', 'product', 'collection']).optional(),
  productIds: z.any().optional(),
  validFrom: z.string().nullable().optional(),
  validUntil: z.string().nullable().optional(),
  usageLimit: z.number().nullable().optional(),
  usageLimitPerCustomer: z.number().optional(),
  isActive: z.boolean().optional()
});

const updateSchema = createSchema.partial();

export class CouponController {
  static async list(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const items = await AppDataSource.getRepository(Coupon).find({
        where: { organizationId: orgId },
        relations: ['campaign'],
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response) {
    try {
      const item = await AppDataSource.getRepository(Coupon).findOne({
        where: { id: req.params.id },
        relations: ['campaign']
      });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      res.json({ data: item });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response) {
    try {
      const data = createSchema.parse(req.body);
      const orgId = data.organizationId || orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const repo = AppDataSource.getRepository(Coupon);
      const item = repo.create({
        organizationId: orgId,
        couponCode: data.couponCode.trim().toUpperCase(),
        couponName: data.couponName,
        discountType: data.discountType,
        discountValue: data.discountValue,
        currency: data.currency,
        minimumPurchase: data.minimumPurchase,
        maximumDiscount: data.maximumDiscount,
        appliesTo: data.appliesTo,
        productIds: data.productIds,
        campaignId: data.campaignId ?? undefined,
        validFrom: data.validFrom ? new Date(data.validFrom) : undefined,
        validUntil: data.validUntil ? new Date(data.validUntil) : undefined,
        usageLimit: data.usageLimit ?? undefined,
        usageLimitPerCustomer: data.usageLimitPerCustomer,
        isActive: data.isActive
      } as any);
      const saved = await repo.save(item);
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response) {
    try {
      const data = updateSchema.parse(req.body);
      const repo = AppDataSource.getRepository(Coupon);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      const { organizationId: _o, validFrom, validUntil, couponCode, ...rest } = data as any;
      Object.assign(item, rest);
      if (couponCode) item.couponCode = String(couponCode).trim().toUpperCase();
      if (validFrom !== undefined) item.validFrom = validFrom ? new Date(validFrom) : undefined;
      if (validUntil !== undefined) item.validUntil = validUntil ? new Date(validUntil) : undefined;
      const saved = await repo.save(item);
      res.json({ data: saved });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response) {
    try {
      const repo = AppDataSource.getRepository(Coupon);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) return res.status(404).json({ error: { message: 'Not found' } });
      assertOrgAccess(req, item.organizationId);
      await repo.remove(item);
      res.json({ data: { id: item.id } });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async listUsage(req: Request, res: Response) {
    try {
      const orgId = orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const couponId = req.params.id;
      if (couponId && couponId !== 'usage') {
        const coupon = await AppDataSource.getRepository(Coupon).findOne({ where: { id: couponId } });
        if (!coupon) return res.status(404).json({ error: { message: 'Not found' } });
        assertOrgAccess(req, coupon.organizationId);
      }
      const usages = await listCouponUsage({
        organizationId: orgId,
        couponId: couponId && couponId !== 'usage' ? couponId : undefined
      });
      res.json({ data: usages });
    } catch (error: any) {
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }

  static async validate(req: Request, res: Response) {
    try {
      const parsed = z
        .object({
          couponCode: z.string().min(1),
          organizationId: z.string().optional(),
          customerId: z.string().optional(),
          subtotal: z.number().nonnegative()
        })
        .parse(req.body);
      const orgId = parsed.organizationId || orgIdFromReq(req);
      if (!orgId) return res.status(400).json({ error: { message: 'organizationId required' } });
      const result = await validateCoupon({
        organizationId: orgId,
        couponCode: parsed.couponCode,
        customerId: parsed.customerId,
        subtotal: parsed.subtotal
      });
      res.json({
        data: {
          couponId: result.coupon.id,
          couponCode: result.coupon.couponCode,
          couponName: result.coupon.couponName,
          discountType: result.coupon.discountType,
          discountValue: result.coupon.discountValue,
          discountAmount: result.discountAmount,
          currency: result.currency,
          freeShipping: result.coupon.discountType === 'free_shipping'
        }
      });
    } catch (error: any) {
      if (error instanceof z.ZodError) return res.status(400).json({ error: { message: error.errors[0].message } });
      res.status(error.status || 500).json({ error: { message: error.message } });
    }
  }
}
