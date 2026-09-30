import { In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import {
  RabsCustomer, RabsAppointment, RabsMeasurement, RabsRoom, RabsRoomAccessory, RabsProduct, RabsFile, RabsQuote, RabsQuoteLine,
  RabsMaterialItem, RabsBooking, RabsPayment, RabsInvoice, RabsVariation, RabsTimeline, RabsLabourRule
} from '@entities/rabs/RabsEntities.js';
import { Ctx, loadJob, recomputeJob, ensureStatuses, requireCap, isOfficeUser, todayISO, bad, s3Configured, refreshDateStatuses } from './rabsCore.js';
import {
  PROGRESS_STEPS, NEXT_ACTION_CODE, deriveWorkflowStatus, progressIndex, CAPABILITIES, ROOM_TYPES, LEAD_SOURCES, APPOINTMENT_PURPOSES, RABS_ROLES
} from './rabsWorkflow.js';
import { customerAddress } from './rabsJobs.js';
import { round2 } from './rabsCalc.js';

const repo = <T extends object>(e: new () => T) => AppDataSource.getRepository(e);

export async function userNames(ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const uniq = [...new Set(ids.filter(Boolean) as string[])];
  if (!uniq.length) return new Map();
  const rows = await AppDataSource.query('SELECT id, first_name f, last_name l, email FROM users WHERE id IN (?)', [uniq]);
  return new Map(rows.map((r: any) => [String(r.id), [r.f, r.l].filter(Boolean).join(' ') || r.email]));
}

function stripMoney<T extends Record<string, any>>(obj: T, keys: string[]): T {
  const o: Record<string, any> = { ...obj };
  for (const k of keys) delete o[k];
  return o as T;
}

const COST_KEYS = ['costTotal', 'marginAmount', 'marginPercent', 'unitCost', 'lineCost'];
const PRICE_KEYS = ['subtotal', 'discountAmount', 'discountValue', 'deliveryCharge', 'netTotal', 'vatAmount', 'total', 'depositRequired', 'unitPrice', 'lineTotal', 'sellPrice'];

export async function statusMap(orgId: string) {
  const statuses = await ensureStatuses(orgId);
  return new Map(statuses.map((s) => [s.code, s]));
}

/** Job page payload — everything attached to one job number. */
export async function jobAggregate(ctx: Ctx, jobId: string) {
  await loadJob(ctx, jobId);
  const job = await recomputeJob(ctx, jobId);
  const customer = await repo(RabsCustomer).findOneOrFail({ where: { id: job.rabsCustomerId } });
  const [appointments, measurement, quotes, materials, bookings, payments, invoice, variations, files, timeline] = await Promise.all([
    repo(RabsAppointment).find({ where: { jobId }, order: { scheduledAt: 'DESC' } }),
    repo(RabsMeasurement).findOne({ where: { jobId }, order: { id: 'DESC' } }),
    repo(RabsQuote).find({ where: { jobId }, order: { id: 'DESC' } }),
    repo(RabsMaterialItem).find({ where: { jobId }, order: { id: 'ASC' } }),
    repo(RabsBooking).find({ where: { jobId }, order: { id: 'DESC' } }),
    repo(RabsPayment).find({ where: { jobId }, order: { paidAt: 'ASC' } }),
    repo(RabsInvoice).findOne({ where: { jobId } }),
    repo(RabsVariation).find({ where: { jobId }, order: { id: 'ASC' } }),
    repo(RabsFile).find({ where: { jobId }, order: { id: 'ASC' } }),
    repo(RabsTimeline).find({ where: { jobId }, order: { createdAt: 'DESC', id: 'DESC' }, take: 200 })
  ]);
  const rooms = measurement ? await repo(RabsRoom).find({ where: { measurementId: measurement.id }, order: { sortOrder: 'ASC', id: 'ASC' } }) : [];
  const accs = rooms.length ? await repo(RabsRoomAccessory).find({ where: { roomId: In(rooms.map((r) => r.id)) } }) : [];
  const pids = new Set<string>([...rooms.map((r) => r.productId), ...accs.map((a) => a.productId), ...materials.map((m) => m.productId)].filter(Boolean) as string[]);
  const products = pids.size ? await repo(RabsProduct).find({ where: { id: In([...pids]) } }) : [];
  const pmap = new Map(products.map((p) => [p.id, p]));
  const current = quotes.find((q) => q.status === 'accepted') ?? quotes.find((q) => q.status !== 'superseded' && q.status !== 'declined') ?? quotes[0] ?? null;
  const lines = current ? await repo(RabsQuoteLine).find({ where: { quoteId: current.id }, order: { sortOrder: 'ASC', id: 'ASC' } }) : [];
  const names = await userNames([
    job.surveyorUserId, job.createdBy, ...appointments.map((a) => a.staffUserId), ...bookings.map((b) => b.staffUserId),
    ...timeline.map((t) => t.userId), ...payments.map((p) => p.recordedBy)
  ]);
  const statuses = await statusMap(ctx.orgId);
  const settings = ctx.settings;
  const [latest] = quotes;

  const wf = deriveWorkflowStatus({
    closed: !!job.closedAt, hasIssue: job.hasIssue, converted: !!job.convertedAt, acceptedQuote: !!job.acceptedQuoteId,
    quoteStatus: latest?.status ?? null, hasMeasurement: rooms.length > 0, hasAppointment: appointments.length > 0,
    depositRequired: job.depositRequired, paid: job.paidAmount, balance: job.balanceDue, materialsStatus: job.materialsStatus,
    requiresFitting: job.requiresFitting, requiresDelivery: job.requiresDelivery,
    fitting: pickBooking(bookings, 'fitting'), delivery: pickBooking(bookings, 'delivery'), invoiceIssued: !!invoice,
    autoClose: settings.autoCloseWhenPaid, today: todayISO()
  });
  const st = statuses.get(job.status);
  const nextCode = NEXT_ACTION_CODE[job.status] ?? null;
  const canPrice = ctx.caps.has('view_prices');
  const canCost = ctx.caps.has('view_costs');
  const hideKeys = [...(canCost ? [] : COST_KEYS), ...(canPrice ? [] : PRICE_KEYS)];
  const clean = <T extends Record<string, any>>(o: T) => (hideKeys.length ? stripMoney(o, hideKeys) : o);

  const roomsOut = rooms.map((r) => {
    const p = r.productId ? pmap.get(r.productId) : null;
    const roomLines = lines.filter((l) => l.roomId === r.id);
    return {
      ...r,
      product: p ? { id: p.id, name: p.name, category: p.category, unit: p.unit, kind: p.kind, colour: p.colour } : null,
      accessories: accs.filter((a) => a.roomId === r.id).map((a) => ({ productId: a.productId, qty: a.qty, name: pmap.get(a.productId)?.name ?? 'Accessory', unit: pmap.get(a.productId)?.unit ?? 'item' })),
      photos: files.filter((f) => f.roomId === r.id),
      subtotal: canPrice ? round2(roomLines.reduce((s, l) => s + l.lineTotal, 0)) : undefined
    };
  });

  return {
    job: {
      ...clean({ ...job, total: job.totalAmount, paid: job.paidAmount, balance: job.balanceDue } as Record<string, any>),
      surveyorName: job.surveyorUserId ? names.get(job.surveyorUserId) ?? null : null
    },
    customer: { ...customer, address: customerAddress(customer) },
    siteAddress: job.siteAddress || customerAddress(customer),
    status: st ? { code: st.code, label: st.label, color: st.color, textColor: st.textColor } : { code: job.status, label: job.status, color: '#6B7280', textColor: '#fff' },
    progress: {
      steps: PROGRESS_STEPS,
      index: progressIndex(wf, !!job.closedAt),
      workflowStatus: wf
    },
    nextAction: nextCode ? { code: nextCode, label: st?.nextActionLabel ?? nextCode.replace(/_/g, ' ').toUpperCase() } : null,
    money: canPrice
      ? {
          total: job.totalAmount,
          depositRequired: job.depositRequired,
          paid: job.paidAmount,
          balance: job.balanceDue,
          depositMet: job.depositRequired <= 0 || job.paidAmount + 0.005 >= job.depositRequired,
          depositOutstanding: round2(Math.max(0, job.depositRequired - job.paidAmount))
        }
      : null,
    appointments: appointments.map((a) => ({ ...a, staffName: a.staffUserId ? names.get(a.staffUserId) ?? null : null })),
    measurement: measurement ? { ...measurement, rooms: roomsOut } : null,
    quotes: quotes.map((q) => clean({ id: q.id, quoteNumber: q.quoteNumber, version: q.version, status: q.status, total: q.total, createdAt: q.createdAt, sentAt: q.sentAt, acceptedAt: q.acceptedAt } as Record<string, any>)),
    currentQuote: current ? { quote: clean(current as unknown as Record<string, any>), lines: lines.map((l) => clean(l as unknown as Record<string, any>)) } : null,
    materials: materials.map((m) => ({ ...m, product: m.productId ? { name: pmap.get(m.productId)?.name, category: pmap.get(m.productId)?.category } : null })),
    bookings: bookings.map((b) => ({
      ...b,
      scheduledDate: typeof b.scheduledDate === 'string' ? b.scheduledDate : (b.scheduledDate as any),
      staffName: b.staffUserId ? names.get(b.staffUserId) ?? null : null,
      photos: files.filter((f) => f.bookingId === b.id && (f.kind === 'before' || f.kind === 'after')),
      signatureUrl: files.find((f) => f.id === b.signatureFileId)?.url ?? null
    })),
    payments: canPrice ? payments.map((p) => ({ ...p, recordedByName: p.recordedBy ? names.get(p.recordedBy) ?? null : null })) : [],
    invoice: canPrice ? invoice : invoice ? { id: invoice.id, invoiceNumber: invoice.invoiceNumber, status: invoice.status } : null,
    variations: canPrice ? variations : variations.map((v) => ({ id: v.id, description: v.description, status: v.status })),
    documents: files.filter((f) => f.kind === 'document' || f.kind === 'other'),
    photoCount: files.filter((f) => f.kind !== 'signature' && f.kind !== 'document').length,
    timeline: timeline.map((t) => ({ ...t, userName: t.userId ? names.get(t.userId) ?? null : null })),
    permissions: [...ctx.caps]
  };
}

function pickBooking(bookings: RabsBooking[], type: 'fitting' | 'delivery') {
  const b = bookings.find((x) => x.type === type && x.status !== 'cancelled');
  return b ? { status: b.status, date: String(b.scheduledDate).slice(0, 10) } : null;
}

// ---- Lists & search ----------------------------------------------------------------

const JOB_SELECT = `
  SELECT j.id, j.job_number jobNumber, j.status, j.title, j.total_amount total, j.balance_due balance, j.paid_amount paid,
         j.deposit_required depositRequired, j.materials_status materialsStatus, j.has_issue hasIssue, j.created_at createdAt, j.updated_at updatedAt,
         j.requires_fitting requiresFitting, j.requires_delivery requiresDelivery,
         c.id customerId, c.name customerName, c.phone customerPhone, c.postcode, CONCAT_WS(', ', c.address_line1, c.city, c.postcode) address,
         (SELECT MIN(a.scheduled_at) FROM rabs_appointments a WHERE a.job_id = j.id AND a.status = 'booked') nextAppointment,
         (SELECT DATE_FORMAT(MIN(b.scheduled_date), '%Y-%m-%d') FROM rabs_bookings b WHERE b.job_id = j.id AND b.status IN ('booked','in_progress')) nextBooking,
         (SELECT q.quote_number FROM rabs_quotes q WHERE q.job_id = j.id ORDER BY q.id DESC LIMIT 1) quoteNumber,
         (SELECT q.total FROM rabs_quotes q WHERE q.job_id = j.id ORDER BY q.id DESC LIMIT 1) quoteTotal,
         (SELECT i.invoice_number FROM rabs_invoices i WHERE i.job_id = j.id LIMIT 1) invoiceNumber
    FROM rabs_jobs j
    JOIN rabs_customers c ON c.id = j.rabs_customer_id`;

async function decorate(ctx: Ctx, rows: any[]) {
  const statuses = await statusMap(ctx.orgId);
  const canPrice = ctx.caps.has('view_prices');
  return rows.map((r) => {
    const s = statuses.get(r.status);
    const out: any = {
      ...r,
      id: String(r.id),
      customerId: String(r.customerId),
      total: Number(r.total),
      balance: Number(r.balance),
      paid: Number(r.paid),
      depositRequired: Number(r.depositRequired),
      quoteTotal: r.quoteTotal === null ? null : Number(r.quoteTotal),
      hasIssue: !!r.hasIssue,
      requiresFitting: !!r.requiresFitting,
      requiresDelivery: !!r.requiresDelivery,
      statusLabel: s?.label ?? r.status,
      statusColor: s?.color ?? '#6B7280',
      statusTextColor: s?.textColor ?? '#FFFFFF',
      nextActionLabel: s?.nextActionLabel ?? null
    };
    if (!canPrice) for (const k of ['total', 'balance', 'paid', 'depositRequired', 'quoteTotal']) delete out[k];
    return out;
  });
}

export async function listJobs(ctx: Ctx, f: { status?: string; q?: string; staff?: string; open?: string; page?: number; limit?: number; sort?: string }) {
  await refreshDateStatuses(ctx.orgId);
  const where: string[] = ['j.organization_id = ?'];
  const params: unknown[] = [ctx.orgId];
  if (!isOfficeUser(ctx)) {
    where.push("EXISTS (SELECT 1 FROM rabs_bookings b WHERE b.job_id = j.id AND b.staff_user_id = ? AND b.status <> 'cancelled')");
    params.push(ctx.userId);
  }
  if (f.status) {
    const codes = f.status.split(',').map((s) => s.trim().toUpperCase()).filter((s) => /^[A-Z_]{2,40}$/.test(s));
    if (codes.length) {
      where.push('j.status IN (?)');
      params.push(codes);
    }
  }
  if (f.open === '1') where.push("j.status <> 'CLOSED'");
  if (f.staff) {
    where.push("(j.surveyor_user_id = ? OR EXISTS (SELECT 1 FROM rabs_bookings b2 WHERE b2.job_id = j.id AND b2.staff_user_id = ? AND b2.status <> 'cancelled'))");
    params.push(f.staff, f.staff);
  }
  if (f.q && f.q.trim()) {
    const like = `%${f.q.trim()}%`;
    const digits = f.q.replace(/\D/g, '');
    where.push(`(c.name LIKE ? OR c.phone LIKE ? OR REPLACE(c.phone,' ','') LIKE ? OR c.email LIKE ? OR c.address_line1 LIKE ? OR c.city LIKE ? OR c.postcode LIKE ? OR REPLACE(c.postcode,' ','') LIKE ?
      OR j.job_number LIKE ? OR j.title LIKE ?
      OR EXISTS (SELECT 1 FROM rabs_quotes q WHERE q.job_id = j.id AND q.quote_number LIKE ?)
      OR EXISTS (SELECT 1 FROM rabs_invoices i WHERE i.job_id = j.id AND i.invoice_number LIKE ?))`);
    params.push(like, like, digits.length >= 3 ? `%${digits}%` : like, like, like, like, like, like.replace(/\s/g, ''), like, like, like, like);
  }
  const limit = Math.min(Math.max(Number(f.limit) || 50, 1), 200);
  const page = Math.max(Number(f.page) || 1, 1);
  const order = f.sort === 'balance' ? 'j.balance_due DESC' : f.sort === 'oldest' ? 'j.id ASC' : 'j.updated_at DESC, j.id DESC';
  const [{ n }] = await AppDataSource.query(`SELECT COUNT(*) n FROM rabs_jobs j JOIN rabs_customers c ON c.id = j.rabs_customer_id WHERE ${where.join(' AND ')}`, params);
  const rows = await AppDataSource.query(`${JOB_SELECT} WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit, (page - 1) * limit]);
  return { data: await decorate(ctx, rows), total: Number(n), page, limit };
}

export async function search(ctx: Ctx, q: string) {
  if (!q || q.trim().length < 2) throw bad('Type at least 2 characters to search');
  const jobs = await listJobs(ctx, { q, limit: 25 });
  const customers = isOfficeUser(ctx)
    ? await AppDataSource.query(
        `SELECT c.id, c.name, c.phone, c.postcode, CONCAT_WS(', ', c.address_line1, c.city, c.postcode) address
           FROM rabs_customers c WHERE c.organization_id = ? AND (c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ? OR c.postcode LIKE ? OR c.address_line1 LIKE ?)
           AND NOT EXISTS (SELECT 1 FROM rabs_jobs j WHERE j.rabs_customer_id = c.id) LIMIT 10`,
        [ctx.orgId, ...Array(5).fill(`%${q.trim()}%`)]
      )
    : [];
  return { jobs: jobs.data, customersWithoutJobs: customers };
}

export async function dashboard(ctx: Ctx) {
  await refreshDateStatuses(ctx.orgId);
  const statuses = await ensureStatuses(ctx.orgId);
  const today = todayISO();
  const office = isOfficeUser(ctx);
  const counts: Array<{ status: string; n: number; value: number }> = office
    ? await AppDataSource.query("SELECT status, COUNT(*) n, COALESCE(SUM(total_amount),0) value FROM rabs_jobs WHERE organization_id = ? GROUP BY status", [ctx.orgId])
    : [];
  const cmap = new Map(counts.map((c) => [c.status, c]));
  const canPrice = ctx.caps.has('view_prices');
  const byStatus = statuses.filter((s) => s.isActive).map((s) => ({
    code: s.code, label: s.label, color: s.color, textColor: s.textColor, nextActionLabel: s.nextActionLabel,
    count: Number(cmap.get(s.code)?.n || 0), ...(canPrice ? { value: Number(cmap.get(s.code)?.value || 0) } : {})
  }));
  const appointmentsToday = ctx.caps.has('appointments')
    ? await AppDataSource.query(
        `SELECT a.id, a.job_id jobId, a.scheduled_at scheduledAt, a.purpose, j.job_number jobNumber, c.name customerName, c.phone customerPhone,
                CONCAT_WS(', ', c.address_line1, c.postcode) address, TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) staffName
           FROM rabs_appointments a JOIN rabs_jobs j ON j.id = a.job_id JOIN rabs_customers c ON c.id = j.rabs_customer_id LEFT JOIN users u ON u.id = a.staff_user_id
          WHERE a.organization_id = ? AND a.status = 'booked' AND DATE(a.scheduled_at) = ? ORDER BY a.scheduled_at`,
        [ctx.orgId, today]
      )
    : [];
  const workToday = office
    ? await AppDataSource.query(
        `SELECT b.id, b.job_id jobId, b.type, b.slot, b.status, j.job_number jobNumber, c.name customerName, CONCAT_WS(', ', c.address_line1, c.postcode) address,
                TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) staffName
           FROM rabs_bookings b JOIN rabs_jobs j ON j.id = b.job_id JOIN rabs_customers c ON c.id = j.rabs_customer_id LEFT JOIN users u ON u.id = b.staff_user_id
          WHERE b.organization_id = ? AND b.scheduled_date = ? AND b.status <> 'cancelled' ORDER BY b.slot`,
        [ctx.orgId, today]
      )
    : [];
  let outstanding = null;
  if (canPrice && office) {
    const [o] = await AppDataSource.query(
      "SELECT COUNT(*) n, COALESCE(SUM(balance_due),0) total FROM rabs_jobs WHERE organization_id = ? AND converted_at IS NOT NULL AND closed_at IS NULL AND balance_due > 0",
      [ctx.orgId]
    );
    outstanding = { jobs: Number(o.n), total: Number(o.total) };
  }
  const needsAction = office
    ? await decorate(ctx, await AppDataSource.query(`${JOB_SELECT} WHERE j.organization_id = ? AND j.status NOT IN ('CLOSED') ORDER BY FIELD(j.status,'ISSUE','FITTING_TODAY','DEPOSIT_PENDING','MATERIALS_PENDING','BALANCE_PENDING','FULLY_PAID','ACCEPTED','CONFIRMED','READY_TO_FIT','DELIVERY_REQUIRED') DESC, j.updated_at DESC LIMIT 12`, [ctx.orgId]))
    : [];
  const mine = ctx.caps.has('fieldwork') ? await (await import('./rabsOps.js')).myWork(ctx, 'upcoming') : [];
  return { today, byStatus, appointmentsToday, workToday, outstanding, needsAction, myWork: mine };
}

// ---- Reports -------------------------------------------------------------------------------

export async function reportPipeline(ctx: Ctx) {
  requireCap(ctx, 'reports');
  const d = await dashboard(ctx);
  return d.byStatus;
}

export async function reportSales(ctx: Ctx, from?: string, to?: string) {
  requireCap(ctx, 'reports');
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : `${new Date().getFullYear()}-01-01`;
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : todayISO();
  const canCost = ctx.caps.has('view_costs');
  const byMonth = await AppDataSource.query(
    `SELECT DATE_FORMAT(accepted_at,'%Y-%m') month, COUNT(*) quotes, SUM(net_total) net, SUM(total) gross, SUM(cost_total) cost, SUM(margin_amount) margin
       FROM rabs_quotes WHERE organization_id = ? AND status = 'accepted' AND DATE(accepted_at) BETWEEN ? AND ? GROUP BY month ORDER BY month`,
    [ctx.orgId, f, t]
  );
  const byStaff = await AppDataSource.query(
    `SELECT q.created_by userId, TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) name, COUNT(*) quotes, SUM(q.net_total) net, SUM(q.total) gross, SUM(q.margin_amount) margin
       FROM rabs_quotes q LEFT JOIN users u ON u.id = q.created_by
      WHERE q.organization_id = ? AND q.status = 'accepted' AND DATE(q.accepted_at) BETWEEN ? AND ? GROUP BY q.created_by, name ORDER BY gross DESC`,
    [ctx.orgId, f, t]
  );
  const [conv] = await AppDataSource.query(
    `SELECT COUNT(DISTINCT CASE WHEN status IN ('sent','accepted','declined','superseded') THEN CONCAT(quote_number) END) sent,
            COUNT(DISTINCT CASE WHEN status = 'accepted' THEN quote_number END) accepted
       FROM rabs_quotes WHERE organization_id = ? AND DATE(created_at) BETWEEN ? AND ?`,
    [ctx.orgId, f, t]
  );
  const n = (rows: any[]) =>
    rows.map((r) => {
      const o: any = { ...r, quotes: Number(r.quotes), net: Number(r.net || 0), gross: Number(r.gross || 0) };
      if (canCost) {
        o.cost = r.cost !== undefined ? Number(r.cost || 0) : undefined;
        o.margin = Number(r.margin || 0);
      } else {
        delete o.cost;
        delete o.margin;
      }
      return o;
    });
  const months = n(byMonth);
  return {
    from: f,
    to: t,
    byMonth: months,
    byStaff: n(byStaff),
    totals: {
      quotes: months.reduce((s, m) => s + m.quotes, 0),
      net: round2(months.reduce((s, m) => s + m.net, 0)),
      gross: round2(months.reduce((s, m) => s + m.gross, 0)),
      ...(canCost ? { margin: round2(months.reduce((s, m) => s + (m.margin || 0), 0)) } : {})
    },
    conversion: { quoted: Number(conv.sent || 0), accepted: Number(conv.accepted || 0) }
  };
}

export async function reportOutstanding(ctx: Ctx) {
  requireCap(ctx, 'reports', 'payments');
  const rows = await AppDataSource.query(
    `${JOB_SELECT} WHERE j.organization_id = ? AND j.converted_at IS NOT NULL AND j.closed_at IS NULL AND j.balance_due > 0 ORDER BY j.balance_due DESC`,
    [ctx.orgId]
  );
  const data = await decorate(ctx, rows);
  return { data, total: round2(data.reduce((s: number, r: any) => s + (r.balance || 0), 0)) };
}

export async function reportSchedule(ctx: Ctx, from?: string, to?: string) {
  requireCap(ctx, 'reports', 'bookings', 'fieldwork');
  const f = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? from : todayISO();
  const t = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? to : new Date(Date.now() + 13 * 86400000).toISOString().slice(0, 10);
  const staffFilter = isOfficeUser(ctx) ? '' : ' AND b.staff_user_id = ?';
  const rows = await AppDataSource.query(
    `SELECT b.id, b.job_id jobId, b.type, DATE_FORMAT(b.scheduled_date, '%Y-%m-%d') scheduledDate, b.slot, b.status, b.staff_user_id staffUserId,
            TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) staffName,
            j.job_number jobNumber, c.name customerName, c.phone customerPhone, CONCAT_WS(', ', c.address_line1, c.city, c.postcode) address
       FROM rabs_bookings b JOIN rabs_jobs j ON j.id = b.job_id JOIN rabs_customers c ON c.id = j.rabs_customer_id LEFT JOIN users u ON u.id = b.staff_user_id
      WHERE b.organization_id = ? AND b.status <> 'cancelled' AND b.scheduled_date BETWEEN ? AND ?${staffFilter}
      ORDER BY b.scheduled_date, staffName, b.slot`,
    isOfficeUser(ctx) ? [ctx.orgId, f, t] : [ctx.orgId, f, t, ctx.userId]
  );
  return { from: f, to: t, data: rows.map((r: any) => ({ ...r, scheduledDate: typeof r.scheduledDate === 'string' ? r.scheduledDate : dateStr(r.scheduledDate) })) };
}

function dateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function reportPurchasing(ctx: Ctx) {
  requireCap(ctx, 'materials', 'reports');
  return AppDataSource.query(
    `SELECT m.id, m.job_id jobId, j.job_number jobNumber, c.name customerName, m.description, m.unit, m.qty_required qtyRequired, m.qty_reserved qtyReserved,
            m.qty_short qtyShort, m.status, p.supplier, p.code productCode,
            (SELECT DATE_FORMAT(MIN(b.scheduled_date), '%Y-%m-%d') FROM rabs_bookings b WHERE b.job_id = j.id AND b.status IN ('booked','in_progress')) neededBy
       FROM rabs_material_items m JOIN rabs_jobs j ON j.id = m.job_id JOIN rabs_customers c ON c.id = j.rabs_customer_id
       LEFT JOIN rabs_products p ON p.id = m.product_id
      WHERE m.organization_id = ? AND m.status IN ('to_order','ordered') ORDER BY neededBy IS NULL, neededBy, m.id`,
    [ctx.orgId]
  );
}

// ---- Meta for the UI -------------------------------------------------------------------------

export async function meta(ctx: Ctx) {
  const statuses = await ensureStatuses(ctx.orgId);
  const canPrice = ctx.caps.has('view_prices');
  const canCost = ctx.caps.has('view_costs');
  const products = await repo(RabsProduct).find({ where: { organizationId: ctx.orgId, isActive: true }, order: { kind: 'ASC', category: 'ASC', sortOrder: 'ASC', name: 'ASC' } });
  const labour = canPrice ? await repo(RabsLabourRule).find({ where: { organizationId: ctx.orgId, isActive: true } }) : [];
  const staff = await staffList(ctx.orgId);
  const s = ctx.settings;
  return {
    me: { id: ctx.userId, roles: ctx.roles, permissions: [...ctx.caps] },
    statuses,
    progressSteps: PROGRESS_STEPS,
    products: products.map((p) => {
      const o: any = { ...p };
      if (!canCost) delete o.costPrice;
      if (!canPrice) delete o.sellPrice;
      return o;
    }),
    categories: [...new Set(products.filter((p) => p.kind !== 'accessory').map((p) => p.category))],
    labourRules: labour.map((l) => (canCost ? l : { ...l, costRate: undefined })),
    staff,
    roomTypes: ROOM_TYPES,
    leadSources: LEAD_SOURCES,
    appointmentPurposes: APPOINTMENT_PURPOSES,
    capabilities: CAPABILITIES,
    rabsRoles: RABS_ROLES,
    settings: {
      vatRate: s.vatRate,
      depositMode: s.depositMode,
      depositPercent: s.depositPercent,
      defaultDeliveryCharge: s.defaultDeliveryCharge,
      quoteValidityDays: s.quoteValidityDays,
      documentFooter: s.documentFooter,
      quoteTerms: s.quoteTerms,
      companyDetails: s.companyDetails,
      autoCloseWhenPaid: s.autoCloseWhenPaid
    },
    storage: s3Configured() ? 's3' : 'local',
    today: todayISO()
  };
}

export async function staffList(orgId: string) {
  const rows = await AppDataSource.query(
    `SELECT u.id, u.email, u.first_name firstName, u.last_name lastName, u.status, GROUP_CONCAT(DISTINCT r.code) roles
       FROM users u LEFT JOIN role_assignments ra ON ra.user_id = u.id LEFT JOIN roles r ON r.id = ra.role_id
      WHERE u.organization_id = ? AND u.deleted_at IS NULL GROUP BY u.id ORDER BY u.first_name, u.email`,
    [orgId]
  );
  return rows.map((r: any) => ({
    id: String(r.id),
    email: r.email,
    name: [r.firstName, r.lastName].filter(Boolean).join(' ') || r.email,
    firstName: r.firstName,
    lastName: r.lastName,
    status: r.status,
    roles: r.roles ? String(r.roles).split(',') : []
  }));
}
