import { In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import {
  RabsJob, RabsPayment, RabsInvoice, RabsVariation, RabsQuote, RabsQuoteLine, RabsProduct, RabsMaterialItem, RabsBooking, RabsFile
} from '@entities/rabs/RabsEntities.js';
import {
  Ctx, HttpError, bad, conflict, notFound, loadJob, nextNumber, addTimeline, recomputeJob, requireCap, storeFile, removeStoredFile, todayISO, dateOnly
} from './rabsCore.js';
import { round2, addVat, balanceDue } from './rabsCalc.js';
import { DEFAULT_CHECKLISTS } from './rabsWorkflow.js';
import { unitLabel } from './rabsQuotes.js';

const R = {
  jobs: () => AppDataSource.getRepository(RabsJob),
  payments: () => AppDataSource.getRepository(RabsPayment),
  invoices: () => AppDataSource.getRepository(RabsInvoice),
  variations: () => AppDataSource.getRepository(RabsVariation),
  quotes: () => AppDataSource.getRepository(RabsQuote),
  lines: () => AppDataSource.getRepository(RabsQuoteLine),
  products: () => AppDataSource.getRepository(RabsProduct),
  materials: () => AppDataSource.getRepository(RabsMaterialItem),
  bookings: () => AppDataSource.getRepository(RabsBooking),
  files: () => AppDataSource.getRepository(RabsFile)
};

const money = (n: number) => `£${n.toFixed(2)}`;

// ---- Payments (deposit / part / balance) -------------------------------------

export interface PaymentInput {
  amount: number;
  method: 'cash' | 'card' | 'bank_transfer' | 'finance' | 'cheque' | 'other';
  kind?: 'deposit' | 'part' | 'balance' | 'refund';
  paidAt?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export async function recordPayment(ctx: Ctx, jobId: string, input: PaymentInput) {
  requireCap(ctx, 'payments');
  let job = await loadJob(ctx, jobId);
  if (!job.acceptedQuoteId) throw bad('Accept the quotation before taking payments');
  if (job.closedAt) throw conflict('This job is closed');
  job = await recomputeJob(ctx, job.id);
  const amount = round2(input.amount);
  if (!(amount > 0)) throw bad('Enter an amount greater than £0');
  let kind = input.kind;
  if (kind === 'refund') {
    if (amount > job.paidAmount + 0.005) throw bad(`Refund cannot be more than the ${money(job.paidAmount)} paid`);
  } else {
    if (amount > job.balanceDue + 0.005) throw bad(`That is more than the outstanding balance of ${money(job.balanceDue)}`);
    if (!kind) {
      if (job.paidAmount + 0.005 < job.depositRequired) kind = 'deposit';
      else if (amount + 0.005 >= job.balanceDue) kind = 'balance';
      else kind = 'part';
    }
  }
  const paidAt = input.paidAt ? new Date(input.paidAt) : new Date();
  if (Number.isNaN(paidAt.getTime())) throw bad('Payment date is not valid');
  const p = await R.payments().save(
    R.payments().create({
      organizationId: ctx.orgId,
      jobId: job.id,
      kind: kind!,
      method: input.method,
      amount,
      paidAt,
      reference: input.reference?.trim() || null,
      notes: input.notes?.trim() || null,
      recordedBy: ctx.userId
    })
  );
  const label = { deposit: 'Deposit', part: 'Part payment', balance: 'Balance payment', refund: 'Refund' }[kind!];
  await addTimeline(ctx, job.id, 'payment', `${label} of ${money(amount)} recorded (${input.method.replace('_', ' ')})`);
  const after = await recomputeJob(ctx, job.id);
  if (kind === 'deposit' && after.paidAmount + 0.005 >= after.depositRequired && job.paidAmount + 0.005 < job.depositRequired) {
    await addTimeline(ctx, job.id, 'confirmed', 'Deposit rule met — job confirmed');
  }
  return { payment: p, job: after };
}

export async function deletePayment(ctx: Ctx, id: string) {
  requireCap(ctx, 'admin');
  const p = await R.payments().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!p) throw notFound('Payment');
  await R.payments().delete({ id });
  await addTimeline(ctx, p.jobId, 'payment', `Payment of ${money(p.amount)} removed by admin`);
  return recomputeJob(ctx, p.jobId);
}

// ---- Variations (approved extras after acceptance) ---------------------------

export async function addVariation(ctx: Ctx, jobId: string, input: { description: string; netAmount: number; approve?: boolean }) {
  requireCap(ctx, 'quotes', 'payments');
  const job = await loadJob(ctx, jobId);
  if (!job.acceptedQuoteId) throw bad('Variations are for accepted jobs. Edit the quotation instead.');
  if (job.closedAt) throw conflict('This job is closed');
  const q = await R.quotes().findOneOrFail({ where: { id: job.acceptedQuoteId } });
  const v = addVat(input.netAmount, q.vatRate);
  if (v.gross + job.totalAmount < 0) throw bad('A credit variation cannot exceed the job total');
  const row = await R.variations().save(
    R.variations().create({
      organizationId: ctx.orgId,
      jobId: job.id,
      description: input.description.trim(),
      netAmount: v.net,
      vatAmount: v.vat,
      total: v.gross,
      status: input.approve ? 'approved' : 'pending',
      approvedAt: input.approve ? new Date() : null,
      createdBy: ctx.userId
    })
  );
  await addTimeline(ctx, job.id, 'variation', `Variation ${input.approve ? 'approved' : 'added'}: ${row.description} (${money(v.gross)} inc VAT)`);
  await refreshInvoiceIfAny(ctx, job.id);
  await recomputeJob(ctx, job.id);
  return row;
}

export async function setVariationStatus(ctx: Ctx, id: string, status: 'approved' | 'rejected') {
  requireCap(ctx, 'quotes', 'payments');
  const v = await R.variations().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!v) throw notFound('Variation');
  await loadJob(ctx, v.jobId);
  await R.variations().update({ id }, { status, approvedAt: status === 'approved' ? new Date() : null });
  await addTimeline(ctx, v.jobId, 'variation', `Variation ${status}: ${v.description}`);
  await refreshInvoiceIfAny(ctx, v.jobId);
  return recomputeJob(ctx, v.jobId);
}

