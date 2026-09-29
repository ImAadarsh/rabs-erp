import { AppDataSource } from '@config/data-source.js';
import { Segment } from '@entities/marketing/Segment.js';
import { SegmentMember } from '@entities/marketing/SegmentMember.js';
import { Customer } from '@entities/orders/Customer.js';
import { slugCode } from './marketingScope.js';

export async function listSegmentMembers(segmentId: string) {
  return AppDataSource.getRepository(SegmentMember).find({
    where: { segmentId },
    relations: ['customer'],
    order: { addedAt: 'DESC' },
    take: 500
  });
}

export async function addSegmentMembers(opts: {
  segmentId: string;
  organizationId: string;
  customerIds: string[];
}) {
  const seg = await AppDataSource.getRepository(Segment).findOne({ where: { id: opts.segmentId } });
  if (!seg || String(seg.organizationId) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Segment not found'), { status: 404 });
  }

  const customers = await AppDataSource.getRepository(Customer)
    .createQueryBuilder('c')
    .where('c.id IN (:...ids)', { ids: opts.customerIds })
    .andWhere('c.organization_id = :orgId', { orgId: opts.organizationId })
    .getMany();
  if (!customers.length) {
    throw Object.assign(new Error('No valid customers found for this organization'), { status: 400 });
  }

  const memberRepo = AppDataSource.getRepository(SegmentMember);
  const existing = await memberRepo.find({ where: { segmentId: opts.segmentId } });
  const existingSet = new Set(existing.map((m) => String(m.customerId)));
  const toAdd = customers.filter((c) => !existingSet.has(String(c.id)));

  if (toAdd.length) {
    await memberRepo.save(
      toAdd.map((c) =>
        memberRepo.create({
          segmentId: opts.segmentId,
          customerId: c.id
        })
      )
    );
  }

  await refreshMemberCount(opts.segmentId);
  return listSegmentMembers(opts.segmentId);
}

export async function removeSegmentMember(opts: {
  segmentId: string;
  organizationId: string;
  customerId: string;
}) {
  const seg = await AppDataSource.getRepository(Segment).findOne({ where: { id: opts.segmentId } });
  if (!seg || String(seg.organizationId) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Segment not found'), { status: 404 });
  }
  const memberRepo = AppDataSource.getRepository(SegmentMember);
  const member = await memberRepo.findOne({
    where: { segmentId: opts.segmentId, customerId: opts.customerId }
  });
  if (!member) {
    throw Object.assign(new Error('Member not found'), { status: 404 });
  }
  await memberRepo.remove(member);
  await refreshMemberCount(opts.segmentId);
  return { id: member.id };
}

export async function refreshMemberCount(segmentId: string) {
  const count = await AppDataSource.getRepository(SegmentMember).count({ where: { segmentId } });
  await AppDataSource.getRepository(Segment).update(
    { id: segmentId },
    { customerCount: count, lastCalculatedAt: new Date() }
  );
  return count;
}

/**
 * Recalculate dynamic segment membership from filter_rules.
 * Supported rules (AND):
 *  { status?: string, marketingOptIn?: boolean, channel?: string, minOrders?: number, search?: string }
 */
export async function recalculateSegment(opts: { segmentId: string; organizationId: string }) {
  const segRepo = AppDataSource.getRepository(Segment);
  const seg = await segRepo.findOne({ where: { id: opts.segmentId } });
  if (!seg || String(seg.organizationId) !== String(opts.organizationId)) {
    throw Object.assign(new Error('Segment not found'), { status: 404 });
  }

  const rules = (seg.filterRules || {}) as Record<string, any>;
  const qb = AppDataSource.getRepository(Customer)
    .createQueryBuilder('c')
    .where('c.organization_id = :orgId', { orgId: opts.organizationId });

  if (rules.status) qb.andWhere('c.status = :status', { status: rules.status });
  if (typeof rules.marketingOptIn === 'boolean') {
    qb.andWhere('c.marketing_opt_in = :moi', { moi: rules.marketingOptIn });
  }
  if (rules.search) {
    qb.andWhere(
      '(c.email LIKE :q OR c.first_name LIKE :q OR c.last_name LIKE :q OR c.company_name LIKE :q)',
      { q: `%${rules.search}%` }
    );
  }

  // Channel filter via orders
  if (rules.channel) {
    qb.andWhere(
      `EXISTS (SELECT 1 FROM orders o WHERE o.customer_id = c.id AND o.channel = :channel)`,
      { channel: rules.channel }
    );
  }
  if (rules.minOrders != null) {
    qb.andWhere(
      `(SELECT COUNT(*) FROM orders o WHERE o.customer_id = c.id) >= :minOrders`,
      { minOrders: Number(rules.minOrders) }
    );
  }

  const customers = await qb.take(2000).getMany();
  const memberRepo = AppDataSource.getRepository(SegmentMember);

  await memberRepo.delete({ segmentId: opts.segmentId });
  if (customers.length) {
    await memberRepo.save(
      customers.map((c) =>
        memberRepo.create({
          segmentId: opts.segmentId,
          customerId: c.id
        })
      )
    );
  }

  seg.segmentType = 'dynamic';
  seg.customerCount = customers.length;
  seg.lastCalculatedAt = new Date();
  await segRepo.save(seg);
  return { segment: serializeSegment(seg), memberCount: customers.length };
}

export function serializeSegment(seg: Segment) {
  return {
    id: seg.id,
    organizationId: seg.organizationId,
    name: seg.segmentName,
    segmentName: seg.segmentName,
    segmentCode: seg.segmentCode,
    description: seg.description,
    segmentType: seg.segmentType,
    rules: seg.filterRules,
    filterRules: seg.filterRules,
    totalMembers: seg.customerCount,
    customerCount: seg.customerCount,
    isActive: seg.isActive,
    lastCalculatedAt: seg.lastCalculatedAt,
    createdAt: seg.createdAt,
    updatedAt: seg.updatedAt
  };
}

export function buildSegmentPayload(data: {
  name?: string;
  segmentName?: string;
  segmentCode?: string;
  description?: string;
  rules?: any;
  filterRules?: any;
  segmentType?: string;
  isActive?: boolean;
}) {
  const segmentName = data.segmentName || data.name;
  const filterRules = data.filterRules ?? data.rules;
  const segmentCode =
    data.segmentCode ||
    (segmentName ? `${slugCode(segmentName, 20)}-${Date.now().toString(36).toUpperCase().slice(-4)}` : undefined);
  return {
    segmentName,
    segmentCode,
    description: data.description,
    filterRules,
    segmentType: data.segmentType || (filterRules ? 'dynamic' : 'static'),
    isActive: data.isActive ?? true
  };
}
