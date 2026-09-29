/**
 * Idempotent reference-data seed for a fresh Rabs Interiors database.
 * Creates the organization, system roles, SUPER_ADMIN user, UK chart of accounts,
 * VAT codes, CRM pipelines, customer tiers and HR leave policies. No demo data.
 *
 * Usage: SEED_ADMIN_PASSWORD='...' node dist/scripts/seedRabsReference.js
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { hashPassword } from '../utils/password.js';
import { Organization } from '../entities/iam/Organization.js';
import { BusinessUnit } from '../entities/iam/BusinessUnit.js';
import { Location } from '../entities/iam/Location.js';
import { User } from '../entities/iam/User.js';
import { Role } from '../entities/iam/Role.js';
import { RoleAssignment } from '../entities/iam/RoleAssignment.js';
import { TaxCode } from '../entities/catalog/TaxCode.js';
import { ChartOfAccounts } from '../entities/finance/ChartOfAccounts.js';
import { LedgerAccount } from '../entities/finance/LedgerAccount.js';
import { FiscalPeriod } from '../entities/finance/FiscalPeriod.js';
import { AccVatCode } from '../entities/finance/AccVatCode.js';
import { AccOrgSettings } from '../entities/finance/AccOrgSettings.js';
import { BankAccount } from '../entities/finance/BankAccount.js';
import { CrmPipeline } from '../entities/crm/CrmPipeline.js';
import { CrmStage } from '../entities/crm/CrmStage.js';
import { CustomerTier } from '../entities/crm/CustomerTier.js';
import { HrLeavePolicy } from '../entities/hr/HrLeavePolicy.js';
import { getOrCreateCrmSettings } from '../services/crm/crmSettings.service.js';

const ORG_NAME = process.env.SEED_ORG_NAME || 'Rabs Interiors';
const ORG_DOMAIN = process.env.SEED_ORG_DOMAIN || 'rabsinteriors.app';
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL || 'admin@rabsinteriors.app';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD || '';

const ROLES: Array<{ code: string; name: string; description: string | null; isSystem: boolean }> = [
  { code: 'SUPER_ADMIN', name: 'Super Administrator', description: 'System-wide full access role', isSystem: true },
  { code: 'ADMIN', name: 'Administrator', description: 'Organization administrator', isSystem: true },
  { code: 'MARKETING', name: 'Marketing', description: 'Marketing & Affiliates module access', isSystem: true },
  { code: 'SALES_REP', name: 'Sales Representative', description: 'CRM sales & account ownership', isSystem: true },
  { code: 'CUSTOMER_SERVICE', name: 'Customer Service', description: 'Customer service / CRM access', isSystem: true },
  { code: 'CS_AGENT', name: 'CS Agent', description: 'Support tickets & CRM', isSystem: true },
  { code: 'PROJECT_MANAGER', name: 'Project Manager', description: 'Project management: jobs, tasks, scheduling', isSystem: true },
  { code: 'HR_MANAGER', name: 'HR Manager', description: 'HR management: employees, leave, immigration, payroll view', isSystem: true },
  { code: 'HR_ADMIN', name: 'HR Admin', description: 'HR administration: full HR write access', isSystem: true },
  { code: 'ACCOUNTANT', name: 'Accountant', description: 'UK accounting: journals, VAT, invoices, bills, reports', isSystem: true },
  { code: 'FINANCE', name: 'Finance', description: 'Finance module access', isSystem: true },
  { code: 'WAREHOUSE_MANAGER', name: 'Warehouse Manager', description: 'Inventory & warehouse operations', isSystem: true }
];

type Acct = { code: string; name: string; type: LedgerAccount['accountType']; subtype?: string; normal: 'debit' | 'credit' };

const UK_ACCOUNTS: Acct[] = [
  { code: '1000', name: 'Bank Current Account', type: 'asset', subtype: 'bank', normal: 'debit' },
  { code: '1100', name: 'Petty Cash', type: 'asset', subtype: 'cash', normal: 'debit' },
  { code: '1200', name: 'Trade Debtors', type: 'asset', subtype: 'receivable', normal: 'debit' },
  { code: '1300', name: 'VAT Recoverable (Input)', type: 'asset', subtype: 'vat', normal: 'debit' },
  { code: '1400', name: 'Prepayments', type: 'asset', subtype: 'prepayment', normal: 'debit' },
  { code: '1500', name: 'Fixed Assets - Cost', type: 'asset', subtype: 'fixed_asset', normal: 'debit' },
  { code: '1510', name: 'Accumulated Depreciation', type: 'asset', subtype: 'contra_asset', normal: 'credit' },
  { code: '2000', name: 'Trade Creditors', type: 'liability', subtype: 'payable', normal: 'credit' },
  { code: '2100', name: 'VAT Payable (Output)', type: 'liability', subtype: 'vat', normal: 'credit' },
  { code: '2200', name: 'PAYE Control', type: 'liability', subtype: 'payroll', normal: 'credit' },
  { code: '2210', name: 'Employee NI Control', type: 'liability', subtype: 'payroll', normal: 'credit' },
  { code: '2220', name: 'Employer NI Control', type: 'liability', subtype: 'payroll', normal: 'credit' },
  { code: '2230', name: 'Net Pay Control', type: 'liability', subtype: 'payroll', normal: 'credit' },
  { code: '2240', name: 'Pension Control', type: 'liability', subtype: 'payroll', normal: 'credit' },
  { code: '3000', name: 'Share Capital', type: 'equity', subtype: 'capital', normal: 'credit' },
  { code: '3100', name: 'Retained Earnings', type: 'equity', subtype: 'retained', normal: 'credit' },
  { code: '4000', name: 'Sales Revenue', type: 'revenue', subtype: 'sales', normal: 'credit' },
  { code: '4100', name: 'Other Income', type: 'revenue', subtype: 'other', normal: 'credit' },
  { code: '5000', name: 'Cost of Sales', type: 'cost_of_goods_sold', subtype: 'cogs', normal: 'debit' },
  { code: '6000', name: 'Wages Expense', type: 'expense', subtype: 'payroll', normal: 'debit' },
  { code: '6100', name: 'Employer NI Expense', type: 'expense', subtype: 'payroll', normal: 'debit' },
  { code: '6200', name: 'Pension Expense', type: 'expense', subtype: 'payroll', normal: 'debit' },
  { code: '6300', name: 'Rent', type: 'expense', subtype: 'overhead', normal: 'debit' },
  { code: '6400', name: 'Utilities', type: 'expense', subtype: 'overhead', normal: 'debit' },
  { code: '6500', name: 'Depreciation Expense', type: 'expense', subtype: 'depreciation', normal: 'debit' },
  { code: '6600', name: 'Office & General Expenses', type: 'expense', subtype: 'overhead', normal: 'debit' },
  { code: '7000', name: 'Bank Charges', type: 'expense', subtype: 'bank', normal: 'debit' }
];

const VAT_CODES = [
  { code: 'S', name: 'Standard rated 20%', rate: 0.2, boxSales: 1, boxPurchases: 4 },
  { code: 'R', name: 'Reduced rate 5%', rate: 0.05, boxSales: 1, boxPurchases: 4 },
  { code: 'Z', name: 'Zero rated', rate: 0, boxSales: 6, boxPurchases: 7 },
  { code: 'E', name: 'Exempt', rate: 0, boxSales: null, boxPurchases: null },
  { code: 'OS', name: 'Outside scope', rate: 0, boxSales: null, boxPurchases: null },
  { code: 'RC', name: 'Reverse charge', rate: 0.2, boxSales: 1, boxPurchases: 4 }
];

const CATALOG_TAX_CODES = [
  { code: 'VAT20', name: 'VAT 20%', rate: 0.2, isDefault: true },
  { code: 'VAT5', name: 'VAT 5%', rate: 0.05, isDefault: false },
  { code: 'VAT0', name: 'Zero-rated (0%)', rate: 0, isDefault: false }
];

type StageDef = { name: string; position: number; probability: number; isWon?: boolean; isLost?: boolean };

const PIPELINES: Array<{ name: string; type: 'onboarding' | 'expansion' | 'credit'; isDefault: boolean; stages: StageDef[] }> = [
  {
    name: 'Client Onboarding',
    type: 'onboarding',
    isDefault: true,
    stages: [
      { name: 'Inquiry', position: 0, probability: 10 },
      { name: 'Qualified', position: 1, probability: 25 },
      { name: 'Site Survey', position: 2, probability: 45 },
      { name: 'Proposal', position: 3, probability: 65 },
      { name: 'Negotiation', position: 4, probability: 80 },
      { name: 'Won', position: 5, probability: 100, isWon: true },
      { name: 'Lost', position: 6, probability: 0, isLost: true }
    ]
  },
  {
    name: 'Account Expansion',
    type: 'expansion',
    isDefault: false,
    stages: [
      { name: 'Identified', position: 0, probability: 15 },
      { name: 'Discovery', position: 1, probability: 35 },
      { name: 'Quote', position: 2, probability: 55 },
      { name: 'Pilot', position: 3, probability: 75 },
      { name: 'Won', position: 4, probability: 100, isWon: true },
      { name: 'Lost', position: 5, probability: 0, isLost: true }
    ]
  },
  {
    name: 'Credit & Terms',
    type: 'credit',
    isDefault: false,
    stages: [
      { name: 'Requested', position: 0, probability: 20 },
      { name: 'Review', position: 1, probability: 40 },
      { name: 'Terms Offered', position: 2, probability: 60 },
      { name: 'Accepted', position: 3, probability: 85 },
      { name: 'Won', position: 4, probability: 100, isWon: true },
      { name: 'Lost', position: 5, probability: 0, isLost: true }
    ]
  }
];

const CUSTOMER_TIERS = [
  { tierName: 'Bronze', tierCode: 'BRONZE', discountPercent: 0, prioritySupport: false, position: 1, minLifetimeValue: 0, minOrders: 0 },
  { tierName: 'Silver', tierCode: 'SILVER', discountPercent: 5, prioritySupport: false, position: 2, minLifetimeValue: 1000, minOrders: 5 },
  { tierName: 'Gold', tierCode: 'GOLD', discountPercent: 10, prioritySupport: true, position: 3, minLifetimeValue: 5000, minOrders: 15 },
  { tierName: 'Platinum', tierCode: 'PLATINUM', discountPercent: 15, prioritySupport: true, position: 4, minLifetimeValue: 15000, minOrders: 40 }
];

const LEAVE_POLICIES: Array<{
  name: string;
  leaveType: HrLeavePolicy['leaveType'];
  entitlementDays: number;
  carriesOver: boolean;
  maxCarryDays: number | null;
  notes: string;
}> = [
  { name: 'Annual leave (UK)', leaveType: 'vacation', entitlementDays: 28, carriesOver: true, maxCarryDays: 5, notes: 'Statutory 5.6 weeks incl. bank holidays' },
  { name: 'Sick leave (SSP)', leaveType: 'sick', entitlementDays: 0, carriesOver: false, maxCarryDays: null, notes: 'Statutory Sick Pay rules apply' },
  { name: 'Maternity leave', leaveType: 'maternity', entitlementDays: 260, carriesOver: false, maxCarryDays: null, notes: 'Up to 52 weeks statutory' },
  { name: 'Paternity leave', leaveType: 'paternity', entitlementDays: 10, carriesOver: false, maxCarryDays: null, notes: 'Up to 2 weeks statutory' },
  { name: 'Bereavement leave', leaveType: 'bereavement', entitlementDays: 5, carriesOver: false, maxCarryDays: null, notes: 'Compassionate leave' },
  { name: 'Unpaid leave', leaveType: 'unpaid', entitlementDays: 0, carriesOver: false, maxCarryDays: null, notes: 'By manager approval' }
];

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;

  const orgRepo = ds.getRepository(Organization);
  let org = await orgRepo.findOne({ where: { name: ORG_NAME } as any });
  if (!org) {
    org = await orgRepo.save(
      orgRepo.create({ name: ORG_NAME, legalName: ORG_NAME, website: `https://${ORG_DOMAIN}`, status: 'active' } as any) as any
    );
    console.log('Created organization', org!.id);
  }
  const orgId = String(org!.id);

  const buRepo = ds.getRepository(BusinessUnit);
  let bu = await buRepo.findOne({ where: { organization: { id: orgId }, code: 'BU-MAIN' } as any });
  if (!bu) {
    bu = await buRepo.save(
      buRepo.create({ organization: org, code: 'BU-MAIN', name: 'Rabs Interiors', type: 'retail', status: 'active' } as any) as any
    );
    console.log('Created business unit');
  }

  const locRepo = ds.getRepository(Location);
  const existingLoc = await locRepo.findOne({ where: { businessUnit: { id: (bu as any).id } } as any });
  if (!existingLoc) {
    await locRepo.save(
      locRepo.create({
        businessUnit: bu,
        code: 'HQ',
        name: 'Head Office',
        type: 'office',
        countryCode: 'GB',
        timezone: 'Europe/London',
        isDefault: true,
        status: 'active'
      } as any)
    );
    console.log('Created head office location');
  }

  const roleRepo = ds.getRepository(Role);
  const rolesByCode = new Map<string, Role>();
  for (const r of ROLES) {
    let role = await roleRepo.findOne({ where: { code: r.code, organization: { id: orgId } } as any });
    if (!role) {
      role = (await roleRepo.save(roleRepo.create({ organization: org, name: r.name, code: r.code, permissions: null } as any))) as any;
      await ds.query('UPDATE roles SET description = ?, is_system = ? WHERE id = ?', [r.description, r.isSystem ? 1 : 0, role!.id]);
      console.log('Created role', r.code);
    }
    rolesByCode.set(r.code, role!);
  }

  const userRepo = ds.getRepository(User);
  let admin = await userRepo.findOne({ where: { email: ADMIN_EMAIL } });
  if (!admin) {
    if (ADMIN_PASSWORD.length < 12) throw new Error('Set SEED_ADMIN_PASSWORD (min 12 chars) to create the admin user');
    admin = (await userRepo.save(
      userRepo.create({
        organization: org,
        email: ADMIN_EMAIL,
        firstName: 'Rabs',
        lastName: 'Admin',
        passwordHash: await hashPassword(ADMIN_PASSWORD),
        status: 'active',
        emailVerified: true
      } as any)
    )) as any;
    console.log('Created admin user', ADMIN_EMAIL);
  }
  const raRepo = ds.getRepository(RoleAssignment);
  for (const code of ['SUPER_ADMIN', 'ADMIN']) {
    const role = rolesByCode.get(code)!;
    const rows: Array<{ id: string }> = await ds.query(
      'SELECT id FROM role_assignments WHERE user_id = ? AND role_id = ? LIMIT 1',
      [admin!.id, role.id]
    );
    if (!rows.length) {
      await raRepo.save(raRepo.create({ user: admin, role } as any));
      console.log('Assigned', code, 'to', ADMIN_EMAIL);
    }
  }

  const taxRepo = ds.getRepository(TaxCode);
  for (const t of CATALOG_TAX_CODES) {
    const existing = await taxRepo.findOne({ where: { organization: { id: orgId }, code: t.code } as any });
    if (existing) continue;
    await taxRepo.save(
      taxRepo.create({ organization: org, code: t.code, name: t.name, rate: t.rate, countryCode: 'GB', isDefault: t.isDefault, status: 'active' } as any)
    );
    console.log('Tax code', t.code);
  }

  const coaRepo = ds.getRepository(ChartOfAccounts);
  let coa = await coaRepo.findOne({ where: { organization: { id: orgId }, isDefault: true } as any });
  if (!coa) {
    coa = (await coaRepo.save(
      coaRepo.create({ organization: org, name: 'UK Standard Chart of Accounts', isDefault: true, status: 'active' } as any)
    )) as any;
    console.log('Created default UK COA');
  }
  const laRepo = ds.getRepository(LedgerAccount);
  for (const a of UK_ACCOUNTS) {
    const existing = await laRepo
      .createQueryBuilder('la')
      .innerJoin('la.chartOfAccounts', 'coa')
      .where('coa.id = :cid', { cid: coa!.id })
      .andWhere('la.account_code = :code', { code: a.code })
      .getOne();
    if (existing) continue;
    await laRepo.save(
      laRepo.create({
        chartOfAccounts: coa,
        accountCode: a.code,
        accountName: a.name,
        accountType: a.type,
        accountSubtype: a.subtype ?? null,
        normalBalance: a.normal,
        isSystem: true,
        isActive: true,
        description: `UK template ${a.code}`
      } as any)
    );
  }
  console.log('Ledger accounts ready:', UK_ACCOUNTS.length);

  const vatRepo = ds.getRepository(AccVatCode);
  for (const v of VAT_CODES) {
    const existing = await vatRepo.findOne({ where: { organizationId: orgId, code: v.code } as any });
    if (existing) continue;
    await vatRepo.save(
      vatRepo.create({
        organizationId: orgId,
        organization: org,
        code: v.code,
        name: v.name,
        rate: v.rate,
        isRecoverable: true,
        boxSales: v.boxSales,
        boxPurchases: v.boxPurchases,
        isSystem: true,
        isActive: true
      } as any)
    );
  }
  console.log('VAT codes ready:', VAT_CODES.length);

  const settingsRepo = ds.getRepository(AccOrgSettings);
  if (!(await settingsRepo.findOne({ where: { organizationId: orgId } as any }))) {
    await settingsRepo.save(
      settingsRepo.create({
        organizationId: orgId,
        organization: org,
        vatRegistered: true,
        vatScheme: 'standard',
        cashAccountingEnabled: false,
        flatRateEnabled: false,
        defaultCurrency: 'GBP',
        financialYearStartMonth: 4,
        hmrcMtdEnabled: false,
        notes: 'MTD support + export only until HMRC credentials configured'
      } as any)
    );
    console.log('Created accounting settings');
  }

  const year = new Date().getFullYear();
  const fpRepo = ds.getRepository(FiscalPeriod);
  if (!(await fpRepo.findOne({ where: { organization: { id: orgId }, fiscalYear: year, periodType: 'year' } as any }))) {
    await fpRepo.save(
      fpRepo.create({
        organization: org,
        periodName: `FY ${year}`,
        periodType: 'year',
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        fiscalYear: year,
        isClosed: false
      } as any)
    );
    console.log('Created fiscal year', year);
  }

  const bankLedger = await laRepo
    .createQueryBuilder('la')
    .innerJoin('la.chartOfAccounts', 'coa')
    .where('coa.id = :cid', { cid: coa!.id })
    .andWhere('la.account_code = :code', { code: '1000' })
    .getOne();
  const bankRepo = ds.getRepository(BankAccount);
  if (bankLedger && !(await bankRepo.findOne({ where: { organization: { id: orgId }, isDefault: true } as any }))) {
    await bankRepo.save(
      bankRepo.create({
        organization: org,
        accountName: 'Main Current Account',
        bankName: 'To be configured',
        accountNumber: null,
        currency: 'GBP',
        currentBalance: 0,
        ledgerAccount: bankLedger,
        isDefault: true,
        status: 'active'
      } as any)
    );
    console.log('Created default bank account placeholder');
  }

  const pipeRepo = ds.getRepository(CrmPipeline);
  const stageRepo = ds.getRepository(CrmStage);
  for (const p of PIPELINES) {
    let pipeline = await pipeRepo.findOne({ where: { organizationId: orgId, name: p.name } as any });
    if (!pipeline) {
      pipeline = (await pipeRepo.save(pipeRepo.create({ organizationId: orgId, name: p.name, type: p.type, isDefault: p.isDefault } as any))) as any;
      console.log('Created pipeline', p.name);
    }
    for (const s of p.stages) {
      if (await stageRepo.findOne({ where: { pipelineId: pipeline!.id, name: s.name } as any })) continue;
      await stageRepo.save(
        stageRepo.create({
          pipelineId: pipeline!.id,
          name: s.name,
          position: s.position,
          probability: s.probability,
          isWon: s.isWon ?? false,
          isLost: s.isLost ?? false
        } as any)
      );
    }
  }

  const tierRepo = ds.getRepository(CustomerTier);
  for (const t of CUSTOMER_TIERS) {
    const existing = await tierRepo
      .createQueryBuilder('t')
      .innerJoin('t.organization', 'o')
      .where('o.id = :orgId', { orgId })
      .andWhere('t.tierCode = :code', { code: t.tierCode })
      .getOne();
    if (existing) continue;
    await tierRepo.save(tierRepo.create({ organization: org, ...t, isActive: true } as any));
  }
  console.log('Customer tiers ready:', CUSTOMER_TIERS.length);

  await getOrCreateCrmSettings(orgId);

  const policyRepo = ds.getRepository(HrLeavePolicy);
  for (const lp of LEAVE_POLICIES) {
    if (await policyRepo.findOne({ where: { organizationId: orgId, name: lp.name } as any })) continue;
    await policyRepo.save(policyRepo.create({ organizationId: orgId, ...lp, isActive: true } as any));
  }
  console.log('Leave policies ready:', LEAVE_POLICIES.length);

  await ds.destroy();
  console.log('Rabs Interiors reference seed complete. Organization id:', orgId);
}

main().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
