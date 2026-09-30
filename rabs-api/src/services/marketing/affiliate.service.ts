import { EntityManager } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Affiliate } from '@entities/marketing/Affiliate.js';
import { AffiliateLink } from '@entities/marketing/AffiliateLink.js';
import { AffiliateClick } from '@entities/marketing/AffiliateClick.js';
import { AffiliateConversion } from '@entities/marketing/AffiliateConversion.js';
import { AffiliatePayout } from '@entities/marketing/AffiliatePayout.js';
import { slugCode } from './marketingScope.js';
import { env } from '@config/env.js';

function num(v: unknown, fallback = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
}

function trackingCode(): string {
  return `AFF-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

export async function listAffiliateLinks(affiliateId: string) {
  return AppDataSource.getRepository(AffiliateLink).find({
    where: { affiliateId },
    order: { createdAt: 'DESC' }
  });
}

export async function createAffiliateLink(opts: {
  affiliateId: string;
  linkName?: string;
  originalUrl: string;
  trackingCode?: string;
  shortUrl?: string;
}) {
  const repo = AppDataSource.getRepository(AffiliateLink);
  const code = opts.trackingCode?.trim() || trackingCode();
  const existing = await repo.findOne({ where: { trackingCode: code } });
  if (existing) {
    throw Object.assign(new Error('Tracking code already exists'), { status: 409 });
  }
  return repo.save(
    repo.create({
      affiliateId: opts.affiliateId,
      linkName: opts.linkName,
      originalUrl: opts.originalUrl,
      trackingCode: code,
      shortUrl: opts.shortUrl,
      isActive: true
    })
  );
}

export async function recordAffiliateClick(opts: {
  trackingCode?: string;
  affiliateCode?: string;
  organizationId?: string;
  ipAddress?: string;
  userAgent?: string;
  referrer?: string;
  landingPage?: string;
  sessionId?: string;
  utmSource?: string;
  utmMedium?: string;
  utmCampaign?: string;
  utmTerm?: string;
  utmContent?: string;
}): Promise<{ click: AffiliateClick; link: AffiliateLink; affiliate: Affiliate; redirectUrl: string }> {
  const linkRepo = AppDataSource.getRepository(AffiliateLink);
  const affRepo = AppDataSource.getRepository(Affiliate);

  let link: AffiliateLink | null = null;
  let affiliate: Affiliate | null = null;

  if (opts.trackingCode) {
    link = await linkRepo.findOne({
      where: { trackingCode: opts.trackingCode, isActive: true },
      relations: ['affiliate']
    });
    if (link) affiliate = link.affiliate;
  }

  if (!affiliate && opts.affiliateCode) {
    const qb = affRepo
      .createQueryBuilder('a')
      .where('UPPER(a.affiliate_code) = :code', { code: opts.affiliateCode.trim().toUpperCase() })
      .andWhere('a.status = :status', { status: 'active' });
    if (opts.organizationId) {
      qb.andWhere('a.organization_id = :orgId', { orgId: opts.organizationId });
    }
    affiliate = await qb.getOne();
    if (affiliate) {
      // Prefer an active link, or create a default landing link
      link = await linkRepo.findOne({
        where: { affiliateId: affiliate.id, isActive: true },
        order: { createdAt: 'DESC' }
      });
      if (!link) {
        link = await createAffiliateLink({
          affiliateId: affiliate.id,
          linkName: 'Default',
          originalUrl: opts.landingPage || env.B2B_WEBSITE_URL,
          trackingCode: `DEF-${slugCode(affiliate.affiliateCode, 20)}`
        });
      }
    }
  }

  if (!affiliate || !link) {
    throw Object.assign(new Error('Affiliate link not found'), { status: 404 });
  }
  if (affiliate.status !== 'active') {
    throw Object.assign(new Error('Affiliate is not active'), { status: 400 });
  }

  const clickRepo = AppDataSource.getRepository(AffiliateClick);
  const click = await clickRepo.save(
    clickRepo.create({
      affiliateLinkId: link.id,
      affiliateId: affiliate.id,
      ipAddress: opts.ipAddress,
      userAgent: opts.userAgent,
      referrer: opts.referrer,
      landingPage: opts.landingPage,
      sessionId: opts.sessionId,
      utmSource: opts.utmSource,
      utmMedium: opts.utmMedium,
      utmCampaign: opts.utmCampaign,
      utmTerm: opts.utmTerm,
      utmContent: opts.utmContent
    })
  );

  await linkRepo.increment({ id: link.id }, 'clickCount', 1);
  await affRepo.increment({ id: affiliate.id }, 'totalClicks', 1);

  return { click, link, affiliate, redirectUrl: link.originalUrl };
}

export function computeCommission(affiliate: Affiliate, orderValue: number): number {
  const value = Math.max(0, orderValue);
  if (affiliate.commissionType === 'fixed_per_sale') {
    return Number(num(affiliate.commissionValue).toFixed(4));
  }
  // percentage (and tiered fallback to percentage)
  return Number(((value * num(affiliate.commissionValue)) / 100).toFixed(4));
}

export async function attributeOrderConversion(
  manager: EntityManager,
  opts: {
    organizationId: string;
    orderId: string;
    orderValue: number;
    currency?: string;
    channel?: string;
    affiliateCode?: string;
    trackingCode?: string;
    sessionId?: string;
    clickId?: string;
  }
): Promise<AffiliateConversion | null> {
  const code = opts.affiliateCode?.trim() || opts.trackingCode?.trim();
  if (!code && !opts.clickId && !opts.sessionId) return null;

  const affRepo = manager.getRepository(Affiliate);
  const linkRepo = manager.getRepository(AffiliateLink);
  const clickRepo = manager.getRepository(AffiliateClick);
  const convRepo = manager.getRepository(AffiliateConversion);

  // Idempotent: one conversion per order
  const existing = await convRepo.findOne({ where: { orderId: opts.orderId } });
  if (existing) return existing;

  let affiliate: Affiliate | null = null;
  let click: AffiliateClick | null = null;

  if (opts.clickId) {
    click = await clickRepo.findOne({ where: { id: opts.clickId }, relations: ['affiliate'] });
    if (click) affiliate = click.affiliate;
  }

  if (!affiliate && opts.sessionId) {
    click = await clickRepo.findOne({
      where: { sessionId: opts.sessionId },
      relations: ['affiliate'],
      order: { clickedAt: 'DESC' }
    });
    if (click) affiliate = click.affiliate;
  }

  if (!affiliate && opts.trackingCode) {
    const link = await linkRepo.findOne({
      where: { trackingCode: opts.trackingCode },
      relations: ['affiliate']
    });
    if (link) affiliate = link.affiliate;
  }

  if (!affiliate && opts.affiliateCode) {
    affiliate = await affRepo
      .createQueryBuilder('a')
      .where('a.organization_id = :orgId', { orgId: opts.organizationId })
      .andWhere('UPPER(a.affiliate_code) = :code', { code: opts.affiliateCode.trim().toUpperCase() })
      .getOne();
  }

  if (!affiliate || affiliate.status !== 'active') return null;
  if (String(affiliate.organizationId) !== String(opts.organizationId)) return null;

  const commissionAmount = computeCommission(affiliate, opts.orderValue);
  const conversion = await convRepo.save(
    convRepo.create({
      affiliateClickId: click?.id ?? null,
      affiliateId: affiliate.id,
      orderId: opts.orderId,
      orderValue: Number(opts.orderValue.toFixed(4)),
      commissionAmount,
      currency: opts.currency || affiliate.currency || 'GBP',
      attributionModel: 'last_click',
      channel: opts.channel || null
    })
  );

  await affRepo.increment({ id: affiliate.id }, 'totalConversions', 1);
  await affRepo
    .createQueryBuilder()
    .update(Affiliate)
    .set({
      totalRevenue: () => `total_revenue + ${Number(opts.orderValue.toFixed(4))}`,
      totalCommission: () => `total_commission + ${commissionAmount}`
    })
    .where('id = :id', { id: affiliate.id })
    .execute();

  if (click) {
    const link = await linkRepo.findOne({ where: { id: click.affiliateLinkId } });
    if (link) await linkRepo.increment({ id: link.id }, 'conversionCount', 1);
  }

  return conversion;
}

export async function listClicks(opts: { organizationId: string; affiliateId?: string }) {
  const affIds = await orgAffiliateIds(opts.organizationId, opts.affiliateId);
  if (!affIds.length) return [];
  return AppDataSource.getRepository(AffiliateClick)
    .createQueryBuilder('c')
    .where('c.affiliate_id IN (:...ids)', { ids: affIds })
    .orderBy('c.clicked_at', 'DESC')
    .take(200)
    .getMany();
}

export async function listConversions(opts: { organizationId: string; affiliateId?: string; channel?: string }) {
  const affIds = await orgAffiliateIds(opts.organizationId, opts.affiliateId);
  if (!affIds.length) return [];
  const qb = AppDataSource.getRepository(AffiliateConversion)
    .createQueryBuilder('cv')
    .where('cv.affiliate_id IN (:...ids)', { ids: affIds })
    .orderBy('cv.converted_at', 'DESC')
    .take(200);
  if (opts.channel) qb.andWhere('cv.channel = :channel', { channel: opts.channel });
  return qb.getMany();
}

export async function listPayouts(opts: { organizationId: string; affiliateId?: string }) {
  const affIds = await orgAffiliateIds(opts.organizationId, opts.affiliateId);
  if (!affIds.length) return [];
  return AppDataSource.getRepository(AffiliatePayout)
    .createQueryBuilder('p')
    .where('p.affiliate_id IN (:...ids)', { ids: affIds })
    .orderBy('p.created_at', 'DESC')
    .take(200)
    .getMany();
}

async function orgAffiliateIds(organizationId: string, affiliateId?: string): Promise<string[]> {
  if (affiliateId) {
    const a = await AppDataSource.getRepository(Affiliate).findOne({ where: { id: affiliateId } });
    if (!a || String(a.organizationId) !== String(organizationId)) return [];
    return [a.id];
  }
  const rows = await AppDataSource.getRepository(Affiliate).find({
    where: { organizationId },
    select: ['id']
  });
  return rows.map((r) => r.id);
}

export async function createPayout(opts: {
  affiliateId: string;
  organizationId: string;
  periodStart: string;
  periodEnd: string;
  adjustments?: number;
  notes?: string;
  approvedById?: string;
}) {
  const aff = await AppDataSource.getRepository(Affiliate).findOne({ where: { id: opts.affiliateId } });
  if (!aff || String(aff.organizationId) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Affiliate not found'), { status: 404 });
  }

  const start = new Date(opts.periodStart);
  const end = new Date(opts.periodEnd);
  const conversions = await AppDataSource.getRepository(AffiliateConversion)
    .createQueryBuilder('c')
    .where('c.affiliate_id = :aid', { aid: opts.affiliateId })
    .andWhere('c.converted_at >= :start', { start })
    .andWhere('c.converted_at <= :end', { end: new Date(end.getTime() + 86400000 - 1) })
    .getMany();

  const totalConversions = conversions.length;
  const totalRevenue = conversions.reduce((s, c) => s + num(c.orderValue), 0);
  const totalCommission = conversions.reduce((s, c) => s + num(c.commissionAmount), 0);
  const adjustments = num(opts.adjustments);

  const payoutNumber = `AP-${aff.affiliateCode}-${Date.now().toString().slice(-8)}`;
  const repo = AppDataSource.getRepository(AffiliatePayout);
  return repo.save(
    repo.create({
      affiliateId: opts.affiliateId,
      payoutNumber,
      periodStart: start,
      periodEnd: end,
      totalConversions,
      totalRevenue: Number(totalRevenue.toFixed(4)),
      totalCommission: Number(totalCommission.toFixed(4)),
      adjustments: Number(adjustments.toFixed(4)),
      currency: aff.currency || 'GBP',
      paymentMethod: (aff.paymentMethod as any) || 'bank_transfer',
      status: 'pending',
      notes: opts.notes,
      approvedById: opts.approvedById ?? null
    })
  );
}

export async function updatePayoutStatus(opts: {
  payoutId: string;
  organizationId: string;
  status: 'pending' | 'approved' | 'processing' | 'paid' | 'failed';
  approvedById?: string;
}) {
  const repo = AppDataSource.getRepository(AffiliatePayout);
  const payout = await repo.findOne({ where: { id: opts.payoutId }, relations: ['affiliate'] });
  if (!payout || String(payout.affiliate.organizationId) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Payout not found'), { status: 404 });
  }
  payout.status = opts.status;
  if (opts.status === 'approved') {
    payout.approvedAt = new Date();
    payout.approvedById = opts.approvedById ?? null;
  }
  if (opts.status === 'paid') {
    payout.paidAt = new Date();
    const amount = num(payout.payoutAmount ?? num(payout.totalCommission) + num(payout.adjustments));
    await AppDataSource.getRepository(Affiliate)
      .createQueryBuilder()
      .update(Affiliate)
      .set({ totalPaid: () => `total_paid + ${amount}` })
      .where('id = :id', { id: payout.affiliateId })
      .execute();
  }
  return repo.save(payout);
}

export async function ensureDefaultLink(affiliate: Affiliate, baseUrl = env.B2B_WEBSITE_URL) {
  const existing = await AppDataSource.getRepository(AffiliateLink).findOne({
    where: { affiliateId: affiliate.id }
  });
  if (existing) return existing;
  return createAffiliateLink({
    affiliateId: affiliate.id,
    linkName: 'B2B Portal',
    originalUrl: `${baseUrl}?aff=${encodeURIComponent(affiliate.affiliateCode)}`,
    trackingCode: `B2B-${slugCode(affiliate.affiliateCode, 24)}`
  });
}
