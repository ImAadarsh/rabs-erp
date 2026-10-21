import { In, IsNull, Not } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { Employee } from '@entities/hr/Employee.js';
import { HrLeavePolicy } from '@entities/hr/HrLeavePolicy.js';
import { HrLeaveBalance } from '@entities/hr/HrLeaveBalance.js';
import { LeaveRequest } from '@entities/hr/LeaveRequest.js';

/** UK statutory minimum (5.6 weeks) used when an organisation has no leave policy configured. */
const DEFAULT_ENTITLEMENT_DAYS = 28;

export type ComputedLeaveBalance = {
  id: string;
  balanceId: string | null;
  employeeId: string;
  employee: Employee;
  leavePolicyId: string | null;
  leavePolicy: HrLeavePolicy | null;
  policyName: string;
  leaveType: string;
  year: number;
  leaveYearStart: string;
  leaveYearEnd: string;
  entitledDays: number;
  carriedDays: number;
  usedDays: number;
  pendingDays: number;
  remainingDays: number;
};

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Live balances: entitlement (+ carried) minus approved leave whose start date falls in the leave
 * year (calendar year, matching how approvals bucket balances). Stored used/pending counters are
 * ignored because requests created without a policy never update them.
 */
export async function computeLeaveBalances(opts: {
  orgId?: string;
  employeeId?: string;
  year?: number;
}): Promise<ComputedLeaveBalance[]> {
  const year = opts.year || new Date().getFullYear();
  const from = `${year}-01-01`;
  const to = `${year}-12-31`;

  const empRepo = AppDataSource.getRepository(Employee);
  const employees = opts.employeeId
    ? await empRepo.find({
        where: { id: opts.employeeId, deletedAt: IsNull() },
        relations: ['organization']
      })
    : opts.orgId
      ? await empRepo.find({
          where: { organization: { id: opts.orgId }, deletedAt: IsNull(), status: Not('terminated') },
          relations: ['organization'],
          order: { firstName: 'ASC' }
        })
      : [];
  if (!employees.length) return [];

  const orgIds = [...new Set(employees.map((e) => String(e.organization?.id)).filter(Boolean))];
  const policies = orgIds.length
    ? await AppDataSource.getRepository(HrLeavePolicy).find({
        where: { organizationId: In(orgIds), isActive: true } as any,
        order: { name: 'ASC' }
      })
    : [];

  const empIds = employees.map((e) => e.id);
  const stored = await AppDataSource.getRepository(HrLeaveBalance).find({
    where: { employeeId: In(empIds), year }
  });
  const storedByKey = new Map(stored.map((b) => [`${b.employeeId}|${b.leavePolicyId}`, b]));

  const sums: Array<{
    employeeId: string;
    leaveType: string;
    leavePolicyId: string | null;
    status: string;
    days: string;
  }> = await AppDataSource.getRepository(LeaveRequest)
    .createQueryBuilder('lr')
    .select('lr.employee_id', 'employeeId')
    .addSelect('lr.leave_type', 'leaveType')
    .addSelect('lr.leave_policy_id', 'leavePolicyId')
    .addSelect('lr.status', 'status')
    .addSelect('SUM(lr.total_days)', 'days')
    .where('lr.employee_id IN (:...empIds)', { empIds })
    .andWhere('lr.status IN (:...statuses)', { statuses: ['approved', 'pending'] })
    .andWhere('lr.start_date BETWEEN :from AND :to', { from, to })
    .groupBy('lr.employee_id')
    .addGroupBy('lr.leave_type')
    .addGroupBy('lr.leave_policy_id')
    .addGroupBy('lr.status')
    .getRawMany();

  const out: ComputedLeaveBalance[] = [];
  for (const emp of employees) {
    const empPolicies = policies.filter((p) => String(p.organizationId) === String(emp.organization?.id));
    const targets: Array<HrLeavePolicy | null> = empPolicies.length ? empPolicies : [null];
    for (const policy of targets) {
      const leaveType = policy?.leaveType ?? 'vacation';
      const matching = sums.filter(
        (s) =>
          String(s.employeeId) === String(emp.id) &&
          (s.leavePolicyId
            ? policy != null && String(s.leavePolicyId) === String(policy.id)
            : s.leaveType === leaveType)
      );
      const usedDays = round2(matching.filter((s) => s.status === 'approved').reduce((a, s) => a + Number(s.days || 0), 0));
      const pendingDays = round2(matching.filter((s) => s.status === 'pending').reduce((a, s) => a + Number(s.days || 0), 0));
      const bal = policy ? storedByKey.get(`${emp.id}|${policy.id}`) : undefined;
      const entitledDays = Number(bal?.entitledDays ?? policy?.entitlementDays ?? DEFAULT_ENTITLEMENT_DAYS);
      const carriedDays = Number(bal?.carriedDays ?? 0);
      out.push({
        id: bal?.id ?? `${emp.id}-${policy?.id ?? 'default'}-${year}`,
        balanceId: bal?.id ?? null,
        employeeId: emp.id,
        employee: emp,
        leavePolicyId: policy?.id ?? null,
        leavePolicy: policy,
        policyName: policy?.name ?? 'Annual leave',
        leaveType,
        year,
        leaveYearStart: from,
        leaveYearEnd: to,
        entitledDays: round2(entitledDays),
        carriedDays: round2(carriedDays),
        usedDays,
        pendingDays,
        remainingDays: round2(entitledDays + carriedDays - usedDays)
      });
    }
  }
  return out;
}