// ---- Invoice: accepted quote + approved variations; payments apply automatically ----

async function invoicePayload(jobId: string) {
  const job = await R.jobs().findOneOrFail({ where: { id: jobId } });
  const q = await R.quotes().findOneOrFail({ where: { id: job.acceptedQuoteId! } });
  const qLines = await R.lines().find({ where: { quoteId: q.id }, order: { sortOrder: 'ASC', id: 'ASC' } });
  const vars = await R.variations().find({ where: { jobId, status: 'approved' } });
  const lines: Array<Record<string, unknown>> = qLines.map((l) => ({
    room: l.roomName,
    type: l.lineType,
    description: l.description,
    qty: l.qty,
    unit: unitLabel(l.unit),
    unitPrice: l.unitPrice,
    total: l.lineTotal
  }));
  if (q.discountAmount > 0) lines.push({ room: null, type: 'discount', description: 'Discount', qty: 1, unit: '', unitPrice: -q.discountAmount, total: -q.discountAmount });
  if (q.deliveryCharge > 0) lines.push({ room: null, type: 'delivery', description: 'Delivery', qty: 1, unit: '', unitPrice: q.deliveryCharge, total: q.deliveryCharge });
  for (const v of vars) lines.push({ room: null, type: 'variation', description: `Variation: ${v.description}`, qty: 1, unit: '', unitPrice: v.netAmount, total: v.netAmount });
  const net = round2(q.netTotal + vars.reduce((s, v) => s + v.netAmount, 0));
  const vat = round2(q.vatAmount + vars.reduce((s, v) => s + v.vatAmount, 0));
  return { job, q, lines, net, vat, total: round2(net + vat) };
}

