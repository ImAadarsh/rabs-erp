import { IsNull } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { CrmLead } from '@entities/crm/CrmLead.js';
import { Segment } from '@entities/marketing/Segment.js';
import { SegmentMember } from '@entities/marketing/SegmentMember.js';
import { Customer } from '@entities/orders/Customer.js';
import { Organization } from '@entities/iam/Organization.js';
import { refreshMemberCount } from './segment.service.js';

const CRM_LEADS_SEGMENT_NAME = 'CRM Leads';
const CRM_LEADS_SEGMENT_CODE = 'CRM_LEADS';

function splitName(name: string): { firstName: string; lastName: string | null } {
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return { firstName: parts[0], lastName: null };
  return { firstName: parts[0], lastName: parts.slice(1).join(' ') };
}

/**
 * Ensure org has a static "CRM Leads" marketing segment.
 */
export async function ensureCrmLeadsSegment(organizationId: string): Promise<Segment> {
  const repo = AppDataSource.getRepository(Segment);
  let seg = await repo.findOne({
    where: { organizationId, segmentCode: CRM_LEADS_SEGMENT_CODE }
  });
  if (!seg) {
    seg = await repo.findOne({
      where: { organizationId, segmentName: CRM_LEADS_SEGMENT_NAME }
    });
  }
  if (!seg) {
    seg = await repo.save(
      repo.create({
        organizationId,
        segmentName: CRM_LEADS_SEGMENT_NAME,
        segmentCode: CRM_LEADS_SEGMENT_CODE,
        description: 'Auto-synced from CRM leads (inbound + staff sync)',
        segmentType: 'static',
        filterRules: { source: 'crm_leads' },
        customerCount: 0,
        isActive: true
      })
    );
  }
  return seg;
}

/**
 * Find or create an ERP customer for the lead email, then add to CRM Leads segment.
 */
export async function syncFromCrmLead(lead: CrmLead): Promise<{
  segmentId: string;
  customerId: string | null;
  added: boolean;
  skipped?: string;
}> {
  if (!lead.email) {
    return {
      segmentId: '',
      customerId: null,
      added: false,
      skipped: 'Lead has no email'
    };
  }

  const email = lead.email.trim().toLowerCase();
  const segment = await ensureCrmLeadsSegment(lead.organizationId);
  const customerRepo = AppDataSource.getRepository(Customer);

  let customer = await customerRepo.findOne({
    where: {
      organization: { id: lead.organizationId },
      email,
      deletedAt: IsNull()
    },
    relations: ['organization']
  });

  if (!customer) {
    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: lead.organizationId }
    });
    if (!org) {
      throw Object.assign(new Error('Organization missing'), { status: 400 });
    }
    const { firstName, lastName } = splitName(lead.name);
    customer = await customerRepo.save(
      customerRepo.create({
        organization: org,
        email,
        phone: lead.phone,
        firstName,
        lastName,
        companyName: lead.company,
        customerType: lead.company ? 'business' : 'individual',
        crmOwnerUserId: lead.ownerUserId,
        marketingOptIn: true,
        status: 'active'
      })
    );
  } else if (!customer.marketingOptIn) {
    customer.marketingOptIn = true;
    await customerRepo.save(customer);
  }

  const memberRepo = AppDataSource.getRepository(SegmentMember);
  const existing = await memberRepo.findOne({
    where: { segmentId: segment.id, customerId: customer.id }
  });
  if (existing) {
    return { segmentId: segment.id, customerId: customer.id, added: false };
  }

  await memberRepo.save(
    memberRepo.create({
      segmentId: segment.id,
      customerId: customer.id
    })
  );
  await refreshMemberCount(segment.id);

  return { segmentId: segment.id, customerId: customer.id, added: true };
}
