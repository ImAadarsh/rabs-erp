import { In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import {
  RabsCustomer, RabsJob, RabsAppointment, RabsMeasurement, RabsRoom, RabsRoomAccessory, RabsProduct, RabsFile, RabsQuote
} from '@entities/rabs/RabsEntities.js';
import { Ctx, bad, conflict, notFound, loadJob, nextNumber, addTimeline, recomputeJob, storeFile, removeStoredFile, requireCap } from './rabsCore.js';
import { ftInToMetres, roomDimensions, productQuantity, accessoryQuantity, type RoomDims, round2 } from './rabsCalc.js';

const R = {
  customers: () => AppDataSource.getRepository(RabsCustomer),
  jobs: () => AppDataSource.getRepository(RabsJob),
  appts: () => AppDataSource.getRepository(RabsAppointment),
  meas: () => AppDataSource.getRepository(RabsMeasurement),
  rooms: () => AppDataSource.getRepository(RabsRoom),
  acc: () => AppDataSource.getRepository(RabsRoomAccessory),
  products: () => AppDataSource.getRepository(RabsProduct),
  files: () => AppDataSource.getRepository(RabsFile),
  quotes: () => AppDataSource.getRepository(RabsQuote)
};

export function customerAddress(c: Pick<RabsCustomer, 'addressLine1' | 'addressLine2' | 'city' | 'postcode'>) {
  return [c.addressLine1, c.addressLine2, c.city, c.postcode].filter(Boolean).join(', ');
}

// ---- Customers / enquiries -----------------------------------------------

export interface CustomerInput {
  name: string;
  phone?: string | null;
  email?: string | null;
  addressLine1?: string | null;
  addressLine2?: string | null;
  city?: string | null;
  postcode?: string | null;
  source?: string | null;
  notes?: string | null;
}

function normPhone(p?: string | null) {
  return p ? p.replace(/[^\d+]/g, '') : null;
}

/** Mirror into the core ERP customers table so the customer also appears in CRM/Orders. */
async function linkCoreCustomer(ctx: Ctx, c: RabsCustomer) {
  const [first, ...rest] = c.name.trim().split(/\s+/);
  const r = await AppDataSource.query(
    `INSERT INTO customers (organization_id, customer_number, email, phone, first_name, last_name, customer_type, notes, status)
     VALUES (?, ?, ?, ?, ?, ?, 'individual', ?, 'active')`,
    [ctx.orgId, `RABS-C${c.id}`, c.email, c.phone, first.slice(0, 100), rest.join(' ').slice(0, 100) || null, 'Created from RABS workflow']
  );
  const customerId = String(r.insertId);
  if (c.addressLine1 && c.city && c.postcode) {
    await AppDataSource.query(
      `INSERT INTO customer_addresses (customer_id, address_type, address_line1, address_line2, city, postal_code, country_code)
       VALUES (?, 'both', ?, ?, ?, ?, 'GB')`,
      [customerId, c.addressLine1, c.addressLine2, c.city, c.postcode]
    ).catch(() => undefined);
  }
  await R.customers().update({ id: c.id }, { customerId });
}

export async function findDuplicateCustomers(ctx: Ctx, phone?: string | null, email?: string | null) {
  const p = normPhone(phone);
  if (!p && !email) return [];
  const qb = R.customers().createQueryBuilder('c').where('c.organizationId = :org', { org: ctx.orgId });
  qb.andWhere(
    "(" + [p ? "REPLACE(REPLACE(c.phone,' ',''),'-','') = :p" : null, email ? 'c.email = :e' : null].filter(Boolean).join(' OR ') + ')',
    { p, e: email }
  );
  return qb.limit(5).getMany();
}

export async function createCustomer(ctx: Ctx, input: CustomerInput) {
  requireCap(ctx, 'customers');
  const c = await R.customers().save(
    R.customers().create({
      organizationId: ctx.orgId,
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      email: input.email?.trim().toLowerCase() || null,
      addressLine1: input.addressLine1?.trim() || null,
      addressLine2: input.addressLine2?.trim() || null,
      city: input.city?.trim() || null,
      postcode: input.postcode?.trim().toUpperCase() || null,
      source: input.source || null,
      notes: input.notes || null,
      createdBy: ctx.userId
    })
  );
  await linkCoreCustomer(ctx, c).catch((e) => console.warn('[rabs] core customer link failed:', e?.message));
  return c;
}

export async function updateCustomer(ctx: Ctx, id: string, input: Partial<CustomerInput>) {
  requireCap(ctx, 'customers');
  const c = await R.customers().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!c) throw notFound('Customer');
  const patch: Partial<RabsCustomer> = {};
  for (const k of ['name', 'phone', 'email', 'addressLine1', 'addressLine2', 'city', 'postcode', 'source', 'notes'] as const) {
    if (input[k] !== undefined) (patch as any)[k] = typeof input[k] === 'string' ? (input[k] as string).trim() || null : input[k];
  }
  if (patch.postcode) patch.postcode = patch.postcode.toUpperCase();
  if (patch.email) patch.email = patch.email.toLowerCase();
  if (patch.name === null) throw bad('Name is required');
  await R.customers().update({ id }, patch);
  if (c.customerId) {
    await AppDataSource.query('UPDATE customers SET email = ?, phone = ? WHERE id = ?', [patch.email ?? c.email, patch.phone ?? c.phone, c.customerId]).catch(() => undefined);
  }
  const jobs = await R.jobs().find({ where: { rabsCustomerId: id } });
  for (const j of jobs) await addTimeline(ctx, j.id, 'customer', 'Customer details updated');
  return R.customers().findOneOrFail({ where: { id } });
}