async function refreshInvoiceIfAny(ctx: Ctx, jobId: string) {
  const inv = await R.invoices().findOne({ where: { jobId } });
  if (!inv) return;
  const p = await invoicePayload(jobId);
  await R.invoices().update({ id: inv.id }, { lines: p.lines, netTotal: p.net, vatAmount: p.vat, total: p.total, balance: balanceDue(p.total, inv.paidAmount) });
  await addTimeline(ctx, jobId, 'invoice', `Invoice ${inv.invoiceNumber} updated — total ${money(p.total)}`);
}

/** COLLECT BALANCE step: issue (or refresh) the invoice. */
export async function generateInvoice(ctx: Ctx, jobId: string) {
  requireCap(ctx, 'invoices', 'payments');
  const job = await loadJob(ctx, jobId);
  if (!job.convertedAt) throw bad('Convert the quotation to a job first');
  const existing = await R.invoices().findOne({ where: { jobId: job.id } });
  if (existing) {
    await refreshInvoiceIfAny(ctx, job.id);
  } else {
    const p = await invoicePayload(job.id);
    const invoiceNumber = await nextNumber(ctx.orgId, 'invoice');
    await R.invoices().insert({
      organizationId: ctx.orgId,
      jobId: job.id,
      quoteId: p.q.id,
      invoiceNumber,
      status: 'issued',
      netTotal: p.net,
      vatAmount: p.vat,
      total: p.total,
      paidAmount: 0,
      balance: p.total,
      lines: p.lines,
      issuedAt: new Date()
    });
    await addTimeline(ctx, job.id, 'invoice', `Invoice ${invoiceNumber} issued — total ${money(p.total)}`);
  }
  await recomputeJob(ctx, job.id);
  return R.invoices().findOneOrFail({ where: { jobId: job.id } });
}

// ---- Materials & stock ---------------------------------------------------------

async function availableFor(variantId: string): Promise<number> {
  const [r] = await AppDataSource.query(
    "SELECT COALESCE(SUM(quantity_on_hand - quantity_reserved),0) a FROM stock_items WHERE variant_id = ? AND status IN ('available','reserved')",
    [variantId]
  );
  return Math.max(0, Number(r.a));
}

async function adjustReserved(variantId: string, delta: number) {
  if (!delta) return;
  const rows: Array<{ id: string; onHand: number; reserved: number }> = await AppDataSource.query(
    "SELECT id, quantity_on_hand onHand, quantity_reserved reserved FROM stock_items WHERE variant_id = ? AND status IN ('available','reserved') ORDER BY id",
    [variantId]
  );
  let left = Math.abs(delta);
  for (const r of rows) {
    if (left <= 0) break;
    const room = delta > 0 ? Number(r.onHand) - Number(r.reserved) : Number(r.reserved);
    const take = Math.min(room, left);
    if (take <= 0) continue;
    await AppDataSource.query('UPDATE stock_items SET quantity_reserved = quantity_reserved + ? WHERE id = ?', [delta > 0 ? take : -take, r.id]);
    left -= take;
  }
}

