import { AppDataSource } from '@config/data-source.js';
import { CrmLead } from '@entities/crm/CrmLead.js';
import { CrmActivity } from '@entities/crm/CrmActivity.js';
import { CrmSettings } from '@entities/crm/CrmSettings.js';
import { User } from '@entities/iam/User.js';
import { getOrCreateCrmSettings } from './crmSettings.service.js';

/** Roles that can own / be assigned leads (dropdown pool). */
export const ASSIGNABLE_LEAD_ROLES = [
  'SALES_REP',
  'ADMIN',
  'SUPER_ADMIN',
  'CS_AGENT',
  'CUSTOMER_SERVICE'
] as const;

export type AssignableUserDto = {
  id: string;
  email: string;
  firstName: string | null;
  lastName: string | null;
  role: string;
};

/** Active users with SALES_REP role in the org, ordered by user id for stable RR. */
export async function listSalesRepUserIds(organizationId: string): Promise<string[]> {
  const rows: Array<{ user_id: string }> = await AppDataSource.query(
    `SELECT DISTINCT ra.user_id AS user_id
     FROM role_assignments ra
     INNER JOIN roles r ON r.id = ra.role_id
     INNER JOIN users u ON u.id = ra.user_id
     WHERE r.code = 'SALES_REP'
       AND r.organization_id = ?
       AND u.organization_id = ?
       AND u.status = 'active'
       AND u.deleted_at IS NULL
     ORDER BY ra.user_id ASC`,
    [organizationId, organizationId]
  );
  return rows.map((r) => String(r.user_id));
}

/**
 * Active org staff who can be assigned leads.
 * Prefers sales-capable roles; one row per user with their best CRM role.
 */
export async function listAssignableUsers(organizationId: string): Promise<AssignableUserDto[]> {
  const placeholders = ASSIGNABLE_LEAD_ROLES.map(() => '?').join(', ');
  const rows: Array<{
    id: string;
    email: string;
    first_name: string | null;
    last_name: string | null;
    role_code: string;
  }> = await AppDataSource.query(
    `SELECT u.id, u.email, u.first_name, u.last_name,
            MIN(CASE r.code
              WHEN 'SALES_REP' THEN 1
              WHEN 'ADMIN' THEN 2
              WHEN 'SUPER_ADMIN' THEN 3
              WHEN 'CS_AGENT' THEN 4
              WHEN 'CUSTOMER_SERVICE' THEN 5
              ELSE 9
            END) AS role_rank,
            SUBSTRING_INDEX(GROUP_CONCAT(r.code ORDER BY
              CASE r.code
                WHEN 'SALES_REP' THEN 1
                WHEN 'ADMIN' THEN 2
                WHEN 'SUPER_ADMIN' THEN 3
                WHEN 'CS_AGENT' THEN 4
                WHEN 'CUSTOMER_SERVICE' THEN 5
                ELSE 9
              END SEPARATOR ','), ',', 1) AS role_code
     FROM users u
     INNER JOIN role_assignments ra ON ra.user_id = u.id
     INNER JOIN roles r ON r.id = ra.role_id
     WHERE u.organization_id = ?
       AND r.organization_id = ?
       AND r.code IN (${placeholders})
       AND u.status = 'active'
       AND u.deleted_at IS NULL
     GROUP BY u.id, u.email, u.first_name, u.last_name
     ORDER BY role_rank ASC, u.first_name ASC, u.last_name ASC, u.email ASC`,
    [organizationId, organizationId, ...ASSIGNABLE_LEAD_ROLES]
  );

  // Fallback: any active user in org if no role-matched staff
  if (!rows.length) {
    const users = await AppDataSource.getRepository(User)
      .createQueryBuilder('u')
      .where('u.organization_id = :orgId', { orgId: organizationId })
      .andWhere('u.status = :status', { status: 'active' })
      .andWhere('u.deleted_at IS NULL')
      .orderBy('u.firstName', 'ASC')
      .addOrderBy('u.lastName', 'ASC')
      .take(50)
      .getMany();
    return users.map((u) => ({
      id: String(u.id),
      email: u.email,
      firstName: u.firstName,
      lastName: u.lastName,
      role: 'USER'
    }));
  }

  return rows.map((r) => ({
    id: String(r.id),
    email: r.email,
    firstName: r.first_name,
    lastName: r.last_name,
    role: r.role_code
  }));
}

export async function assertAssignableUser(
  organizationId: string,
  userId: string
): Promise<boolean> {
  const users = await listAssignableUsers(organizationId);
  return users.some((u) => String(u.id) === String(userId));
}

/**
 * Round-robin next SALES_REP after settings.lastAssignedUserId.
 * Updates cursor on settings when a pick is made.
 */
export async function pickRoundRobinSalesRep(
  organizationId: string,
  settings?: CrmSettings
): Promise<string | null> {
  const reps = await listSalesRepUserIds(organizationId);
  if (!reps.length) return null;

  const s = settings || (await getOrCreateCrmSettings(organizationId));
  let idx = 0;
  if (s.lastAssignedUserId) {
    const prev = reps.indexOf(String(s.lastAssignedUserId));
    idx = prev >= 0 ? (prev + 1) % reps.length : 0;
  }
  const nextId = reps[idx];
  s.lastAssignedUserId = nextId;
  await AppDataSource.getRepository(CrmSettings).save(s);
  return nextId;
}

export async function createLeadFollowUpActivity(lead: CrmLead): Promise<CrmActivity | null> {
  if (!lead.ownerUserId) return null;
  const due = new Date();
  due.setDate(due.getDate() + 1);
  const repo = AppDataSource.getRepository(CrmActivity);
  return repo.save(
    repo.create({
      organizationId: lead.organizationId,
      type: 'task',
      subject: `Follow up: ${lead.name}`,
      body: lead.company
        ? `Auto follow-up for lead at ${lead.company}`
        : 'Auto follow-up created on lead create/assign',
      dueAt: due,
      ownerUserId: lead.ownerUserId,
      leadId: lead.id,
      customerId: lead.convertedCustomerId
    })
  );
}

/**
 * Apply auto-assign (if no owner yet) and optional follow-up task.
 * Call after lead is persisted on create/ingest.
 */
export async function applyLeadAutomation(
  lead: CrmLead,
  opts?: { skipAssign?: boolean; skipFollowup?: boolean }
): Promise<{ lead: CrmLead; assigned: boolean; followUp: CrmActivity | null }> {
  const settings = await getOrCreateCrmSettings(lead.organizationId);
  let assigned = false;
  const repo = AppDataSource.getRepository(CrmLead);

  if (!opts?.skipAssign && settings.autoAssignLeads && !lead.ownerUserId) {
    const next = await pickRoundRobinSalesRep(lead.organizationId, settings);
    if (next) {
      lead.ownerUserId = next;
      await repo.save(lead);
      assigned = true;
    }
  }

  let followUp: CrmActivity | null = null;
  if (!opts?.skipFollowup && settings.autoFollowupOnLead && lead.ownerUserId) {
    followUp = await createLeadFollowUpActivity(lead);
  }

  return { lead, assigned, followUp };
}
