import { AppDataSource } from '@config/data-source.js';
import { PayrollRun } from '@entities/hr/PayrollRun.js';
import { PayrollLine } from '@entities/hr/PayrollLine.js';
import { HrPayslip } from '@entities/hr/HrPayslip.js';
import {
  createPostedJournal,
  resolveAccountByCode
} from './journalPosting.service.js';
import { appendAccAudit } from './accAudit.service.js';
import { roundMoney } from './vatCalc.service.js';

/**
 * Post HR payroll run → double-entry journal:
 * Dr Wages expense (gross)
 * Dr Employer NI expense
 * Dr Employer pension expense
 *   Cr PAYE control
 *   Cr Employee NI control
 *   Cr Pension control (employee + employer)
 *   Cr Net pay control
 *   Cr Employer NI control (liability until paid)
 */
export async function postPayrollRunToLedger(
  payrollRunId: string,
  actorUserId?: string | null
): Promise<{ payrollRun: PayrollRun; journalEntryId: string }> {
  return AppDataSource.transaction(async (em) => {
    const runRepo = em.getRepository(PayrollRun);
    const run = await runRepo.findOne({
      where: { id: payrollRunId },
      relations: ['organization', 'payrollLines', 'journalEntry']
    });
    if (!run) throw new Error('Payroll run not found');
    if (run.postedToLedger || run.journalEntry) {
      throw new Error('Payroll run already posted to ledger');
    }
    if (!['calculated', 'approved', 'paid', 'posted'].includes(run.status)) {
      throw new Error('Payroll run must be calculated/approved before ledger posting');
    }

    const orgId = run.organization.id;
    const lines =
      run.payrollLines?.length
        ? run.payrollLines
        : await em.getRepository(PayrollLine).find({ where: { payrollRun: { id: run.id } } });

    let gross = 0;
    let paye = 0;
    let empNi = 0;
    let pensionEmp = 0;
    let otherDed = 0;
    let employerNi = 0;
    let employerPension = 0;
    let net = 0;

    for (const line of lines) {
      gross += Number(line.grossPay) || 0;
      paye += Number(line.taxDeduction) || 0;
      empNi += Number(line.nationalInsurance) || 0;
      pensionEmp += Number(line.pensionDeduction) || 0;
      otherDed += Number(line.otherDeductions) || 0;
      employerNi += Number(line.employerNi) || 0;
      employerPension += Number(line.employerPension) || 0;
      net += Number(line.netPay) || 0;
    }

    if (lines.length === 0) {
      gross = Number(run.totalGross) || 0;
      net = Number(run.totalNet) || 0;
      const ded = Number(run.totalDeductions) || 0;
      paye = roundMoney(ded * 0.6);
      empNi = roundMoney(ded * 0.3);
      pensionEmp = roundMoney(ded - paye - empNi);
      employerNi = Number(run.totalEmployerCosts) || 0;
    }

    gross = roundMoney(gross);
    paye = roundMoney(paye);
    empNi = roundMoney(empNi);
    pensionEmp = roundMoney(pensionEmp);
    otherDed = roundMoney(otherDed);
    employerNi = roundMoney(employerNi);
    employerPension = roundMoney(employerPension);
    net = roundMoney(net || gross - paye - empNi - pensionEmp - otherDed);

    const codes: Record<string, string> = {
      wages: '6000',
      employerNiExp: '6100',
      pensionExp: '6200',
      paye: '2200',
      empNiCtrl: '2210',
      employerNiCtrl: '2220',
      netPay: '2230',
      pensionCtrl: '2240'
    };

    const accounts: Record<string, string> = {};
    for (const [key, code] of Object.entries(codes)) {
      const acct = await resolveAccountByCode(orgId, code, em);
      if (!acct) throw new Error(`Missing UK COA account ${code} — run seed:accounting`);
      accounts[key] = acct.id;
    }

    const journalLines = [
      { ledgerAccountId: accounts.wages, description: 'Gross wages', debitAmount: gross, creditAmount: 0 },
      {
        ledgerAccountId: accounts.employerNiExp,
        description: 'Employer NI expense',
        debitAmount: employerNi,
        creditAmount: 0
      },
      {
        ledgerAccountId: accounts.pensionExp,
        description: 'Employer pension expense',
        debitAmount: employerPension,
        creditAmount: 0
      },
      { ledgerAccountId: accounts.paye, description: 'PAYE control', debitAmount: 0, creditAmount: paye },
      {
        ledgerAccountId: accounts.empNiCtrl,
        description: 'Employee NI control',
        debitAmount: 0,
        creditAmount: empNi
      },
      {
        ledgerAccountId: accounts.employerNiCtrl,
        description: 'Employer NI control',
        debitAmount: 0,
        creditAmount: employerNi
      },
      {
        ledgerAccountId: accounts.pensionCtrl,
        description: 'Pension control',
        debitAmount: 0,
        creditAmount: roundMoney(pensionEmp + employerPension)
      },
      {
        ledgerAccountId: accounts.netPay,
        description: 'Net pay control',
        debitAmount: 0,
        creditAmount: roundMoney(net + otherDed)
      }
    ];

    // Rebalance net pay line if other deductions already split — ensure balance
    const deb = journalLines.reduce((s, l) => s + l.debitAmount, 0);
    const cred = journalLines.reduce((s, l) => s + l.creditAmount, 0);
    if (Math.abs(deb - cred) > 0.01) {
      const netLine = journalLines.find((l) => l.ledgerAccountId === accounts.netPay)!;
      netLine.creditAmount = roundMoney(netLine.creditAmount + (deb - cred));
    }

    const entryDate =
      run.paymentDate instanceof Date
        ? run.paymentDate.toISOString().slice(0, 10)
        : String(run.paymentDate).slice(0, 10);

    const journal = await createPostedJournal(
      {
        organizationId: orgId,
        entryDate,
        description: `Payroll ${run.payrollNumber}`,
        reference: run.payrollNumber,
        sourceType: 'payroll',
        sourceId: run.id,
        lines: journalLines,
        postedByUserId: actorUserId
      },
      em
    );

    run.postedToLedger = true;
    run.journalEntry = journal;
    run.status = 'posted';
    await runRepo.save(run);

    await appendAccAudit({
      organizationId: orgId,
      entityType: 'payroll_run',
      entityId: run.id,
      action: 'post',
      actorUserId: actorUserId,
      payload: { journalEntryId: journal.id, gross, net, paye, empNi }
    });

    return { payrollRun: run, journalEntryId: journal.id };
  });
}

export async function listPayslipsForAccounting(organizationId: string, payrollRunId?: string) {
  const qb = AppDataSource.getRepository(HrPayslip)
    .createQueryBuilder('p')
    .leftJoinAndSelect('p.employee', 'e')
    .leftJoinAndSelect('p.payrollRun', 'r')
    .leftJoin('e.organization', 'org')
    .where('org.id = :orgId', { orgId: organizationId })
    .orderBy('p.created_at', 'DESC')
    .take(200);
  if (payrollRunId) {
    qb.andWhere('p.payroll_run_id = :rid', { rid: payrollRunId });
  }
  return qb.getMany();
}