/** CHECK MATERIALS: compare required products/accessories to stock, reserve what's available, flag the rest for purchasing. */
export async function checkMaterials(ctx: Ctx, jobId: string) {
  requireCap(ctx, 'materials');
  const job = await loadJob(ctx, jobId);
  if (!job.convertedAt) throw bad('Convert the quotation to a job first');
  const lines = await R.lines().find({ where: { quoteId: job.acceptedQuoteId!, lineType: In(['product', 'accessory']) } });
  const req = new Map<string, number>();
  for (const l of lines) if (l.productId) req.set(l.productId, round2((req.get(l.productId) || 0) + l.qty));
  const products = req.size ? await R.products().find({ where: { id: In([...req.keys()]) } }) : [];
  const existing = await R.materials().find({ where: { jobId: job.id } });

  for (const item of existing) {
    if (item.variantId && item.qtyReserved > 0 && ['reserved', 'to_order', 'not_tracked'].includes(item.status)) await adjustReserved(item.variantId, -item.qtyReserved);
  }
  const keep = new Map(existing.filter((e) => e.status === 'received' || e.status === 'ordered' || e.status === 'used').map((e) => [e.productId, e]));
  await R.materials().delete({ jobId: job.id, status: In(['reserved', 'to_order', 'not_tracked']) });

  let short = 0;
  for (const p of products) {
    const qty = req.get(p.id)!;
    const kept = keep.get(p.id);
    if (kept) {
      await R.materials().update({ id: kept.id }, { qtyRequired: qty, checkedAt: new Date() });
      if (kept.status === 'ordered') short++;
      continue;
    }
    const units = Math.ceil(qty - 0.0001);
    let reserved = 0;
    let status: RabsMaterialItem['status'] = 'to_order';
    if (p.variantId) {
      const avail = await availableFor(p.variantId);
      reserved = Math.min(avail, units);
      if (reserved > 0) await adjustReserved(p.variantId, reserved);
      status = reserved >= units ? 'reserved' : 'to_order';
    }
    if (status === 'to_order') short++;
    await R.materials().insert({
      organizationId: ctx.orgId,
      jobId: job.id,
      productId: p.id,
      description: p.name,
      unit: p.unit,
      qtyRequired: qty,
      qtyReserved: reserved,
      qtyShort: Math.max(0, units - reserved),
      variantId: p.variantId,
      status,
      checkedAt: new Date()
    });
  }
  const materialsStatus = short > 0 ? 'pending' : 'ready';
  await R.jobs().update({ id: job.id }, { materialsStatus });
  await addTimeline(
    ctx,
    job.id,
    'materials',
    short > 0 ? `Materials checked: ${short} item(s) need ordering — flagged for purchasing` : 'Materials checked: everything in stock and reserved'
  );
  await recomputeJob(ctx, job.id);
  return R.materials().find({ where: { jobId: job.id } });
}

export async function setMaterialStatus(ctx: Ctx, id: string, status: 'ordered' | 'received') {
  requireCap(ctx, 'materials');
  const m = await R.materials().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!m) throw notFound('Material');
  await loadJob(ctx, m.jobId);
  await R.materials().update({ id }, { status, qtyShort: status === 'received' ? 0 : m.qtyShort });
  const all = await R.materials().find({ where: { jobId: m.jobId } });
  const pending = all.some((x) => x.status === 'to_order' || x.status === 'ordered');
  await R.jobs().update({ id: m.jobId }, { materialsStatus: pending ? 'pending' : 'ready' });
  await addTimeline(ctx, m.jobId, 'materials', `${m.description}: marked ${status}${pending ? '' : ' — all materials ready'}`);
  await recomputeJob(ctx, m.jobId);
  return all.map((x) => (x.id === id ? { ...x, status } : x));
}

/** When the work is complete, reserved stock is consumed (on hand and reserved both drop). qtyReserved keeps the amount used. */
async function consumeMaterials(jobId: string) {
  const items = await R.materials().find({ where: { jobId, status: 'reserved' } });
  for (const it of items) {
    if (!it.variantId || it.qtyReserved <= 0) continue;
    let left = it.qtyReserved;
    const rows: Array<{ id: string; reserved: number }> = await AppDataSource.query(
      'SELECT id, quantity_reserved reserved FROM stock_items WHERE variant_id = ? AND quantity_reserved > 0 ORDER BY id',
      [it.variantId]
    );
    for (const r of rows) {
      if (left <= 0) break;
      const take = Math.min(Number(r.reserved), left);
      await AppDataSource.query('UPDATE stock_items SET quantity_reserved = quantity_reserved - ?, quantity_on_hand = quantity_on_hand - ? WHERE id = ?', [take, take, r.id]);
      left -= take;
    }
    await R.materials().update({ id: it.id }, { status: 'used', qtyReserved: it.qtyReserved - left });
  }
}

// ---- Fitting / delivery bookings & field work -------------------------------------

export interface BookingInput {
  type: 'fitting' | 'delivery';
  scheduledDate: string;
  slot?: string;
  staffUserId?: string | null;
  instructions?: string | null;
}

