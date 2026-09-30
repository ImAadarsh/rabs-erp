import { AppDataSource } from '@config/data-source.js';
import { Customer } from '@entities/orders/Customer.js';
import { CustomerAddress } from '@entities/orders/CustomerAddress.js';
import { RetailerAccount } from '@entities/b2b/RetailerAccount.js';
import { B2bRetailerBuyer } from '@entities/b2b/B2bRetailerBuyer.js';
import { hashPassword, verifyPassword } from '@utils/password.js';
import { getOrCreateB2bSettings, mapCustomerToProfile } from './b2bCatalog.service.js';

export async function updateRetailerProfile(opts: {
  customerId: string;
  orgId: string;
  data: {
    companyName?: string;
    firstName?: string;
    lastName?: string;
    phone?: string;
    taxId?: string;
  };
}) {
  const repo = AppDataSource.getRepository(Customer);
  const customer = await repo.findOne({ where: { id: opts.customerId }, relations: ['addresses'] });
  if (!customer) throw Object.assign(new Error('Retailer not found'), { status: 404 });
  if (opts.data.companyName !== undefined) customer.companyName = opts.data.companyName;
  if (opts.data.firstName !== undefined) customer.firstName = opts.data.firstName;
  if (opts.data.lastName !== undefined) customer.lastName = opts.data.lastName;
  if (opts.data.phone !== undefined) customer.phone = opts.data.phone;
  if (opts.data.taxId !== undefined) customer.taxId = opts.data.taxId;
  await repo.save(customer);
  const settings = await getOrCreateB2bSettings(opts.orgId);
  const fresh = await repo.findOne({ where: { id: customer.id }, relations: ['addresses'] });
  return mapCustomerToProfile(fresh!, settings);
}

export async function changeRetailerPassword(opts: {
  retailerAccountId: string;
  currentPassword: string;
  newPassword: string;
}) {
  const repo = AppDataSource.getRepository(RetailerAccount);
  const account = await repo.findOne({ where: { id: opts.retailerAccountId } });
  if (!account) throw Object.assign(new Error('Account not found'), { status: 404 });
  const ok = await verifyPassword(opts.currentPassword, account.passwordHash);
  if (!ok) throw Object.assign(new Error('Current password is incorrect'), { status: 400 });
  account.passwordHash = await hashPassword(opts.newPassword);
  await repo.save(account);
  return { success: true };
}

export async function listBranches(customerId: string) {
  return AppDataSource.getRepository(CustomerAddress).find({
    where: { customer: { id: customerId } },
    order: { isDefault: 'DESC', createdAt: 'DESC' }
  });
}

export async function upsertBranch(opts: {
  customerId: string;
  id?: string;
  data: Partial<CustomerAddress> & {
    addressLine1: string;
    city: string;
    postalCode: string;
    countryCode: string;
  };
}) {
  const repo = AppDataSource.getRepository(CustomerAddress);
  const customer = await AppDataSource.getRepository(Customer).findOne({ where: { id: opts.customerId } });
  if (!customer) throw Object.assign(new Error('Retailer not found'), { status: 404 });

  let row: CustomerAddress | null = null;
  if (opts.id) {
    row = await repo.findOne({ where: { id: opts.id }, relations: ['customer'] });
    if (!row || row.customer.id !== opts.customerId) {
      throw Object.assign(new Error('Branch not found'), { status: 404 });
    }
  } else {
    row = repo.create({ customer });
  }

  row.addressType = (opts.data.addressType as any) || row.addressType || 'both';
  row.firstName = opts.data.firstName ?? row.firstName;
  row.lastName = opts.data.lastName ?? row.lastName;
  row.company = opts.data.company ?? row.company;
  row.addressLine1 = opts.data.addressLine1;
  row.addressLine2 = opts.data.addressLine2 ?? null;
  row.city = opts.data.city;
  row.stateProvince = opts.data.stateProvince ?? null;
  row.postalCode = opts.data.postalCode;
  row.countryCode = opts.data.countryCode;
  row.phone = opts.data.phone ?? null;
  if (opts.data.isDefault) {
    await repo.update({ customer: { id: opts.customerId } }, { isDefault: false });
    row.isDefault = true;
  }
  return repo.save(row);
}

export async function deleteBranch(customerId: string, id: string) {
  const repo = AppDataSource.getRepository(CustomerAddress);
  const row = await repo.findOne({ where: { id }, relations: ['customer'] });
  if (!row || row.customer.id !== customerId) {
    throw Object.assign(new Error('Branch not found'), { status: 404 });
  }
  await repo.remove(row);
  return { success: true };
}

export async function listBuyers(customerId: string) {
  return AppDataSource.getRepository(B2bRetailerBuyer).find({
    where: { customer: { id: customerId } },
    order: { createdAt: 'DESC' }
  });
}

export async function upsertBuyer(opts: {
  orgId: string;
  customerId: string;
  id?: string;
  data: {
    name: string;
    email: string;
    phone?: string | null;
    role?: 'buyer' | 'manager' | 'viewer';
    spendingCap?: number | null;
    status?: 'active' | 'invited' | 'disabled';
  };
}) {
  const repo = AppDataSource.getRepository(B2bRetailerBuyer);
  let row: B2bRetailerBuyer | null = null;
  if (opts.id) {
    row = await repo.findOne({ where: { id: opts.id }, relations: ['customer'] });
    if (!row || row.customer.id !== opts.customerId) {
      throw Object.assign(new Error('Buyer not found'), { status: 404 });
    }
  } else {
    row = repo.create({
      organization: { id: opts.orgId } as any,
      customer: { id: opts.customerId } as any
    });
  }
  row.name = opts.data.name;
  row.email = opts.data.email.toLowerCase();
  row.phone = opts.data.phone ?? null;
  if (opts.data.role) row.role = opts.data.role;
  if (opts.data.spendingCap !== undefined) row.spendingCap = opts.data.spendingCap;
  if (opts.data.status) row.status = opts.data.status;
  return repo.save(row);
}

export async function deleteBuyer(customerId: string, id: string) {
  const repo = AppDataSource.getRepository(B2bRetailerBuyer);
  const row = await repo.findOne({ where: { id }, relations: ['customer'] });
  if (!row || row.customer.id !== customerId) {
    throw Object.assign(new Error('Buyer not found'), { status: 404 });
  }
  await repo.remove(row);
  return { success: true };
}
