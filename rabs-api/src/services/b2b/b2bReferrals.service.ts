import { AppDataSource } from '@config/data-source.js';
import { B2bReferral } from '@entities/b2b/B2bReferral.js';
import { Customer } from '@entities/orders/Customer.js';
import { getOrCreateB2bSettings } from './b2bCatalog.service.js';

function makeCode(customer: Customer): string {
  const base = (customer.companyName || customer.customerNumber || customer.id)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 18);
  return `ABS-REF-${base || customer.id}`;
}

export async function getOrCreateReferral(opts: { orgId: string; customerId: string }) {
  const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: opts.customerId } });
  if (!customer) throw Object.assign(new Error('Retailer not found'), { status: 404 });
  const settings = await getOrCreateB2bSettings(opts.orgId);
  const repo = AppDataSource.getRepository(B2bReferral);
  let referral = await repo.findOne({
    where: { organization: { id: opts.orgId }, referrerCustomer: { id: opts.customerId }, status: 'active' }
  });
  if (!referral) {
    let code = makeCode(customer);
    const clash = await repo.findOne({ where: { organization: { id: opts.orgId }, code } });
    if (clash) code = `${code}-${customer.id.slice(-4)}`;
    referral = await repo.save(
      repo.create({
        organization: { id: opts.orgId } as any,
        referrerCustomer: customer,
        code,
        status: 'active',
        rewardAmount: Number(settings.referralRewardAmount || 100)
      })
    );
  }
  return {
    id: referral.id,
    code: referral.code,
    status: referral.status,
    rewardAmount: Number(referral.rewardAmount),
    inviteUrl: `/join?ref=${encodeURIComponent(referral.code)}`,
    referredEmail: referral.referredEmail,
    referredCompany: referral.referredCompany
  };
}

export async function createReferralInvite(opts: {
  orgId: string;
  customerId: string;
  referredEmail?: string;
  referredCompany?: string;
}) {
  const base = await getOrCreateReferral(opts);
  const repo = AppDataSource.getRepository(B2bReferral);
  const referral = await repo.findOne({ where: { id: base.id } });
  if (!referral) throw Object.assign(new Error('Referral not found'), { status: 404 });
  if (opts.referredEmail) referral.referredEmail = opts.referredEmail.toLowerCase();
  if (opts.referredCompany) referral.referredCompany = opts.referredCompany;
  if (opts.referredEmail || opts.referredCompany) referral.status = 'pending';
  await repo.save(referral);
  return getOrCreateReferral(opts);
}

export async function listReferrals(customerId: string) {
  return AppDataSource.getRepository(B2bReferral).find({
    where: { referrerCustomer: { id: customerId } },
    order: { createdAt: 'DESC' }
  });
}

export async function adminListReferrals(organizationId: string) {
  return AppDataSource.getRepository(B2bReferral).find({
    where: { organization: { id: organizationId } },
    relations: ['referrerCustomer'],
    order: { createdAt: 'DESC' },
    take: 200
  });
}

export async function adminUpdateReferral(opts: {
  organizationId: string;
  id: string;
  status: B2bReferral['status'];
  notes?: string;
}) {
  const repo = AppDataSource.getRepository(B2bReferral);
  const row = await repo.findOne({ where: { id: opts.id }, relations: ['organization'] });
  if (!row || row.organization.id !== opts.organizationId) {
    throw Object.assign(new Error('Referral not found'), { status: 404 });
  }
  row.status = opts.status;
  if (opts.notes !== undefined) row.notes = opts.notes;
  if (opts.status === 'rewarded') row.rewardedAt = new Date();
  return repo.save(row);
}
