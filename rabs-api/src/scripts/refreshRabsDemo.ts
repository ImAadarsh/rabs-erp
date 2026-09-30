/**
 * Keeps the RABS demo jobs (customers with 07700 9001xx numbers from seedRabsWorkflow) looking current:
 * appointments today and upcoming, a fitting today, bookings in the coming days, plus a variation and a part payment.
 * Only touches demo customers. Safe to run any day.
 *   node dist/scripts/refreshRabsDemo.js      (or npx tsx src/scripts/refreshRabsDemo.ts)
 */
import 'dotenv/config';
import { AppDataSource } from '../config/data-source.js';
import { getSettings, recomputeJob, todayISO, type Ctx } from '../services/rabs/rabsCore.js';
import { capabilitiesFor } from '../services/rabs/rabsWorkflow.js';
import * as O from '../services/rabs/rabsOps.js';

const ADMIN_EMAIL = process.env.RABS_ADMIN_EMAIL || 'admin@rabsinteriors.app';

function day(n: number) {
  const d = new Date(`${todayISO()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** UK wall-clock time → UTC Date (handles BST). */
function ukTime(date: string, hhmm: string) {
  const guess = new Date(`${date}T${hhmm}:00Z`);
  const uk = new Date(guess.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  const utc = new Date(guess.toLocaleString('en-US', { timeZone: 'UTC' }));
  return new Date(guess.getTime() - (uk.getTime() - utc.getTime()));
}

async function main() {
  await AppDataSource.initialize();
  const ds = AppDataSource;
  const [admin] = await ds.query('SELECT id, organization_id orgId FROM users WHERE email = ?', [ADMIN_EMAIL]);
  if (!admin) throw new Error(`Admin user ${ADMIN_EMAIL} not found`);
  const orgId = String(admin.orgId);
  const settings = await getSettings(orgId);
  const ctx: Ctx = { orgId, userId: String(admin.id), roles: ['SUPER_ADMIN'], caps: new Set(capabilitiesFor(['SUPER_ADMIN'], null)), settings };

  const jobs: Array<{ id: string; status: string; name: string; phone: string }> = await ds.query(
    `SELECT j.id, j.status, c.name, c.phone FROM rabs_jobs j JOIN rabs_customers c ON c.id = j.rabs_customer_id
      WHERE j.organization_id = ? AND REPLACE(c.phone, ' ', '') LIKE '077009001%' ORDER BY c.phone`,
    [orgId]
  );
  const byName = new Map(jobs.map((j) => [j.name, j]));
  const job = (name: string) => byName.get(name);

  // Appointments: one today, the rest spread over the next days
  const appts: Array<{ id: string; jobId: string }> = await ds.query(
    `SELECT a.id, a.job_id jobId FROM rabs_appointments a WHERE a.organization_id = ? AND a.status = 'booked' AND a.job_id IN (?) ORDER BY a.id`,
    [orgId, jobs.length ? jobs.map((j) => j.id) : [0]]
  );
  const slots = [
    [0, '14:00'],
    [1, '10:00'],
    [2, '11:30'],
    [3, '15:00']
  ] as const;
  for (const [i, a] of appts.entries()) {
    const [d, t] = slots[i % slots.length];
    await ds.query('UPDATE rabs_appointments SET scheduled_at = ? WHERE id = ?', [ukTime(day(d + Math.floor(i / slots.length) * 4), t), a.id]);
  }

  // Bookings that are not finished follow the demo story
  const plan: Record<string, number> = { 'Sophie Allen': 0, 'Natalie Scott': 1, 'Chris Edwards': 2 };
  for (const [name, offset] of Object.entries(plan)) {
    const j = job(name);
    if (!j) continue;
    await ds.query("UPDATE rabs_bookings SET scheduled_date = ? WHERE job_id = ? AND status IN ('booked','in_progress')", [day(offset), j.id]);
  }
  // Finished work sits in the recent past
  const done: Record<string, number> = { 'Ian Wood': -1, 'Barry Cooper': -2, 'Margaret Hill': -4, 'Daniel Ward': -6, 'Julie Morgan': -3, 'Peter Lawson': -10 };
  for (const [name, offset] of Object.entries(done)) {
    const j = job(name);
    if (j) await ds.query("UPDATE rabs_bookings SET scheduled_date = ? WHERE job_id = ? AND status = 'complete'", [day(offset), j.id]);
  }

  // A variation on a balance-pending job, and a part payment towards it
  const mh = job('Margaret Hill');
  if (mh) {
    const [{ n }] = await ds.query('SELECT COUNT(*) n FROM rabs_variations WHERE job_id = ?', [mh.id]);
    if (Number(n) === 0) await O.addVariation(ctx, mh.id, { description: 'Extra threshold strip for kitchen doorway', netAmount: 18, approve: true });
    const [{ p }] = await ds.query("SELECT COUNT(*) p FROM rabs_payments WHERE job_id = ? AND kind = 'part'", [mh.id]);
    const [row] = await ds.query('SELECT balance_due b FROM rabs_jobs WHERE id = ?', [mh.id]);
    if (Number(p) === 0 && Number(row.b) > 300) await O.recordPayment(ctx, mh.id, { amount: 250, method: 'bank_transfer', kind: 'part', reference: 'PART-HILL' });
  }
  // A pending (not yet approved) variation on a job in progress
  const ce = job('Chris Edwards');
  if (ce) {
    const [{ n }] = await ds.query('SELECT COUNT(*) n FROM rabs_variations WHERE job_id = ?', [ce.id]);
    if (Number(n) === 0) await O.addVariation(ctx, ce.id, { description: 'Stair rods (customer to confirm)', netAmount: 74.17, approve: false });
  }

  for (const j of jobs) await recomputeJob(ctx, j.id);
  const after: Array<{ status: string; n: number }> = await ds.query(
    "SELECT status, COUNT(*) n FROM rabs_jobs WHERE organization_id = ? GROUP BY status ORDER BY status",
    [orgId]
  );
  console.log(`Refreshed ${jobs.length} demo jobs for ${todayISO()}:`);
  console.table(after.map((r) => ({ status: r.status, jobs: Number(r.n) })));
  await ds.destroy();
}

main().catch(async (e) => {
  console.error(e);
  if (AppDataSource.isInitialized) await AppDataSource.destroy();
  process.exit(1);
});