function validDate(v: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v) || Number.isNaN(new Date(`${v}T00:00:00Z`).getTime())) throw bad('Choose a valid date');
  return v;
}

export async function bookWork(ctx: Ctx, jobId: string, input: BookingInput) {
  requireCap(ctx, 'bookings');
  const job = await loadJob(ctx, jobId);
  if (!job.convertedAt) throw bad('Convert the quotation to a job first');
  if (job.closedAt) throw conflict('This job is closed');
  const date = validDate(input.scheduledDate);
  if (date < todayISO() && !ctx.caps.has('admin')) throw bad('The date cannot be in the past');
  if (input.staffUserId) {
    const u = await AppDataSource.query('SELECT id FROM users WHERE id = ? AND organization_id = ? AND deleted_at IS NULL', [input.staffUserId, ctx.orgId]);
    if (!u.length) throw bad('Selected staff member not found');
  }
  const current = await R.bookings().findOne({ where: { jobId: job.id, type: input.type, status: In(['booked', 'in_progress']) } });
  let b: RabsBooking;
  if (current) {
    await R.bookings().update(
      { id: current.id },
      { scheduledDate: date, slot: input.slot || current.slot, staffUserId: input.staffUserId ?? current.staffUserId, instructions: input.instructions ?? current.instructions }
    );
    b = await R.bookings().findOneOrFail({ where: { id: current.id } });
    await addTimeline(ctx, job.id, 'booking', `${cap(input.type)} rescheduled to ${date} (${b.slot})`);
  } else {
    b = await R.bookings().save(
      R.bookings().create({
        organizationId: ctx.orgId,
        jobId: job.id,
        type: input.type,
        scheduledDate: date,
        slot: input.slot || 'AM',
        staffUserId: input.staffUserId || null,
        status: 'booked',
        instructions: input.instructions || null,
        checklist: DEFAULT_CHECKLISTS[input.type].map((label) => ({ label, done: false })),
        createdBy: ctx.userId
      })
    );
    if (input.type === 'delivery' && !job.requiresDelivery) await R.jobs().update({ id: job.id }, { requiresDelivery: true });
    if (input.type === 'fitting' && !job.requiresFitting) await R.jobs().update({ id: job.id }, { requiresFitting: true });
    const who = input.staffUserId ? (await AppDataSource.query('SELECT first_name f, last_name l FROM users WHERE id = ?', [input.staffUserId]))[0] : null;
    await addTimeline(ctx, job.id, 'booking', `${cap(input.type)} booked for ${date} (${b.slot})${who ? ` with ${[who.f, who.l].filter(Boolean).join(' ')}` : ''}`);
  }
  await recomputeJob(ctx, job.id);
  return b;
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

async function loadBooking(ctx: Ctx, id: string) {
  const b = await R.bookings().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!b) throw notFound('Booking');
  await loadJob(ctx, b.jobId);
  if (!ctx.caps.has('bookings') && b.staffUserId !== ctx.userId) throw new HttpError(403, 'This booking is not assigned to you');
  requireCap(ctx, 'fieldwork', 'bookings');
  return b;
}

export async function cancelBooking(ctx: Ctx, id: string) {
  requireCap(ctx, 'bookings');
  const b = await loadBooking(ctx, id);
  if (b.status === 'complete') throw conflict('Completed work cannot be cancelled');
  await R.bookings().update({ id }, { status: 'cancelled' });
  await addTimeline(ctx, b.jobId, 'booking', `${cap(b.type)} on ${dateOnly(b.scheduledDate)} cancelled`);
  return recomputeJob(ctx, b.jobId);
}

export async function startBooking(ctx: Ctx, id: string) {
  const b = await loadBooking(ctx, id);
  if (b.status === 'complete' || b.status === 'cancelled') throw conflict(`This ${b.type} is ${b.status}`);
  if (b.status === 'booked') {
    await R.bookings().update({ id }, { status: 'in_progress', startedAt: new Date() });
    await addTimeline(ctx, b.jobId, 'fieldwork', `${cap(b.type)} started on site`);
  }
  await recomputeJob(ctx, b.jobId);
  return R.bookings().findOneOrFail({ where: { id } });
}

