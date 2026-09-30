import { AppDataSource } from '@config/data-source.js';
import { MarketingEmailCampaign } from '@entities/marketing/MarketingEmailCampaign.js';
import { MarketingEmailSend } from '@entities/marketing/MarketingEmailSend.js';
import { MarketingEmailConnector } from '@entities/marketing/MarketingEmailConnector.js';
import { CrmLead } from '@entities/crm/CrmLead.js';
import { SegmentMember } from '@entities/marketing/SegmentMember.js';
import { isSmtpConfigured } from './smtpMail.service.js';
import { getDefaultConnector } from './emailConnector.service.js';
import { createDefaultEnvProvider, createEmailProvider } from './email/index.js';
import type { EmailProvider } from './email/EmailProvider.js';
import { env } from '@config/env.js';

const DEFAULT_BATCH_CAP_SMTP = 50;
const DEFAULT_BATCH_CAP_SENDGRID = 500;
const FULL_CAP_SMTP = 500;
const FULL_CAP_SENDGRID = 5000;

export function serializeEmailCampaign(c: MarketingEmailCampaign) {
  return {
    id: c.id,
    organizationId: c.organizationId,
    connectorId: c.connectorId,
    name: c.name,
    subject: c.subject,
    fromName: c.fromName,
    replyTo: c.replyTo,
    htmlBody: c.htmlBody,
    builderJson: c.builderJson,
    status: c.status,
    segmentId: c.segmentId,
    source: c.source,
    audienceType: c.audienceType ?? c.source,
    createdById: c.createdById,
    scheduledAt: c.scheduledAt,
    sentAt: c.sentAt,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt
  };
}

export function serializeEmailSend(s: MarketingEmailSend) {
  return {
    id: s.id,
    campaignId: s.campaignId,
    email: s.email,
    leadId: s.leadId,
    customerId: s.customerId,
    status: s.status,
    error: s.error,
    sentAt: s.sentAt,
    createdAt: s.createdAt
  };
}

type Recipient = { email: string; leadId?: string | null; customerId?: string | null };

function audienceOf(campaign: MarketingEmailCampaign) {
  return campaign.audienceType || campaign.source || 'crm_leads';
}

async function resolveRecipients(campaign: MarketingEmailCampaign): Promise<Recipient[]> {
  const seen = new Set<string>();
  const out: Recipient[] = [];

  const push = (r: Recipient) => {
    const email = r.email.trim().toLowerCase();
    if (!email || !email.includes('@') || seen.has(email)) return;
    seen.add(email);
    out.push({ ...r, email });
  };

  const audience = audienceOf(campaign);

  if (audience === 'segment' && campaign.segmentId) {
    const members = await AppDataSource.getRepository(SegmentMember).find({
      where: { segmentId: campaign.segmentId },
      relations: ['customer'],
      take: 5000
    });
    for (const m of members) {
      if (m.customer?.email) {
        push({ email: m.customer.email, customerId: m.customer.id });
      }
    }
  } else if (audience === 'manual') {
    // Manual campaigns expect recipients on send body.
  } else {
    const leads = await AppDataSource.getRepository(CrmLead)
      .createQueryBuilder('l')
      .where('l.organization_id = :orgId', { orgId: campaign.organizationId })
      .andWhere('l.email IS NOT NULL')
      .andWhere("l.email <> ''")
      .andWhere('l.status IN (:...statuses)', {
        statuses: ['new', 'contacted', 'qualified']
      })
      .orderBy('l.createdAt', 'DESC')
      .take(5000)
      .getMany();
    for (const lead of leads) {
      if (lead.email) push({ email: lead.email, leadId: lead.id });
    }
  }

  return out;
}

async function resolveProvider(campaign: MarketingEmailCampaign): Promise<{
  provider: EmailProvider;
  connectorId: string | null;
}> {
  if (campaign.connectorId) {
    const connector = await AppDataSource.getRepository(MarketingEmailConnector).findOne({
      where: { id: campaign.connectorId }
    });
    if (
      connector &&
      String(connector.organizationId) === String(campaign.organizationId) &&
      connector.status !== 'inactive'
    ) {
      return { provider: createEmailProvider(connector), connectorId: connector.id };
    }
  }

  const fallback = await getDefaultConnector(campaign.organizationId);
  if (fallback) {
    return { provider: createEmailProvider(fallback), connectorId: fallback.id };
  }

  return { provider: createDefaultEnvProvider(), connectorId: null };
}

/**
 * Send campaign via selected connector (SendGrid / Gmail SMTP / …).
 * Caps: SMTP 50 (full 500); SendGrid 500 (full 5000).
 */