export async function listCustomers(ctx: Ctx, q?: string) {
  requireCap(ctx, 'customers');
  const qb = R.customers().createQueryBuilder('c').where('c.organizationId = :org', { org: ctx.orgId }).orderBy('c.id', 'DESC').limit(100);
  if (q && q.trim()) {
    const like = `%${q.trim()}%`;
    qb.andWhere('(c.name LIKE :l OR c.phone LIKE :l OR c.email LIKE :l OR c.postcode LIKE :l OR c.addressLine1 LIKE :l)', { l: like });
  }
  const rows = await qb.getMany();
  const counts = rows.length
    ? await AppDataSource.query(
        'SELECT rabs_customer_id id, COUNT(*) n, MAX(id) lastJob FROM rabs_jobs WHERE rabs_customer_id IN (?) GROUP BY rabs_customer_id',
        [rows.map((r) => r.id)]
      )
    : [];
  const map = new Map<string, any>(counts.map((c: any) => [String(c.id), c]));
  return rows.map((r) => ({ ...r, address: customerAddress(r), jobCount: Number(map.get(r.id)?.n || 0), lastJobId: map.get(r.id)?.lastJob ? String(map.get(r.id).lastJob) : null }));
}

export async function getCustomer(ctx: Ctx, id: string) {
  requireCap(ctx, 'customers');
  const c = await R.customers().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!c) throw notFound('Customer');
  const jobs = await R.jobs().find({ where: { rabsCustomerId: id }, order: { id: 'DESC' } });
  return { ...c, address: customerAddress(c), jobs };
}

// ---- Jobs (one per enquiry — the job number stays from start to finish) ----

export interface NewJobInput {
  customerId: string;
  title?: string | null;
  siteAddress?: string | null;
  requiresFitting?: boolean;
  requiresDelivery?: boolean;
  notes?: string | null;
  surveyorUserId?: string | null;
}

export async function createJob(ctx: Ctx, input: NewJobInput) {
  requireCap(ctx, 'customers');
  const c = await R.customers().findOne({ where: { id: input.customerId, organizationId: ctx.orgId } });
  if (!c) throw notFound('Customer');
  const jobNumber = await nextNumber(ctx.orgId, 'job');
  const job = await R.jobs().save(
    R.jobs().create({
      organizationId: ctx.orgId,
      jobNumber,
      rabsCustomerId: c.id,
      status: 'NEW',
      title: input.title?.trim() || null,
      siteAddress: input.siteAddress?.trim() || null,
      requiresFitting: input.requiresFitting ?? true,
      requiresDelivery: input.requiresDelivery ?? false,
      notes: input.notes || null,
      surveyorUserId: input.surveyorUserId || null,
      materialsStatus: 'not_checked',
      hasIssue: false,
      totalAmount: 0,
      depositRequired: 0,
      paidAmount: 0,
      balanceDue: 0,
      createdBy: ctx.userId
    })
  );
  await addTimeline(ctx, job.id, 'created', `Enquiry ${jobNumber} created for ${c.name}${c.source ? ` (source: ${c.source})` : ''}`);
  return job;
}

