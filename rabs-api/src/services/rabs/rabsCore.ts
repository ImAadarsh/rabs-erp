import fs from 'fs/promises';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import type { Request } from 'express';
import type { EntityManager } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { env } from '@config/env.js';
import { uploadFile } from '@utils/storage.js';
import {
  RabsSettings, RabsStatus, RabsJob, RabsTimeline, RabsQuote, RabsAppointment, RabsMeasurement,
  RabsBooking, RabsPayment, RabsInvoice, RabsVariation
} from '@entities/rabs/RabsEntities.js';
import { DEFAULT_STATUSES, capabilitiesFor, deriveStatus, deriveWorkflowStatus, type Capability } from './rabsWorkflow.js';
import { round2, balanceDue } from './rabsCalc.js';

export class HttpError extends Error {
  constructor(public status: number, message: string, public details?: unknown) {
    super(message);
  }
}
export const bad = (msg: string, details?: unknown) => new HttpError(400, msg, details);
export const notFound = (what = 'Record') => new HttpError(404, `${what} not found`);
export const conflict = (msg: string) => new HttpError(409, msg);

export interface Ctx {
  orgId: string;
  userId: string;
  roles: string[];
  caps: Set<Capability>;
  settings: RabsSettings;
}

export const repo = {
  settings: () => AppDataSource.getRepository(RabsSettings),
  statuses: () => AppDataSource.getRepository(RabsStatus),
  jobs: () => AppDataSource.getRepository(RabsJob),
  timeline: () => AppDataSource.getRepository(RabsTimeline)
};

const settingsCache = new Map<string, { at: number; value: RabsSettings }>();

export function invalidateSettings(orgId: string) {
  settingsCache.delete(orgId);
}

export async function getSettings(orgId: string): Promise<RabsSettings> {
  const hit = settingsCache.get(orgId);
  if (hit && Date.now() - hit.at < 15_000) return hit.value;
  let s = await repo.settings().findOne({ where: { organizationId: orgId } });
  if (!s) {
    await AppDataSource.query('INSERT IGNORE INTO rabs_settings (organization_id, document_footer, quote_terms) VALUES (?, ?, ?)', [
      orgId,
      'RABS Carpets & Furniture · 194 Waterloo Road, Stoke-on-Trent ST6 3HF · 07774 596 596',
      'Quotation valid for 30 days. A deposit is required to confirm your order; the balance is due on completion.'
    ]);
    s = await repo.settings().findOneOrFail({ where: { organizationId: orgId } });
  }
  settingsCache.set(orgId, { at: Date.now(), value: s });
  return s;
}