export async function sendEmailCampaign(opts: {
  campaignId: string;
  organizationId: string;
  full?: boolean;
  cap?: number;
  emails?: string[];
  connectorId?: string;
}): Promise<{
  campaign: ReturnType<typeof serializeEmailCampaign>;
  queued: number;
  sent: number;
  failed: number;
  capped: number;
  provider: string;
  connectorId: string | null;
  smtpConfigured: boolean;
  sendgridConfigured: boolean;
}> {
  const repo = AppDataSource.getRepository(MarketingEmailCampaign);
  const campaign = await repo.findOne({ where: { id: opts.campaignId } });
  if (!campaign || String(campaign.organizationId) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Campaign not found'), { status: 404 });
  }
  if (campaign.status === 'sending') {
    throw Object.assign(new Error('Campaign is already sending'), { status: 409 });
  }

  if (opts.connectorId) {
    campaign.connectorId = opts.connectorId;
  }

  const { provider, connectorId } = await resolveProvider(campaign);
  const isSendGrid = provider.kind === 'sendgrid';
  const isSmtp = provider.kind === 'gmail_smtp';

  // Preflight: SMTP without config fails early with clear message
  if (isSmtp && !isSmtpConfigured() && !(await provider.verifyConnection()).ok) {
    throw Object.assign(
      new Error('No email provider ready. Add a SendGrid/Gmail connector or set SMTP_* / SENDGRID_API_KEY.'),
      { status: 503 }
    );
  }

  let recipients = await resolveRecipients(campaign);
  if (opts.emails?.length) {
    const allowed = new Set(opts.emails.map((e) => e.trim().toLowerCase()));
    recipients = recipients.filter((r) => allowed.has(r.email));
    if (audienceOf(campaign) === 'manual') {
      recipients = opts.emails.map((e) => ({ email: e.trim().toLowerCase() }));
    }
  }

  const defaultCap = isSendGrid ? DEFAULT_BATCH_CAP_SENDGRID : DEFAULT_BATCH_CAP_SMTP;
  const fullCap = isSendGrid ? FULL_CAP_SENDGRID : FULL_CAP_SMTP;
  const cap = opts.cap ?? (opts.full ? fullCap : defaultCap);
  const capped = recipients.slice(0, cap);

  if (!capped.length) {
    throw Object.assign(new Error('No recipients resolved for this audience'), { status: 400 });
  }

  campaign.status = 'sending';
  if (connectorId) campaign.connectorId = connectorId;
  await repo.save(campaign);

  const sendRepo = AppDataSource.getRepository(MarketingEmailSend);
  const queuedRows = await sendRepo.save(
    capped.map((r) =>
      sendRepo.create({
        campaignId: campaign.id,
        email: r.email,
        leadId: r.leadId ?? null,
        customerId: r.customerId ?? null,
        status: 'queued'
      })
    )
  );

  const rawFrom = env.SENDGRID_FROM_EMAIL || env.SMTP_FROM || env.SMTP_USER || '';
  const fromEmail = rawFrom ? (rawFrom.includes('<') ? extractEmail(rawFrom) : rawFrom) : undefined;
  const fromName = campaign.fromName || env.SENDGRID_FROM_NAME || undefined;

  const bulkResult = await provider.sendBulk({
    recipients: queuedRows.map((row) => ({
      email: row.email,
      customArgs: {
        campaignId: String(campaign.id),
        sendId: String(row.id),
        organizationId: String(campaign.organizationId)
      }
    })),
    subject: campaign.subject,
    html: campaign.htmlBody,
    from: fromEmail ? { email: fromEmail, name: fromName } : undefined,
    replyTo: campaign.replyTo || undefined,
    customArgs: {
      campaignId: String(campaign.id),
      organizationId: String(campaign.organizationId)
    }
  });

  let sent = 0;
  let failed = 0;
  const byEmail = new Map(
    (bulkResult.recipientResults || []).map((r) => [r.email.toLowerCase(), r])
  );

  for (const row of queuedRows) {
    const r = byEmail.get(row.email.toLowerCase());
    if (r?.ok) {
      row.status = 'sent';
      row.sentAt = new Date();
      row.error = null;
      sent += 1;
    } else {
      row.status = 'failed';
      row.error = (r?.error || bulkResult.error || 'send failed').slice(0, 1000);
      failed += 1;
    }
  }
  await sendRepo.save(queuedRows);

  campaign.status = failed && !sent ? 'failed' : 'sent';
  campaign.sentAt = new Date();
  await repo.save(campaign);

  return {
    campaign: serializeEmailCampaign(campaign),
    queued: capped.length,
    sent,
    failed,
    capped: capped.length,
    provider: provider.kind,
    connectorId: campaign.connectorId,
    smtpConfigured: isSmtpConfigured(),
    sendgridConfigured: Boolean(env.SENDGRID_API_KEY)
  };
}

function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/);
  return m ? m[1]! : from.trim();
}

export async function listSendsForCampaign(campaignId: string) {
  return AppDataSource.getRepository(MarketingEmailSend).find({
    where: { campaignId },
    order: { createdAt: 'DESC' },
    take: 2000
  });
}

export async function getSendStats(campaignIds: string[]) {
  if (!campaignIds.length) return new Map<string, { sent: number; failed: number; queued: number }>();
  const rows = await AppDataSource.getRepository(MarketingEmailSend)
    .createQueryBuilder('s')
    .select('s.campaign_id', 'campaignId')
    .addSelect('s.status', 'status')
    .addSelect('COUNT(*)', 'cnt')
    .where('s.campaign_id IN (:...ids)', { ids: campaignIds })
    .groupBy('s.campaign_id')
    .addGroupBy('s.status')
    .getRawMany();

  const map = new Map<string, { sent: number; failed: number; queued: number }>();
  for (const id of campaignIds) {
    map.set(String(id), { sent: 0, failed: 0, queued: 0 });
  }
  for (const r of rows) {
    const entry = map.get(String(r.campaignId))!;
    const n = Number(r.cnt) || 0;
    if (r.status === 'sent') entry.sent = n;
    else if (r.status === 'failed') entry.failed = n;
    else entry.queued = n;
  }
  return map;
}