export async function updateJob(ctx: Ctx, id: string, input: Partial<NewJobInput>) {
  requireCap(ctx, 'customers', 'bookings');
  const job = await loadJob(ctx, id);
  const patch: Partial<RabsJob> = {};
  if (input.title !== undefined) patch.title = input.title?.trim() || null;
  if (input.siteAddress !== undefined) patch.siteAddress = input.siteAddress?.trim() || null;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.requiresFitting !== undefined) patch.requiresFitting = input.requiresFitting;
  if (input.requiresDelivery !== undefined) patch.requiresDelivery = input.requiresDelivery;
  if (input.surveyorUserId !== undefined) patch.surveyorUserId = input.surveyorUserId || null;
  if (patch.requiresFitting === false && patch.requiresDelivery === false) throw bad('A job needs fitting, delivery, or both');
  await R.jobs().update({ id: job.id }, patch);
  if (input.requiresFitting !== undefined || input.requiresDelivery !== undefined) {
    await addTimeline(ctx, job.id, 'job', `Work type updated: ${[(patch.requiresFitting ?? job.requiresFitting) && 'fitting', (patch.requiresDelivery ?? job.requiresDelivery) && 'delivery'].filter(Boolean).join(' + ')}`);
  }
  return recomputeJob(ctx, job.id);
}

// ---- Appointments -----------------------------------------------------------

export interface AppointmentInput {
  scheduledAt: string;
  durationMin?: number;
  purpose?: string;
  staffUserId?: string | null;
  notes?: string | null;
}

export function parseDateTime(v: string, field = 'Date/time'): Date {
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw bad(`${field} is not a valid date`);
  const year = d.getFullYear();
  if (year < 2020 || year > 2100) throw bad(`${field} is out of range`);
  return d;
}

export async function createAppointment(ctx: Ctx, jobId: string, input: AppointmentInput) {
  requireCap(ctx, 'appointments');
  const job = await loadJob(ctx, jobId);
  if (job.closedAt) throw conflict('This job is closed');
  const when = parseDateTime(input.scheduledAt, 'Appointment date/time');
  const appt = await R.appts().save(
    R.appts().create({
      organizationId: ctx.orgId,
      jobId: job.id,
      scheduledAt: when,
      durationMin: input.durationMin ?? 60,
      purpose: input.purpose || 'measure',
      staffUserId: input.staffUserId || null,
      notes: input.notes || null,
      status: 'booked',
      createdBy: ctx.userId
    })
  );
  if (input.staffUserId && !job.surveyorUserId) await R.jobs().update({ id: job.id }, { surveyorUserId: input.staffUserId });
  await addTimeline(ctx, job.id, 'appointment', `Appointment booked for ${when.toLocaleString('en-GB', { timeZone: 'Europe/London', dateStyle: 'medium', timeStyle: 'short' })} (${appt.purpose})`);
  await recomputeJob(ctx, job.id);
  return appt;
}

export async function updateAppointment(ctx: Ctx, id: string, input: Partial<AppointmentInput> & { status?: 'booked' | 'done' | 'cancelled' }) {
  requireCap(ctx, 'appointments');
  const appt = await R.appts().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!appt) throw notFound('Appointment');
  const patch: Partial<RabsAppointment> = {};
  if (input.scheduledAt) patch.scheduledAt = parseDateTime(input.scheduledAt, 'Appointment date/time');
  if (input.durationMin !== undefined) patch.durationMin = input.durationMin;
  if (input.purpose) patch.purpose = input.purpose;
  if (input.staffUserId !== undefined) patch.staffUserId = input.staffUserId || null;
  if (input.notes !== undefined) patch.notes = input.notes || null;
  if (input.status) patch.status = input.status;
  await R.appts().update({ id }, patch);
  const msg = input.status === 'cancelled' ? 'Appointment cancelled' : input.scheduledAt ? 'Appointment rescheduled' : 'Appointment updated';
  await addTimeline(ctx, appt.jobId, 'appointment', msg);
  await recomputeJob(ctx, appt.jobId);
  return R.appts().findOneOrFail({ where: { id } });
}

