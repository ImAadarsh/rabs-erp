/**
 * Idempotent UK chart of accounts + VAT codes + fiscal period + settings.
 * Requires migration 018_uk_accounting.sql.
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { Organization } from '../entities/iam/Organization.js';
import { User } from '../entities/iam/User.js';
import { Role } from '../entities/iam/Role.js';
import { RoleAssignment } from '../entities/iam/RoleAssignment.js';
import { ChartOfAccounts } from '../entities/finance/ChartOfAccounts.js';
import { LedgerAccount } from '../entities/finance/LedgerAccount.js';
import { FiscalPeriod } from '../entities/finance/FiscalPeriod.js';
import { AccVatCode } from '../entities/finance/AccVatCode.js';
import { AccOrgSettings } from '../entities/finance/AccOrgSettings.js';
import { BankAccount } from '../entities/finance/BankAccount.js';

const ORG_ID = '1';

type Acct = {
  code: string;
  name: string;
  type: LedgerAccount['accountType'];
  subtype?: string;
  normal: 'debit' | 'credit';
};

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

async function ensureRole(code: string, name: string, description: string, user: User, org: Organization) {
  const roleRepo = AppDataSource.getRepository(Role);
  let role = await roleRepo.findOne({
    where: { code, organization: { id: org.id } },
    relations: ['organization']
  });
  if (!role) {
    role = await roleRepo.save(
      roleRepo.create({ organization: org, name, code, permissions: null })
    );
    try {
      await AppDataSource.query(`UPDATE roles SET description = ?, is_system = 1 WHERE id = ?`, [
        description,
        role.id
      ]);
    } catch {
      /* optional */
    }
    console.log('Created role', code);
  }
  const rows: Array<{ id: string }> = await AppDataSource.query(
    `SELECT id FROM role_assignments WHERE user_id = ? AND role_id = ? LIMIT 1`,
    [user.id, role.id]
  );
  if (!rows.length) {
    await AppDataSource.getRepository(RoleAssignment).save(
      AppDataSource.getRepository(RoleAssignment).create({ user, role } as any)
    );
    console.log('Assigned', code, 'to user', user.id);
  }
}

async function main() {
  await AppDataSource.initialize();
  const org = await AppDataSource.getRepository(Organization).findOne({ where: { id: ORG_ID } });
  if (!org) throw new Error('Organization 1 not found');

  const user = await AppDataSource.getRepository(User)
    .createQueryBuilder('u')
    .innerJoin('u.organization', 'o')
    .where('o.id = :oid', { oid: ORG_ID })
    .orderBy('u.id', 'ASC')
    .getOne();
  if (!user) {
    const anyUser = await AppDataSource.getRepository(User).find({ take: 1, order: { id: 'ASC' } });
    if (!anyUser[0]) throw new Error('No user found to assign ACCOUNTANT role');
    console.warn('No user linked to org 1 — assigning roles to user', anyUser[0].id);
  }
  const roleUser = user || (await AppDataSource.getRepository(User).find({ take: 1, order: { id: 'ASC' } }))[0];

  await ensureRole(
    'ACCOUNTANT',
    'Accountant',
    'UK accounting: journals, VAT, invoices, bills, reports',
    roleUser,
    org
  );
  await ensureRole('FINANCE', 'Finance', 'Finance module access', roleUser, org);

  const coaRepo = AppDataSource.getRepository(ChartOfAccounts);
  let coa = await coaRepo.findOne({
    where: { organization: { id: org.id }, isDefault: true },
    relations: ['organization']
  });
  if (!coa) {
    coa = await coaRepo.save(
      coaRepo.create({
        organization: org,
        name: 'UK Standard Chart of Accounts',
        isDefault: true,
        status: 'active'
      })
    );
    console.log('Created default UK COA', coa.id);
  }

  const laRepo = AppDataSource.getRepository(LedgerAccount);
  for (const a of UK_ACCOUNTS) {
    const existing = await laRepo
      .createQueryBuilder('la')
      .innerJoin('la.chartOfAccounts', 'coa')
      .where('coa.id = :cid', { cid: coa.id })
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
      })
    );
    console.log('Account', a.code, a.name);
  }

  const vatRepo = AppDataSource.getRepository(AccVatCode);
  for (const v of VAT_CODES) {
    const existing = await vatRepo.findOne({
      where: { organizationId: org.id, code: v.code }
    });
    if (existing) continue;
    await vatRepo.save(
      vatRepo.create({
        organizationId: org.id,
        organization: org,
        code: v.code,
        name: v.name,
        rate: v.rate,
        isRecoverable: true,
        boxSales: v.boxSales,
        boxPurchases: v.boxPurchases,
        isSystem: true,
        isActive: true
      })
    );
    console.log('VAT code', v.code);
  }

  const settingsRepo = AppDataSource.getRepository(AccOrgSettings);
  let settings = await settingsRepo.findOne({ where: { organizationId: org.id } });
  if (!settings) {
    settings = await settingsRepo.save(
      settingsRepo.create({
        organizationId: org.id,
        organization: org,
        vatRegistered: true,
        vatScheme: 'standard',
        cashAccountingEnabled: false,
        flatRateEnabled: false,
        defaultCurrency: 'GBP',
        financialYearStartMonth: 4,
        hmrcMtdEnabled: false,
        notes: 'MTD support + export only until HMRC credentials configured'
      })
    );
    console.log('Created org accounting settings');
  }

  const year = new Date().getFullYear();
  const fpRepo = AppDataSource.getRepository(FiscalPeriod);
  const existingFp = await fpRepo.findOne({
    where: { organization: { id: org.id }, fiscalYear: year, periodType: 'year' }
  });
  if (!existingFp) {
    await fpRepo.save(
      fpRepo.create({
        organization: org,
        periodName: `FY ${year}`,
        periodType: 'year',
        startDate: new Date(`${year}-01-01`),
        endDate: new Date(`${year}-12-31`),
        fiscalYear: year,
        isClosed: false
      })
    );
    console.log('Created fiscal year', year);
  }

  const bankCode = await laRepo
    .createQueryBuilder('la')
    .innerJoin('la.chartOfAccounts', 'coa')
    .where('coa.id = :cid', { cid: coa.id })
    .andWhere('la.account_code = :code', { code: '1000' })
    .getOne();
  const bankRepo = AppDataSource.getRepository(BankAccount);
  const existingBank = await bankRepo.findOne({
    where: { organization: { id: org.id }, isDefault: true } as any
  });
  if (!existingBank && bankCode) {
    await bankRepo.save(
      bankRepo.create({
        organization: org,
        accountName: 'Main Current Account',
        bankName: 'Demo Bank UK',
        accountNumber: '12345678',
        currency: 'GBP',
        currentBalance: 0,
        ledgerAccount: bankCode,
        isDefault: true,
        status: 'active'
      })
    );
    console.log('Created default bank account');
  }

  await AppDataSource.destroy();
  console.log('UK accounting seed complete.');
}

main().catch(async (err) => {
  console.error(err);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