export async function updateChecklist(ctx: Ctx, id: string, checklist: Array<{ label: string; done: boolean }>, notes?: string | null) {
  const b = await loadBooking(ctx, id);
  if (b.status === 'complete') throw conflict('This work is already complete');
  await R.bookings().update({ id }, { checklist, ...(notes !== undefined ? { completionNotes: notes || null } : {}) });
  return R.bookings().findOneOrFail({ where: { id } });
}

export async function addBookingPhotos(ctx: Ctx, id: string, kind: 'before' | 'after', files: Express.Multer.File[]) {
  const b = await loadBooking(ctx, id);
  if (!files?.length) throw bad('Choose at least one photo');
  const saved: RabsFile[] = [];
  for (const f of files) {
    const { url, key } = await storeFile(ctx.orgId, `jobs/${b.jobId}/${b.type}`, f, { imagesOnly: true });
    saved.push(
      await R.files().save(
        R.files().create({ organizationId: ctx.orgId, jobId: b.jobId, bookingId: b.id, kind, url, storageKey: key, mimeType: f.mimetype, sizeBytes: f.size, uploadedBy: ctx.userId })
      )
    );
  }
  await addTimeline(ctx, b.jobId, 'photo', `${saved.length} ${kind} photo(s) added (${b.type})`);
  return saved;
}

export async function saveSignature(ctx: Ctx, id: string, dataUrl: string, signedName: string) {
  const b = await loadBooking(ctx, id);
  const m = /^data:image\/(png|jpeg);base64,([A-Za-z0-9+/=]+)$/.exec(dataUrl || '');
  if (!m) throw bad('Signature image is missing — ask the customer to sign in the box');
  const buffer = Buffer.from(m[2], 'base64');
  if (buffer.length < 200) throw bad('The signature looks empty — ask the customer to sign again');
  if (buffer.length > 2 * 1024 * 1024) throw bad('Signature image is too large');
  const { url, key } = await storeFile(ctx.orgId, `jobs/${b.jobId}/signatures`, { buffer, originalname: `signature.${m[1] === 'png' ? 'png' : 'jpg'}`, mimetype: `image/${m[1]}`, size: buffer.length }, { imagesOnly: true });
  const f = await R.files().save(
    R.files().create({ organizationId: ctx.orgId, jobId: b.jobId, bookingId: b.id, kind: 'signature', url, storageKey: key, mimeType: `image/${m[1]}`, sizeBytes: buffer.length, caption: `Signed by ${signedName}`, uploadedBy: ctx.userId })
  );
  await R.bookings().update({ id }, { signatureFileId: f.id, signedName: signedName.trim(), signedAt: new Date() });
  await addTimeline(ctx, b.jobId, 'signature', `Customer signed off (${signedName.trim()})`);
  return R.bookings().findOneOrFail({ where: { id } });
}

export async function completeBooking(ctx: Ctx, id: string, notes?: string | null) {
  const b = await loadBooking(ctx, id);
  if (b.status === 'complete') return recomputeJob(ctx, b.jobId);
  if (b.status === 'cancelled') throw conflict('This booking was cancelled');
  if (!b.signatureFileId) throw bad('The customer must sign before the job can be completed');
  const afterPhotos = await R.files().count({ where: { bookingId: b.id, kind: 'after' } });
  if (!afterPhotos) throw bad(`Take at least one "after" photo before completing the ${b.type}`);
  await R.bookings().update({ id }, { status: 'complete', completedAt: new Date(), ...(notes ? { completionNotes: notes } : {}) });
  const open = (b.checklist || []).filter((c) => !c.done).length;
  await addTimeline(ctx, b.jobId, 'fieldwork', `${cap(b.type)} completed${open ? ` (${open} checklist item(s) not ticked)` : ''}`);
  const job = await recomputeJob(ctx, b.jobId);
  if (job.completedAt) {
    await consumeMaterials(b.jobId);
    await addTimeline(ctx, b.jobId, 'complete', 'All work complete — ready to collect balance');
  }
  return job;
}