export async function listAppointments(ctx: Ctx, from?: string, to?: string, staffUserId?: string) {
  requireCap(ctx, 'appointments', 'fieldwork');
  const params: unknown[] = [ctx.orgId];
  let where = 'a.organization_id = ? AND a.status <> "cancelled"';
  if (from) {
    where += ' AND a.scheduled_at >= ?';
    params.push(parseDateTime(from, 'From'));
  }
  if (to) {
    where += ' AND a.scheduled_at < ?';
    params.push(parseDateTime(to, 'To'));
  }
  if (staffUserId) {
    where += ' AND a.staff_user_id = ?';
    params.push(staffUserId);
  }
  return AppDataSource.query(
    `SELECT a.id, a.job_id jobId, a.scheduled_at scheduledAt, a.duration_min durationMin, a.purpose, a.status, a.notes,
            a.staff_user_id staffUserId, TRIM(CONCAT(COALESCE(u.first_name,''),' ',COALESCE(u.last_name,''))) staffName,
            j.job_number jobNumber, j.status jobStatus, c.name customerName, c.phone customerPhone,
            CONCAT_WS(', ', c.address_line1, c.city, c.postcode) address
       FROM rabs_appointments a
       JOIN rabs_jobs j ON j.id = a.job_id
       JOIN rabs_customers c ON c.id = j.rabs_customer_id
       LEFT JOIN users u ON u.id = a.staff_user_id
      WHERE ${where}
      ORDER BY a.scheduled_at ASC LIMIT 500`,
    params
  );
}

// ---- Measurement & rooms ---------------------------------------------------

async function assertMeasurementEditable(jobId: string) {
  const accepted = await R.quotes().count({ where: { jobId, status: 'accepted' } });
  if (accepted) throw conflict('The quotation has been accepted — rooms are locked. Add a variation on the job instead.');
}

export async function startMeasurement(ctx: Ctx, jobId: string, appointmentId?: string | null) {
  requireCap(ctx, 'measure');
  const job = await loadJob(ctx, jobId);
  if (job.closedAt) throw conflict('This job is closed');
  let m = await R.meas().findOne({ where: { jobId: job.id }, order: { id: 'DESC' } });
  if (!m) {
    m = await R.meas().save(
      R.meas().create({ organizationId: ctx.orgId, jobId: job.id, appointmentId: appointmentId || null, status: 'draft', measuredBy: ctx.userId })
    );
    await addTimeline(ctx, job.id, 'measurement', 'Measurement started');
  }
  const openAppt = await R.appts().findOne({ where: { jobId: job.id, status: 'booked' }, order: { scheduledAt: 'ASC' } });
  if (openAppt && (!appointmentId || appointmentId === openAppt.id)) await R.appts().update({ id: openAppt.id }, { status: 'done' });
  return m;
}

export interface RoomInput {
  name: string;
  unitInput: 'm' | 'ftin';
  lengthM?: number | null;
  widthM?: number | null;
  lengthFt?: number | null;
  lengthIn?: number | null;
  widthFt?: number | null;
  widthIn?: number | null;
  doors?: number;
  stairs?: number;
  productId?: string | null;
  productQty?: number | null;
  notes?: string | null;
  accessories?: Array<{ productId: string; qty: number }>;
}

const ZERO_DIMS: RoomDims = { lengthM: 0, widthM: 0, areaM2: 0, areaSqyd: 0, perimeterM: 0 };

