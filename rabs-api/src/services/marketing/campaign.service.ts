import { AppDataSource } from '@config/data-source.js';
import { Campaign } from '@entities/marketing/Campaign.js';
import { CampaignSend } from '@entities/marketing/CampaignSend.js';
import { CampaignLog } from '@entities/marketing/CampaignLog.js';
import { Segment } from '@entities/marketing/Segment.js';
import { SegmentMember } from '@entities/marketing/SegmentMember.js';
import { Customer } from '@entities/orders/Customer.js';
import { slugCode } from './marketingScope.js';
import { serializeSegment } from './segment.service.js';

export function serializeCampaign(c: Campaign) {
  return {
    id: c.id,
    organizationId: c.organizationId,
    name: c.campaignName,
    campaignName: c.campaignName,
    campaignCode: c.campaignCode,
    type: c.campaignType,
    campaignType: c.campaignType,
    description: c.description,
    status: c.status,
    startDate: c.startDate,
    endDate: c.endDate,
    budget: c.budget,
    currency: c.currency,
    targetAudience: c.targetAudience,
    goals: c.goals,
    totalSent: c.totalSent,
    totalDelivered: c.totalDelivered,
    totalOpens: c.totalOpens,
    totalClicks: c.totalClicks,
    totalConversions: c.totalConversions,
    totalRevenue: c.totalRevenue,
    createdById: c.createdById,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
}

export function buildCampaignPayload(data: {
  name?: string;
  campaignName?: string;
  campaignCode?: string;
  type?: string;
  campaignType?: string;
  status?: string;
  description?: string;
  startDate?: string | null;
  endDate?: string | null;
  budget?: number | null;
  currency?: string;
  targetAudience?: string | null;
  goals?: string | null;
}) {
  const campaignName = data.campaignName || data.name;
  const campaignType = data.campaignType || data.type || 'email';
  const allowed = ['email', 'sms', 'social', 'affiliate', 'paid_ads', 'other'];
  const type = allowed.includes(campaignType) ? campaignType : 'other';
  return {
    campaignName,
    campaignCode:
      data.campaignCode ||
      (campaignName
        ? `${slugCode(campaignName, 16)}-${Date.now().toString(36).toUpperCase().slice(-4)}`
        : undefined),
    campaignType: type,
    status: data.status || 'draft',
    description: data.description,
    startDate: data.startDate ? new Date(data.startDate) : null,
    endDate: data.endDate ? new Date(data.endDate) : null,
    budget: data.budget ?? null,
    currency: data.currency || 'GBP',
    targetAudience: data.targetAudience ?? null,
    goals: data.goals ?? null
  };
}

export async function listCampaignSends(campaignId: string) {
  return AppDataSource.getRepository(CampaignSend).find({
    where: { campaignId },
    relations: ['segment'],
    order: { createdAt: 'DESC' }
  });
}

export async function listCampaignLogs(sendId: string) {
  return AppDataSource.getRepository(CampaignLog).find({
    where: { campaignSendId: sendId },
    relations: ['customer'],
    order: { eventTimestamp: 'DESC' },
    take: 500
  });
}

/**
 * Execute a campaign send against a segment (or all marketing-opted customers).
 * Records campaign_logs per recipient. Does not call external ESP — marks as sent
 * for operational tracking (production-ready audit trail; ESP integration is optional later).
 */
export async function executeCampaignSend(opts: {
  campaignId: string;
  organizationId: string;
  segmentId?: string;
  sendName?: string;
  sendType?: 'email' | 'sms' | 'push';
  subject?: string;
  content?: string;
}) {
  const campaignRepo = AppDataSource.getRepository(Campaign);
  const campaign = await campaignRepo.findOne({ where: { id: opts.campaignId } });
  if (!campaign || String(campaign.organizationId) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Campaign not found'), { status: 404 });
  }

  let customers: Customer[] = [];
  let segment: Segment | null = null;

  if (opts.segmentId) {
    segment = await AppDataSource.getRepository(Segment).findOne({ where: { id: opts.segmentId } });
    if (!segment || String(segment.organizationId) !== String(opts.organizationId)) {
      throw Object.assign(new Error('Segment not found'), { status: 404 });
    }
    const members = await AppDataSource.getRepository(SegmentMember).find({
      where: { segmentId: opts.segmentId },
      relations: ['customer'],
      take: 2000
    });
    customers = members.map((m) => m.customer).filter(Boolean);
  } else {
    customers = await AppDataSource.getRepository(Customer)
      .createQueryBuilder('c')
      .where('c.organization_id = :orgId', { orgId: opts.organizationId })
      .andWhere('c.marketing_opt_in = :moi', { moi: true })
      .take(2000)
      .getMany();
  }

  const sendType =
    opts.sendType ||
    (campaign.campaignType === 'sms' ? 'sms' : campaign.campaignType === 'email' ? 'email' : 'email');

  const sendRepo = AppDataSource.getRepository(CampaignSend);
  const send = await sendRepo.save(
    sendRepo.create({
      campaignId: campaign.id,
      segmentId: segment?.id ?? null,
      sendName: opts.sendName || `${campaign.campaignName} send`,
      sendType,
      subject: opts.subject || campaign.campaignName,
      content: opts.content || campaign.description || '',
      status: 'sending',
      recipientCount: customers.length
    })
  );

  const logRepo = AppDataSource.getRepository(CampaignLog);
  let delivered = 0;
  let failed = 0;

  for (const customer of customers) {
    const hasContact =
      sendType === 'sms' ? Boolean(customer.phone) : Boolean(customer.email);
    if (!hasContact) {
      failed += 1;
      await logRepo.save(
        logRepo.create({
          campaignSendId: send.id,
          customerId: customer.id,
          email: customer.email ?? undefined,
          phone: customer.phone ?? undefined,
          status: 'failed',
          eventData: { reason: 'missing_contact' }
        } as any)
      );
      continue;
    }
    delivered += 1;
    await logRepo.save(
      logRepo.create({
        campaignSendId: send.id,
        customerId: customer.id,
        email: customer.email ?? undefined,
        phone: customer.phone ?? undefined,
        status: 'sent',
        eventData: { channel: sendType }
      } as any)
    );
  }

  send.deliveredCount = delivered;
  send.failedCount = failed;
  send.status = failed && !delivered ? 'failed' : 'sent';
  send.sentAt = new Date();
  await sendRepo.save(send);

  campaign.totalSent = Number(campaign.totalSent || 0) + customers.length;
  campaign.totalDelivered = Number(campaign.totalDelivered || 0) + delivered;
  if (campaign.status === 'draft' || campaign.status === 'scheduled') {
    campaign.status = 'active';
  }
  await campaignRepo.save(campaign);

  return {
    send,
    campaign: serializeCampaign(campaign),
    segment: segment ? serializeSegment(segment) : null,
    recipientCount: customers.length,
    delivered,
    failed
  };
}