export async function ensureStatuses(orgId: string): Promise<RabsStatus[]> {
  const existing = await repo.statuses().find({ where: { organizationId: orgId }, order: { sortOrder: 'ASC' } });
  const have = new Set(existing.map((s) => s.code));
  const missing = DEFAULT_STATUSES.filter((d) => !have.has(d.code));
  if (missing.length) {
    for (const d of missing) {
      await AppDataSource.query(
        `INSERT IGNORE INTO rabs_statuses (organization_id, code, label, color, text_color, stage, sort_order, next_action_label)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [orgId, d.code, d.label, d.color, d.textColor, d.stage, DEFAULT_STATUSES.indexOf(d), d.nextActionLabel]
      );
    }
    return repo.statuses().find({ where: { organizationId: orgId }, order: { sortOrder: 'ASC' } });
  }
  return existing;
}

export async function buildCtx(req: Request): Promise<Ctx> {
  const auth = (req as any).auth as { sub: string; orgId: string; roles: string[] } | undefined;
  if (!auth?.orgId) throw new HttpError(401, 'Unauthorized');
  const settings = await getSettings(String(auth.orgId));
  const caps = new Set(capabilitiesFor(auth.roles || [], settings.rolePermissions));
  return { orgId: String(auth.orgId), userId: String(auth.sub), roles: auth.roles || [], caps, settings };
}

export function requireCap(ctx: Ctx, ...caps: Capability[]) {
  if (!caps.some((c) => ctx.caps.has(c))) {
    throw new HttpError(403, "You don't have permission to do that. Ask an admin if you need access.");
  }
}

/** Office-type users see every job; field-only users (fitters/drivers) see jobs they are booked on. */
export function isOfficeUser(ctx: Ctx) {
  return ['customers', 'quotes', 'payments', 'bookings', 'materials', 'invoices', 'reports', 'admin', 'measure'].some((c) =>
    ctx.caps.has(c as Capability)
  );
}

export async function loadJob(ctx: Ctx, jobId: string | number, m?: EntityManager): Promise<RabsJob> {
  const r = (m ?? AppDataSource.manager).getRepository(RabsJob);
  const job = await r.findOne({ where: { id: String(jobId), organizationId: ctx.orgId } });
  if (!job) throw notFound('Job');
  if (!isOfficeUser(ctx)) {
    const rows = await AppDataSource.query('SELECT 1 FROM rabs_bookings WHERE job_id = ? AND staff_user_id = ? AND status <> "cancelled" LIMIT 1', [
      job.id,
      ctx.userId
    ]);
    if (!rows.length) throw new HttpError(403, 'This job is not assigned to you');
  }
  return job;
}

type NumberKind = 'job' | 'quote' | 'invoice';
const numberCols: Record<NumberKind, { col: string; prefix: keyof RabsSettings }> = {
  job: { col: 'next_job_number', prefix: 'jobPrefix' },
  quote: { col: 'next_quote_number', prefix: 'quotePrefix' },
  invoice: { col: 'next_invoice_number', prefix: 'invoicePrefix' }
};

/** Atomically allocate the next document number (e.g. RJ-1001, Q-10001, INV-5001). */
export async function nextNumber(orgId: string, kind: NumberKind): Promise<string> {
  const settings = await getSettings(orgId);
  const { col, prefix } = numberCols[kind];
  const n = await AppDataSource.transaction(async (m) => {
    await m.query(`UPDATE rabs_settings SET ${col} = LAST_INSERT_ID(${col}) + 1 WHERE organization_id = ?`, [orgId]);
    const [row] = await m.query('SELECT LAST_INSERT_ID() AS n');
    return Number(row.n);
  });
  invalidateSettings(orgId);
  return `${settings[prefix] as string}${n}`;
}

export async function addTimeline(ctx: Pick<Ctx, 'orgId' | 'userId'>, jobId: string, event: string, message: string, meta?: Record<string, unknown>) {
  await repo.timeline().insert({
    organizationId: ctx.orgId,
    jobId,
    event,
    message: message.slice(0, 500),
    meta: (meta ?? null) as any,
    userId: ctx.userId || null
  });
}

// ---- File storage: S3 when configured, else local uploads/ served at /uploads ----

export const UPLOADS_ROOT = path.resolve(process.cwd(), 'uploads');
const IMAGE_TYPES = ['image/jpeg', 'image/pjpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'];

export function s3Configured() {
  return !!(env.AWS_S3_BUCKET_NAME && env.AWS_ACCESS_KEY_ID && env.AWS_SECRET_ACCESS_KEY);
}

export async function storeFile(
  orgId: string,
  folder: string,
  file: { buffer: Buffer; originalname: string; mimetype: string; size: number },
  opts: { imagesOnly?: boolean; maxMb?: number } = {}
): Promise<{ url: string; key: string }> {
  const maxMb = opts.maxMb ?? 15;
  if (file.size > maxMb * 1024 * 1024) throw bad(`Each file must be under ${maxMb} MB`);
  if (opts.imagesOnly && !IMAGE_TYPES.includes(file.mimetype) && !/\.(jpe?g|png|webp|gif|heic|heif)$/i.test(file.originalname)) {
    throw bad('Only photos (JPG, PNG, WebP, HEIC) can be uploaded here');
  }
  const ext = (path.extname(file.originalname) || (file.mimetype === 'image/png' ? '.png' : '.jpg')).toLowerCase().replace(/[^.a-z0-9]/g, '');
  const safeFolder = `rabs/${String(orgId).replace(/\D/g, '')}/${folder.replace(/[^a-z0-9/_-]/gi, '')}`;
  if (s3Configured()) {
    const r = await uploadFile({ file: file as Express.Multer.File, folder: safeFolder, maxSizeInMB: maxMb });
    return { url: r.url, key: r.key };
  }
  const name = `${uuidv4()}${ext}`;
  const dir = path.join(UPLOADS_ROOT, safeFolder);
  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(path.join(dir, name), file.buffer);
  const key = `${safeFolder}/${name}`;
  return { url: `${env.PUBLIC_API_URL.replace(/\/$/, '')}/uploads/${key}`, key };
}

export async function removeStoredFile(key: string | null) {
  if (!key || s3Configured()) return;
  const full = path.join(UPLOADS_ROOT, key);
  if (!full.startsWith(UPLOADS_ROOT)) return;
  await fs.unlink(full).catch(() => undefined);
}

// ---- Status recompute: single place that moves the job forward ----

export function todayISO(): string {
  const d = new Date();
  const uk = new Date(d.toLocaleString('en-US', { timeZone: 'Europe/London' }));
  return `${uk.getFullYear()}-${String(uk.getMonth() + 1).padStart(2, '0')}-${String(uk.getDate()).padStart(2, '0')}`;
}

export function dateOnly(v: unknown): string {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  const d = v as Date;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

const dateRefresh = new Map<string, { day: string; at: number }>();

/**
 * Statuses like "Fitting Today" depend on the calendar, not on a user action. Re-derive open jobs with a live booking
 * whenever the day changes (and at most every 10 minutes) so lists, the dashboard and the diary show the right colour.
 */
export async function refreshDateStatuses(orgId: string) {
  const day = todayISO();
  const last = dateRefresh.get(orgId);
  if (last && last.day === day && Date.now() - last.at < 10 * 60 * 1000) return;
  dateRefresh.set(orgId, { day, at: Date.now() });
  const rows: Array<{ id: string }> = await AppDataSource.query(
    `SELECT DISTINCT j.id FROM rabs_jobs j JOIN rabs_bookings b ON b.job_id = j.id
      WHERE j.organization_id = ? AND j.closed_at IS NULL AND b.status IN ('booked','in_progress')`,
    [orgId]
  );
  for (const r of rows) await recomputeJob({ orgId, userId: '' }, String(r.id)).catch(() => undefined);
}

export async function recomputeJob(ctx: Pick<Ctx, 'orgId' | 'userId'>, jobId: string): Promise<RabsJob> {
  const ds = AppDataSource;
  const job = await ds.getRepository(RabsJob).findOneOrFail({ where: { id: jobId } });
  const settings = await getSettings(job.organizationId);
  const [latestQuote] = await ds.getRepository(RabsQuote).find({
    where: { jobId },
    order: { id: 'DESC' },
    take: 1
  });
  const accepted = job.acceptedQuoteId ? await ds.getRepository(RabsQuote).findOne({ where: { id: job.acceptedQuoteId } }) : null;
  const apptCount = await ds.getRepository(RabsAppointment).count({ where: { jobId } });
  const measurement = await ds.getRepository(RabsMeasurement).findOne({ where: { jobId }, order: { id: 'DESC' } });
  const roomCount = measurement ? Number((await ds.query('SELECT COUNT(*) c FROM rabs_rooms WHERE measurement_id = ?', [measurement.id]))[0].c) : 0;
  const bookings = await ds.getRepository(RabsBooking).find({ where: { jobId }, order: { id: 'DESC' } });
  const pick = (type: 'fitting' | 'delivery') => {
    const b = bookings.find((x) => x.type === type && x.status !== 'cancelled');
    return b ? { status: b.status, date: dateOnly(b.scheduledDate) } : null;
  };
  const payments = await ds.getRepository(RabsPayment).find({ where: { jobId } });
  const paid = round2(payments.reduce((s, p) => s + (p.kind === 'refund' ? -p.amount : p.amount), 0));
  const variations = await ds.getRepository(RabsVariation).find({ where: { jobId, status: 'approved' } });
  const varTotal = round2(variations.reduce((s, v) => s + v.total, 0));
  const total = accepted ? round2(accepted.total + varTotal) : 0;
  const balance = balanceDue(total, paid);
  const invoice = await ds.getRepository(RabsInvoice).findOne({ where: { jobId } });

  const input = {
    closed: !!job.closedAt,
    hasIssue: job.hasIssue,
    converted: !!job.convertedAt,
    acceptedQuote: !!accepted,
    quoteStatus: latestQuote?.status ?? null,
    hasMeasurement: !!measurement && roomCount > 0,
    hasAppointment: apptCount > 0,
    depositRequired: job.depositRequired,
    paid,
    balance,
    materialsStatus: job.materialsStatus,
    requiresFitting: job.requiresFitting,
    requiresDelivery: job.requiresDelivery,
    fitting: job.requiresFitting ? pick('fitting') : null,
    delivery: job.requiresDelivery ? pick('delivery') : null,
    invoiceIssued: !!invoice,
    autoClose: settings.autoCloseWhenPaid,
    today: todayISO()
  };
  let status = deriveStatus(input);
  const wf = deriveWorkflowStatus(input);
  const workDone = !!accepted && !!job.convertedAt && ['FITTING_COMPLETE', 'DELIVERY_COMPLETE', 'BALANCE_PENDING', 'FULLY_PAID', 'CLOSED'].includes(wf);

  const patch: Partial<RabsJob> = { totalAmount: total, paidAmount: paid, balanceDue: balance };
  if (workDone && !job.completedAt) patch.completedAt = new Date();
  if (!workDone && job.completedAt) patch.completedAt = null;
  if (status === 'CLOSED' && !job.closedAt) {
    patch.closedAt = new Date();
    await addTimeline(ctx, jobId, 'closed', 'Fully paid and work complete — job closed automatically');
  }
  if (status !== job.status) {
    patch.status = status;
    await addTimeline(ctx, jobId, 'status', `Status changed: ${labelFor(job.status)} → ${labelFor(status)}`, { from: job.status, to: status });
  }
  await ds.getRepository(RabsJob).update({ id: jobId }, patch);

  if (invoice) {
    const invPaid = paid;
    const invBal = balanceDue(invoice.total, invPaid);
    await ds.getRepository(RabsInvoice).update(
      { id: invoice.id },
      { paidAmount: invPaid, balance: invBal, status: invBal <= 0.005 ? 'paid' : invPaid > 0 ? 'part_paid' : 'issued' }
    );
  }
  status = patch.status ?? job.status;
  return { ...job, ...patch, status } as RabsJob;
}

function labelFor(code: string) {
  return DEFAULT_STATUSES.find((s) => s.code === code)?.label ?? code;
}

export function parseId(v: unknown, what = 'id'): string {
  const s = String(v ?? '');
  if (!/^\d{1,18}$/.test(s)) throw bad(`Invalid ${what}`);
  return s;
}