export function resolveDims(input: Pick<RoomInput, 'unitInput' | 'lengthM' | 'widthM' | 'lengthFt' | 'lengthIn' | 'widthFt' | 'widthIn'>, allowEmpty: boolean) {
  let l = 0;
  let w = 0;
  if (input.unitInput === 'ftin') {
    const hasAny = [input.lengthFt, input.lengthIn, input.widthFt, input.widthIn].some((v) => v !== null && v !== undefined && Number(v) > 0);
    if (!hasAny && allowEmpty) return ZERO_DIMS;
    try {
      l = ftInToMetres(Number(input.lengthFt || 0), Number(input.lengthIn || 0));
      w = ftInToMetres(Number(input.widthFt || 0), Number(input.widthIn || 0));
    } catch (e: any) {
      throw bad(e.message);
    }
  } else {
    l = Number(input.lengthM || 0);
    w = Number(input.widthM || 0);
    if (!(l > 0) && !(w > 0) && allowEmpty) return ZERO_DIMS;
  }
  try {
    return roomDimensions(l, w);
  } catch (e: any) {
    throw bad(e.message);
  }
}

/** Accessories applicable to a product's category, with suggested quantities for the room. */
export async function suggestAccessories(ctx: Ctx, product: RabsProduct | null, dims: RoomDims, doors: number) {
  const all = await R.products().find({ where: { organizationId: ctx.orgId, kind: 'accessory', isActive: true }, order: { sortOrder: 'ASC', name: 'ASC' } });
  const cat = product?.category;
  return all
    .filter((a) => !a.appliesTo || a.appliesTo.length === 0 || (cat && a.appliesTo.includes(cat)))
    .map((a) => ({
      productId: a.id,
      name: a.name,
      unit: a.unit,
      sellPrice: a.sellPrice,
      defaultSelected: a.defaultSelected,
      suggestedQty: dims.areaM2 > 0 || a.accessoryBasis === 'each' || a.accessoryBasis === 'door' ? accessoryQuantity(a, dims, doors) : 1
    }));
}

export async function calcRoomPreview(ctx: Ctx, input: RoomInput) {
  const product = input.productId ? await R.products().findOne({ where: { id: input.productId, organizationId: ctx.orgId } }) : null;
  const perItem = product?.calcMethod === 'per_item';
  const dims = resolveDims(input, perItem || !product);
  let productQty: number | null = null;
  if (product) {
    if (!perItem && dims.areaM2 <= 0) throw bad('Enter the room length and width');
    try {
      productQty = input.productQty ?? productQuantity(product, dims);
    } catch (e: any) {
      throw bad(e.message);
    }
  }
  const accessories = product && product.kind === 'flooring' ? await suggestAccessories(ctx, product, dims, input.doors ?? 1) : [];
  return { ...dims, productQty, productUnit: product?.unit ?? null, accessories };
}

async function saveRoomAccessories(ctx: Ctx, room: RabsRoom, product: RabsProduct | null, dims: RoomDims, accessories?: RoomInput['accessories']) {
  let list = accessories;
  if (list === undefined) {
    if (!product || product.kind !== 'flooring') list = [];
    else {
      const sugg = await suggestAccessories(ctx, product, dims, room.doors);
      list = sugg.filter((s) => s.defaultSelected).map((s) => ({ productId: s.productId, qty: s.suggestedQty }));
    }
  }
  const ids = list.map((a) => a.productId);
  if (ids.length) {
    const valid = await R.products().count({ where: { id: In(ids), organizationId: ctx.orgId, kind: 'accessory' } });
    if (valid !== new Set(ids).size) throw bad('One of the selected accessories is not in the catalogue');
  }
  await R.acc().delete({ roomId: room.id });
  for (const a of list) {
    const qty = round2(Number(a.qty));
    if (!(qty > 0) || qty > 10000) throw bad('Accessory quantities must be between 0 and 10,000');
    await R.acc().insert({ roomId: room.id, productId: a.productId, qty });
  }
}

