import { EntityManager } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Coupon } from '@entities/marketing/Coupon.js';
import { CouponUsage } from '@entities/marketing/CouponUsage.js';

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

export type CouponValidationResult = {
  coupon: Coupon;
  discountAmount: number;
  currency: string;
};

export async function findActiveCoupon(opts: {
  organizationId: string;
  couponCode: string;
}): Promise<Coupon | null> {
  const repo = AppDataSource.getRepository(Coupon);
  const code = opts.couponCode.trim().toUpperCase();
  const coupon = await repo
    .createQueryBuilder('c')
    .where('c.organization_id = :orgId', { orgId: opts.organizationId })
    .andWhere('UPPER(c.coupon_code) = :code', { code })
    .getOne();
  return coupon;
}

export async function validateCoupon(opts: {
  organizationId: string;
  couponCode: string;
  customerId?: string;
  subtotal: number;
}): Promise<CouponValidationResult> {
  const coupon = await findActiveCoupon(opts);
  if (!coupon) {
    throw Object.assign(new Error('Coupon not found'), { status: 404 });
  }
  if (!coupon.isActive) {
    throw Object.assign(new Error('Coupon is inactive'), { status: 400 });
  }

  const now = new Date();
  if (coupon.validFrom && new Date(coupon.validFrom) > now) {
    throw Object.assign(new Error('Coupon is not yet valid'), { status: 400 });
  }
  if (coupon.validUntil && new Date(coupon.validUntil) < now) {
    throw Object.assign(new Error('Coupon has expired'), { status: 400 });
  }
  if (coupon.usageLimit != null && num(coupon.usageCount) >= num(coupon.usageLimit)) {
    throw Object.assign(new Error('Coupon usage limit reached'), { status: 400 });
  }
  if (coupon.minimumPurchase != null && opts.subtotal < num(coupon.minimumPurchase)) {
    throw Object.assign(
      new Error(`Minimum purchase of ${num(coupon.minimumPurchase).toFixed(2)} required`),
      { status: 400 }
    );
  }

  if (opts.customerId && coupon.usageLimitPerCustomer != null) {
    const usageRepo = AppDataSource.getRepository(CouponUsage);
    const used = await usageRepo.count({
      where: { couponId: coupon.id, customerId: opts.customerId }
    });
    if (used >= num(coupon.usageLimitPerCustomer)) {
      throw Object.assign(new Error('You have already used this coupon the maximum number of times'), {
        status: 400
      });
    }
  }

  let discountAmount = 0;
  const subtotal = Math.max(0, opts.subtotal);
  if (coupon.discountType === 'percentage') {
    discountAmount = subtotal * (num(coupon.discountValue) / 100);
  } else if (coupon.discountType === 'fixed_amount') {
    discountAmount = Math.min(subtotal, num(coupon.discountValue));
  } else if (coupon.discountType === 'free_shipping') {
    discountAmount = 0; // applied separately as shipping=0 by caller if needed
  } else {
    throw Object.assign(new Error(`Discount type ${coupon.discountType} is not supported on this channel`), {
      status: 400
    });
  }

  if (coupon.maximumDiscount != null) {
    discountAmount = Math.min(discountAmount, num(coupon.maximumDiscount));
  }
  discountAmount = Number(Math.max(0, discountAmount).toFixed(4));

  return { coupon, discountAmount, currency: coupon.currency || 'GBP' };
}

export async function recordCouponUsage(
  manager: EntityManager,
  opts: {
    couponId: string;
    orderId: string;
    customerId: string;
    discountAmount: number;
    currency?: string;
  }
): Promise<CouponUsage> {
  const usageRepo = manager.getRepository(CouponUsage);
  const couponRepo = manager.getRepository(Coupon);
  const usage = await usageRepo.save(
    usageRepo.create({
      couponId: opts.couponId,
      orderId: opts.orderId,
      customerId: opts.customerId,
      discountAmount: opts.discountAmount,
      currency: opts.currency || 'GBP'
    })
  );
  await couponRepo.increment({ id: opts.couponId }, 'usageCount', 1);
  return usage;
}

export async function listCouponUsage(opts: { organizationId: string; couponId?: string }) {
  const couponIds = opts.couponId
    ? [opts.couponId]
    : (
        await AppDataSource.getRepository(Coupon).find({
          where: { organizationId: opts.organizationId },
          select: ['id']
        })
      ).map((c) => c.id);
  if (!couponIds.length) return [];
  if (opts.couponId) {
    const coupon = await AppDataSource.getRepository(Coupon).findOne({ where: { id: opts.couponId } });
    if (!coupon || String(coupon.organizationId) !== String(opts.organizationId)) return [];
  }
  return AppDataSource.getRepository(CouponUsage)
    .createQueryBuilder('u')
    .where('u.coupon_id IN (:...ids)', { ids: couponIds })
    .orderBy('u.used_at', 'DESC')
    .take(200)
    .getMany();
}