export async function myWork(ctx: Ctx, scope: 'today' | 'upcoming' | 'all' = 'upcoming') {
  requireCap(ctx, 'fieldwork');
  const today = todayISO();
  const where = scope === 'today' ? 'b.scheduled_date = ?' : scope === 'upcoming' ? "(b.scheduled_date >= ? OR b.status = 'in_progress')" : '1=1 OR ? IS NULL';
  return AppDataSource.query(
    `SELECT b.id, b.job_id jobId, b.type, DATE_FORMAT(b.scheduled_date, '%Y-%m-%d') scheduledDate, b.slot, b.status, b.instructions,
            j.job_number jobNumber, j.status jobStatus, c.name customerName, c.phone customerPhone,
            COALESCE(j.site_address, CONCAT_WS(', ', c.address_line1, c.address_line2, c.city, c.postcode)) address
       FROM rabs_bookings b
       JOIN rabs_jobs j ON j.id = b.job_id
       JOIN rabs_customers c ON c.id = j.rabs_customer_id
      WHERE b.organization_id = ? AND b.staff_user_id = ? AND b.status <> 'cancelled' AND (${where})
      ORDER BY b.scheduled_date ASC, b.slot ASC LIMIT 200`,
    [ctx.orgId, ctx.userId, today]
  );
}

// ---- Issue / snag, close, reopen ----------------------------------------------------

export async function raiseIssue(ctx: Ctx, jobId: string, note: string) {
  const job = await loadJob(ctx, jobId);
  if (job.closedAt) {
    // A snag after the job was closed (e.g. customer calls back) reopens the job so it can be put right.
    requireCap(ctx, 'customers', 'admin');
    await R.jobs().update({ id: job.id }, { closedAt: null, hasIssue: true, issueNote: note.trim() });
    await addTimeline(ctx, job.id, 'reopened', `Job reopened for a snag after closing: ${note.trim()}`);
    return recomputeJob(ctx, job.id);
  }
  await R.jobs().update({ id: job.id }, { hasIssue: true, issueNote: note.trim() });
  await addTimeline(ctx, job.id, 'issue', `Issue / snag raised: ${note.trim()}`);
  return recomputeJob(ctx, job.id);
}

export async function resolveIssue(ctx: Ctx, jobId: string, note?: string | null) {
  requireCap(ctx, 'customers', 'bookings');
  const job = await loadJob(ctx, jobId);
  if (!job.hasIssue) return recomputeJob(ctx, job.id);
  await R.jobs().update({ id: job.id }, { hasIssue: false });
  await addTimeline(ctx, job.id, 'issue', `Issue resolved${note ? `: ${note}` : ''}`);
  return recomputeJob(ctx, job.id);
}

export async function closeJob(ctx: Ctx, jobId: string, opts: { force?: boolean; reason?: string | null }) {
  requireCap(ctx, 'payments', 'admin');
  let job = await loadJob(ctx, jobId);
  if (job.closedAt) return job;
  job = await recomputeJob(ctx, job.id);
  const ready = job.status === 'FULLY_PAID';
  if (!ready) {
    if (!opts.force) throw conflict(job.balanceDue > 0.005 ? `There is still ${money(job.balanceDue)} to collect` : 'Finish the work before closing the job');
    requireCap(ctx, 'admin');
    if (!opts.reason?.trim()) throw bad('Give a reason for closing early');
  }
  await R.jobs().update({ id: job.id }, { closedAt: new Date() });
  await addTimeline(ctx, job.id, 'closed', ready ? 'Job closed — fully paid and complete' : `Job closed early by admin: ${opts.reason}`);
  return recomputeJob(ctx, job.id);
}

export async function reopenJob(ctx: Ctx, jobId: string) {
  requireCap(ctx, 'admin');
  const job = await loadJob(ctx, jobId);
  await R.jobs().update({ id: job.id }, { closedAt: null });
  await addTimeline(ctx, job.id, 'reopened', 'Job reopened by admin');
  return recomputeJob(ctx, job.id);
}