export async function addRoom(ctx: Ctx, measurementId: string, input: RoomInput) {
  requireCap(ctx, 'measure');
  const m = await R.meas().findOne({ where: { id: measurementId, organizationId: ctx.orgId } });
  if (!m) throw notFound('Measurement');
  await loadJob(ctx, m.jobId);
  await assertMeasurementEditable(m.jobId);
  const product = input.productId ? await R.products().findOne({ where: { id: input.productId, organizationId: ctx.orgId, isActive: true } }) : null;
  if (input.productId && !product) throw bad('Selected product is not in the catalogue');
  const perItem = product?.calcMethod === 'per_item';
  const dims = resolveDims(input, perItem || !product);
  if (product && !perItem && dims.areaM2 <= 0) throw bad('Enter the room length and width');
  const order = Number((await AppDataSource.query('SELECT COALESCE(MAX(sort_order),0)+1 n FROM rabs_rooms WHERE measurement_id = ?', [m.id]))[0].n);
  const room = await R.rooms().save(
    R.rooms().create({
      measurementId: m.id,
      jobId: m.jobId,
      name: input.name.trim(),
      unitInput: input.unitInput,
      lengthFt: input.unitInput === 'ftin' ? Number(input.lengthFt || 0) : null,
      lengthIn: input.unitInput === 'ftin' ? Number(input.lengthIn || 0) : null,
      widthFt: input.unitInput === 'ftin' ? Number(input.widthFt || 0) : null,
      widthIn: input.unitInput === 'ftin' ? Number(input.widthIn || 0) : null,
      ...dims,
      doors: input.doors ?? 1,
      stairs: input.stairs ?? 0,
      productId: product?.id ?? null,
      productQty: input.productQty ?? null,
      notes: input.notes || null,
      sortOrder: order
    })
  );
  await saveRoomAccessories(ctx, room, product, dims, input.accessories);
  await addTimeline(ctx, m.jobId, 'room', `Room added: ${room.name}${dims.areaM2 ? ` ${dims.lengthM}m × ${dims.widthM}m (${dims.areaM2} m²)` : ''}${product ? ` — ${product.name}` : ''}`);
  await recomputeJob(ctx, m.jobId);
  return room;
}

export async function updateRoom(ctx: Ctx, roomId: string, input: Partial<RoomInput>) {
  requireCap(ctx, 'measure');
  const room = await R.rooms().findOne({ where: { id: roomId } });
  if (!room) throw notFound('Room');
  await loadJob(ctx, room.jobId);
  await assertMeasurementEditable(room.jobId);
  const merged: RoomInput = {
    name: input.name ?? room.name,
    unitInput: input.unitInput ?? room.unitInput,
    lengthM: input.lengthM ?? room.lengthM,
    widthM: input.widthM ?? room.widthM,
    lengthFt: input.lengthFt ?? room.lengthFt,
    lengthIn: input.lengthIn ?? room.lengthIn,
    widthFt: input.widthFt ?? room.widthFt,
    widthIn: input.widthIn ?? room.widthIn,
    doors: input.doors ?? room.doors,
    stairs: input.stairs ?? room.stairs,
    productId: input.productId !== undefined ? input.productId : room.productId,
    productQty: input.productQty !== undefined ? input.productQty : room.productQty,
    notes: input.notes !== undefined ? input.notes : room.notes
  };
  const product = merged.productId ? await R.products().findOne({ where: { id: merged.productId, organizationId: ctx.orgId } }) : null;
  if (merged.productId && !product) throw bad('Selected product is not in the catalogue');
  const perItem = product?.calcMethod === 'per_item';
  const dims = resolveDims(merged, perItem || !product);
  if (product && !perItem && dims.areaM2 <= 0) throw bad('Enter the room length and width');
  await R.rooms().update(
    { id: room.id },
    {
      name: merged.name.trim(),
      unitInput: merged.unitInput,
      lengthFt: merged.unitInput === 'ftin' ? Number(merged.lengthFt || 0) : null,
      lengthIn: merged.unitInput === 'ftin' ? Number(merged.lengthIn || 0) : null,
      widthFt: merged.unitInput === 'ftin' ? Number(merged.widthFt || 0) : null,
      widthIn: merged.unitInput === 'ftin' ? Number(merged.widthIn || 0) : null,
      ...dims,
      doors: merged.doors ?? 1,
      stairs: merged.stairs ?? 0,
      productId: product?.id ?? null,
      productQty: merged.productQty ?? null,
      notes: merged.notes || null
    }
  );
  const fresh = await R.rooms().findOneOrFail({ where: { id: room.id } });
  if (input.accessories !== undefined || input.productId !== undefined) await saveRoomAccessories(ctx, fresh, product, dims, input.accessories);
  await addTimeline(ctx, room.jobId, 'room', `Room updated: ${fresh.name}`);
  return fresh;
}

