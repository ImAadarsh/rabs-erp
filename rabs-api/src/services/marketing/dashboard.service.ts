import { AppDataSource } from '@config/data-source.js';
import { Segment } from '@entities/marketing/Segment.js';
import { Campaign } from '@entities/marketing/Campaign.js';
import { Coupon } from '@entities/marketing/Coupon.js';
import { Affiliate } from '@entities/marketing/Affiliate.js';
import { AffiliateClick } from '@entities/marketing/AffiliateClick.js';
import { AffiliateConversion } from '@entities/marketing/AffiliateConversion.js';
import { CouponUsage } from '@entities/marketing/CouponUsage.js';
import { CampaignSend } from '@entities/marketing/CampaignSend.js';

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export async function getMarketingDashboard(organizationId: string) {
  const [segments, campaigns, coupons, affiliates, activeCoupons, activeAffiliates] = await Promise.all([
    AppDataSource.getRepository(Segment).count({ where: { organizationId } }),
    AppDataSource.getRepository(Campaign).count({ where: { organizationId } }),
    AppDataSource.getRepository(Coupon).count({ where: { organizationId } }),
    AppDataSource.getRepository(Affiliate).count({ where: { organizationId } }),
    AppDataSource.getRepository(Coupon).count({ where: { organizationId, isActive: true } }),
    AppDataSource.getRepository(Affiliate).count({ where: { organizationId, status: 'active' } })
  ]);

  const orgAffiliates = await AppDataSource.getRepository(Affiliate).find({
    where: { organizationId },
    select: ['id']
  });
  const affIds = orgAffiliates.map((a) => a.id);

  let clicks = 0;
  let conversions: AffiliateConversion[] = [];
  let couponUsages = 0;

  if (affIds.length) {
    clicks = await AppDataSource.getRepository(AffiliateClick)
      .createQueryBuilder('c')
      .where('c.affiliate_id IN (:...ids)', { ids: affIds })
      .getCount();

    conversions = await AppDataSource.getRepository(AffiliateConversion)
      .createQueryBuilder('cv')
      .where('cv.affiliate_id IN (:...ids)', { ids: affIds })
      .orderBy('cv.converted_at', 'DESC')
      .getMany();
  }

  const couponIds = (
    await AppDataSource.getRepository(Coupon).find({ where: { organizationId }, select: ['id'] })
  ).map((c) => c.id);
  if (couponIds.length) {
    couponUsages = await AppDataSource.getRepository(CouponUsage)
      .createQueryBuilder('u')
      .where('u.coupon_id IN (:...ids)', { ids: couponIds })
      .getCount();
  }

  const b2bConversions = conversions.filter((c) => c.channel === 'b2b_portal');
  const totalCommission = conversions.reduce((s, c) => s + num(c.commissionAmount), 0);
  const totalRevenue = conversions.reduce((s, c) => s + num(c.orderValue), 0);
  const b2bRevenue = b2bConversions.reduce((s, c) => s + num(c.orderValue), 0);

  const campaignIds = (
    await AppDataSource.getRepository(Campaign).find({ where: { organizationId }, select: ['id', 'campaignName'] })
  );
  const campNameById = new Map(campaignIds.map((c) => [String(c.id), c.campaignName]));
  let recentSends: CampaignSend[] = [];
  if (campaignIds.length) {
    recentSends = await AppDataSource.getRepository(CampaignSend)
      .createQueryBuilder('s')
      .where('s.campaign_id IN (:...ids)', { ids: campaignIds.map((c) => c.id) })
      .orderBy('s.created_at', 'DESC')
      .take(5)
      .getMany();
  }

  const days: { date: string; clicks: number; conversions: number; b2bConversions: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const next = new Date(d);
    next.setDate(next.getDate() + 1);
    const dateStr = d.toISOString().slice(0, 10);

    let dayClicks = 0;
    if (affIds.length) {
      dayClicks = await AppDataSource.getRepository(AffiliateClick)
        .createQueryBuilder('c')
        .where('c.affiliate_id IN (:...ids)', { ids: affIds })
        .andWhere('c.clicked_at >= :start AND c.clicked_at < :end', { start: d, end: next })
        .getCount();
    }

    const dayConvs = conversions.filter((c) => {
      const t = new Date(c.convertedAt).getTime();
      return t >= d.getTime() && t < next.getTime();
    });

    days.push({
      date: dateStr,
      clicks: dayClicks,
      conversions: dayConvs.length,
      b2bConversions: dayConvs.filter((c) => c.channel === 'b2b_portal').length
    });
  }

  const topAffiliates = await AppDataSource.getRepository(Affiliate).find({
    where: { organizationId },
    order: { totalRevenue: 'DESC' },
    take: 5
  });

  return {
    totals: {
      segments,
      campaigns,
      coupons,
      activeCoupons,
      affiliates,
      activeAffiliates,
      clicks,
      conversions: conversions.length,
      b2bConversions: b2bConversions.length,
      couponUsages,
      totalCommission: Number(totalCommission.toFixed(4)),
      totalRevenue: Number(totalRevenue.toFixed(4)),
      b2bRevenue: Number(b2bRevenue.toFixed(4))
    },
    series: days,
    recentSends: recentSends.map((s) => ({
      id: s.id,
      sendName: s.sendName,
      status: s.status,
      recipientCount: s.recipientCount,
      deliveredCount: s.deliveredCount,
      failedCount: s.failedCount,
      sentAt: s.sentAt,
      campaignName: campNameById.get(String(s.campaignId))
    })),
    topAffiliates: topAffiliates.map((a) => ({
      id: a.id,
      affiliateCode: a.affiliateCode,
      contactName: a.contactName,
      totalClicks: a.totalClicks,
      totalConversions: a.totalConversions,
      totalRevenue: num(a.totalRevenue),
      totalCommission: num(a.totalCommission),
      status: a.status
    }))
  };
}