// ---- Delete a job (admin only: mistakes / test records) ---------------------------

/**
 * Permanently removes a job and everything attached to it. Reserved stock is released and stock used on the job is
 * put back. The customer is removed too when they have no other jobs and `deleteCustomer` is set.
 */
export async function deleteJob(ctx: Ctx, jobId: string, opts: { confirm: string; reason?: string | null; deleteCustomer?: boolean }) {
  requireCap(ctx, 'admin');
  const job = await loadJob(ctx, jobId);
  if ((opts.confirm || '').trim().toUpperCase() !== job.jobNumber.toUpperCase()) throw bad(`Type the job number ${job.jobNumber} to confirm`);
  const materials = await R.materials().find({ where: { jobId: job.id } });
  for (const m of materials) {
    if (!m.variantId || m.qtyReserved <= 0) continue;
    if (m.status !== 'used') await adjustReserved(m.variantId, -m.qtyReserved);
    else {
      const [row] = await AppDataSource.query(
        "SELECT id FROM stock_items WHERE variant_id = ? AND status IN ('available','reserved') ORDER BY id LIMIT 1",
        [m.variantId]
      );
      if (row) await AppDataSource.query('UPDATE stock_items SET quantity_on_hand = quantity_on_hand + ? WHERE id = ?', [m.qtyReserved, row.id]);
    }
  }
  const files = await R.files().find({ where: { jobId: job.id } });
  for (const f of files) await removeStoredFile(f.storageKey).catch(() => undefined);

  const customer = await AppDataSource.query('SELECT id, customer_id coreId, name FROM rabs_customers WHERE id = ?', [job.rabsCustomerId]);
  await AppDataSource.transaction(async (em) => {
    const q = (sql: string) => em.query(sql, [job.id]);
    await q('DELETE a FROM rabs_room_accessories a JOIN rabs_rooms r ON r.id = a.room_id WHERE r.job_id = ?');
    await q('DELETE l FROM rabs_quote_lines l JOIN rabs_quotes qt ON qt.id = l.quote_id WHERE qt.job_id = ?');
    for (const t of ['rabs_rooms', 'rabs_measurements', 'rabs_appointments', 'rabs_quotes', 'rabs_variations', 'rabs_invoices', 'rabs_payments', 'rabs_material_items', 'rabs_bookings', 'rabs_files', 'rabs_timeline']) {
      await q(`DELETE FROM ${t} WHERE job_id = ?`);
    }
    await q('DELETE FROM rabs_jobs WHERE id = ?');
    await em.query(
      "INSERT INTO rabs_price_audit (organization_id, entity, entity_id, entity_label, field, old_value, new_value, changed_by) VALUES (?, 'job', ?, ?, 'deleted', ?, ?, ?)",
      [ctx.orgId, job.id, `${job.jobNumber} — ${customer[0]?.name ?? ''}`.slice(0, 255), job.status, (opts.reason || 'Deleted by admin').slice(0, 255), ctx.userId]
    );
  });

  let customerDeleted = false;
  if (opts.deleteCustomer && customer[0]) {
    const [{ n }] = await AppDataSource.query('SELECT COUNT(*) n FROM rabs_jobs WHERE rabs_customer_id = ?', [customer[0].id]);
    if (Number(n) === 0) {
      await AppDataSource.query('DELETE FROM rabs_customers WHERE id = ?', [customer[0].id]);
      customerDeleted = true;
      if (customer[0].coreId) {
        const coreId = customer[0].coreId;
        const tag = `RABS-C${customer[0].id}`;
        try {
          await AppDataSource.query('DELETE FROM customer_addresses WHERE customer_id = ?', [coreId]);
          await AppDataSource.query('DELETE FROM customers WHERE id = ? AND customer_number = ?', [coreId, tag]);
        } catch {
          await AppDataSource.query('UPDATE customers SET deleted_at = NOW() WHERE id = ? AND customer_number = ?', [coreId, tag]).catch(() => undefined);
        }
      }
    }
  }
  return { deleted: job.jobNumber, customerDeleted };
}