export async function deleteRoom(ctx: Ctx, roomId: string) {
  requireCap(ctx, 'measure');
  const room = await R.rooms().findOne({ where: { id: roomId } });
  if (!room) throw notFound('Room');
  await loadJob(ctx, room.jobId);
  await assertMeasurementEditable(room.jobId);
  const photos = await R.files().find({ where: { roomId: room.id } });
  for (const p of photos) await removeStoredFile(p.storageKey);
  await R.files().delete({ roomId: room.id });
  await R.acc().delete({ roomId: room.id });
  await R.rooms().delete({ id: room.id });
  await addTimeline(ctx, room.jobId, 'room', `Room removed: ${room.name}`);
  await recomputeJob(ctx, room.jobId);
}

export async function addRoomPhotos(ctx: Ctx, roomId: string, files: Express.Multer.File[]) {
  requireCap(ctx, 'measure');
  const room = await R.rooms().findOne({ where: { id: roomId } });
  if (!room) throw notFound('Room');
  await loadJob(ctx, room.jobId);
  if (!files?.length) throw bad('Choose at least one photo');
  const saved: RabsFile[] = [];
  for (const f of files) {
    const { url, key } = await storeFile(ctx.orgId, `jobs/${room.jobId}/rooms`, f, { imagesOnly: true });
    saved.push(
      await R.files().save(
        R.files().create({ organizationId: ctx.orgId, jobId: room.jobId, roomId: room.id, kind: 'room_photo', url, storageKey: key, mimeType: f.mimetype, sizeBytes: f.size, uploadedBy: ctx.userId })
      )
    );
  }
  await addTimeline(ctx, room.jobId, 'photo', `${saved.length} photo(s) added to ${room.name}`);
  return saved;
}

export async function addJobFiles(ctx: Ctx, jobId: string, files: Express.Multer.File[], kind: 'document' | 'other' = 'document', caption?: string) {
  const job = await loadJob(ctx, jobId);
  if (!files?.length) throw bad('Choose a file to upload');
  const saved: RabsFile[] = [];
  for (const f of files) {
    const { url, key } = await storeFile(ctx.orgId, `jobs/${job.id}/docs`, f, { maxMb: 20 });
    saved.push(
      await R.files().save(
        R.files().create({ organizationId: ctx.orgId, jobId: job.id, kind, url, storageKey: key, mimeType: f.mimetype, sizeBytes: f.size, caption: caption || f.originalname.slice(0, 255), uploadedBy: ctx.userId })
      )
    );
  }
  await addTimeline(ctx, job.id, 'document', `${saved.length} document(s) attached`);
  return saved;
}

export async function deleteFile(ctx: Ctx, fileId: string) {
  const f = await R.files().findOne({ where: { id: fileId, organizationId: ctx.orgId } });
  if (!f) throw notFound('File');
  await loadJob(ctx, f.jobId);
  if (f.kind === 'signature') throw conflict('Signatures cannot be deleted');
  if (f.uploadedBy !== ctx.userId) requireCap(ctx, 'customers', 'admin');
  await removeStoredFile(f.storageKey);
  await R.files().delete({ id: f.id });
  await addTimeline(ctx, f.jobId, 'photo', `File removed (${f.kind.replace('_', ' ')})`);
}

export async function updateMeasurementNotes(ctx: Ctx, id: string, notes: string | null) {
  requireCap(ctx, 'measure');
  const m = await R.meas().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!m) throw notFound('Measurement');
  await R.meas().update({ id }, { notes: notes || null });
  return R.meas().findOneOrFail({ where: { id } });
}
