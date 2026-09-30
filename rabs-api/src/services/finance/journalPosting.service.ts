import { EntityManager } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { JournalEntry } from '@entities/finance/JournalEntry.js';
import { JournalLine } from '@entities/finance/JournalLine.js';
import { LedgerAccount } from '@entities/finance/LedgerAccount.js';
import { FiscalPeriod } from '@entities/finance/FiscalPeriod.js';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { roundMoney } from './vatCalc.service.js';

export type JournalLineInput = {
  ledgerAccountId: string;
  description?: string | null;
  debitAmount?: number;
  creditAmount?: number;
};

export type CreatePostedJournalInput = {
  organizationId: string;
  fiscalPeriodId?: string | null;
  entryDate: string | Date;
  description?: string | null;
  reference?: string | null;
  sourceType?: JournalEntry['sourceType'];
  sourceId?: string | null;
  entryType?: JournalEntry['entryType'];
  lines: JournalLineInput[];
  postedByUserId?: string | null;
  journalNumber?: string;
};

function toDateOnly(d: string | Date): Date {
  if (typeof d === 'string') return new Date(d.slice(0, 10));
  return d;
}

export async function findOpenFiscalPeriod(
  organizationId: string,
  entryDate: Date,
  manager?: EntityManager
): Promise<FiscalPeriod | null> {
  const repo = (manager ?? AppDataSource).getRepository(FiscalPeriod);
  const dateStr =
    entryDate instanceof Date
      ? entryDate.toISOString().slice(0, 10)
      : String(entryDate).slice(0, 10);
  return repo
    .createQueryBuilder('fp')
    .where('fp.organization_id = :orgId', { orgId: organizationId })
    .andWhere('fp.is_closed = 0')
    .andWhere('fp.start_date <= :d', { d: dateStr })
    .andWhere('fp.end_date >= :d', { d: dateStr })
    .orderBy('fp.start_date', 'DESC')
    .getOne();
}

export async function resolveAccountByCode(
  organizationId: string,
  accountCode: string,
  manager?: EntityManager
): Promise<LedgerAccount | null> {
  const repo = (manager ?? AppDataSource).getRepository(LedgerAccount);
  return repo
    .createQueryBuilder('la')
    .innerJoin('la.chartOfAccounts', 'coa')
    .where('coa.organization_id = :orgId', { orgId: organizationId })
    .andWhere('la.account_code = :code', { code: accountCode })
    .andWhere('la.is_active = 1')
    .getOne();
}

/** Creates a balanced posted journal. Throws if debits ≠ credits. */
export async function createPostedJournal(
  input: CreatePostedJournalInput,
  manager?: EntityManager
): Promise<JournalEntry> {
  const run = async (em: EntityManager) => {
    const lines = input.lines.filter(
      (l) => (Number(l.debitAmount) || 0) > 0 || (Number(l.creditAmount) || 0) > 0
    );
    if (lines.length < 2) {
      throw new Error('Journal requires at least two non-zero lines');
    }
    const totalDebit = roundMoney(lines.reduce((s, l) => s + (Number(l.debitAmount) || 0), 0));
    const totalCredit = roundMoney(lines.reduce((s, l) => s + (Number(l.creditAmount) || 0), 0));
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error(
        `Journal must balance: debits ${totalDebit} ≠ credits ${totalCredit}`
      );
    }

    const org = await em.getRepository(Organization).findOne({ where: { id: input.organizationId } });
    if (!org) throw new Error('Organization not found');

    const entryDate = toDateOnly(input.entryDate);
    let fiscalPeriod: FiscalPeriod | null = null;
    if (input.fiscalPeriodId) {
      fiscalPeriod = await em.getRepository(FiscalPeriod).findOne({
        where: { id: input.fiscalPeriodId }
      });
    } else {
      fiscalPeriod = await findOpenFiscalPeriod(input.organizationId, entryDate, em);
    }
    if (!fiscalPeriod) {
      throw new Error('No open fiscal period covers the entry date — create one first');
    }

    const journalNumber =
      input.journalNumber ||
      `JE-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 999)
        .toString()
        .padStart(3, '0')}`;

    let postedBy: User | null = null;
    if (input.postedByUserId) {
      postedBy = await em.getRepository(User).findOne({ where: { id: input.postedByUserId } });
    }

    const jeRepo = em.getRepository(JournalEntry);
    const jlRepo = em.getRepository(JournalLine);
    const laRepo = em.getRepository(LedgerAccount);

    const entry = await jeRepo.save(
      jeRepo.create({
        organization: org,
        fiscalPeriod,
        journalNumber,
        entryDate,
        entryType: input.entryType ?? 'standard',
        sourceType: input.sourceType ?? 'manual',
        sourceId: input.sourceId ?? null,
        description: input.description ?? null,
        reference: input.reference ?? null,
        status: 'posted',
        postedBy,
        postedAt: new Date(),
        createdBy: postedBy
      })
    );

    let lineNumber = 1;
    for (const line of lines) {
      const account = await laRepo.findOne({ where: { id: line.ledgerAccountId } });
      if (!account) throw new Error(`Ledger account ${line.ledgerAccountId} not found`);
      await jlRepo.save(
        jlRepo.create({
          journalEntry: entry,
          ledgerAccount: account,
          costCenter: null,
          lineNumber: lineNumber++,
          description: line.description ?? null,
          debitAmount: roundMoney(Number(line.debitAmount) || 0),
          creditAmount: roundMoney(Number(line.creditAmount) || 0),
          currency: 'GBP',
          exchangeRate: 1
        })
      );
    }

    return (await jeRepo.findOne({
      where: { id: entry.id },
      relations: ['journalLines', 'journalLines.ledgerAccount', 'fiscalPeriod']
    }))!;
  };

  if (manager) return run(manager);
  return AppDataSource.transaction(run);
}

export async function postExistingJournal(
  journalId: string,
  userId?: string | null
): Promise<JournalEntry> {
  return AppDataSource.transaction(async (em) => {
    const repo = em.getRepository(JournalEntry);
    const entry = await repo.findOne({
      where: { id: journalId },
      relations: ['journalLines']
    });
    if (!entry) throw new Error('Journal not found');
    if (entry.status === 'posted') return entry;
    if (entry.status === 'voided') throw new Error('Cannot post a voided journal');

    const lines = entry.journalLines || [];
    const totalDebit = roundMoney(lines.reduce((s, l) => s + Number(l.debitAmount), 0));
    const totalCredit = roundMoney(lines.reduce((s, l) => s + Number(l.creditAmount), 0));
    if (Math.abs(totalDebit - totalCredit) > 0.01) {
      throw new Error('Journal must balance before posting');
    }

    let postedBy: User | null = null;
    if (userId) {
      postedBy = await em.getRepository(User).findOne({ where: { id: userId } });
    }
    entry.status = 'posted';
    entry.postedAt = new Date();
    entry.postedBy = postedBy;
    return repo.save(entry);
  });
}
