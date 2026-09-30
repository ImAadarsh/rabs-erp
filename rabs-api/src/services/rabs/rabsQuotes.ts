import { In, Not } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import {
  RabsJob, RabsMeasurement, RabsRoom, RabsRoomAccessory, RabsProduct, RabsLabourRule, RabsQuote, RabsQuoteLine
} from '@entities/rabs/RabsEntities.js';
import { Ctx, bad, conflict, notFound, loadJob, nextNumber, addTimeline, recomputeJob, requireCap, getSettings } from './rabsCore.js';
import { productQuantity, labourCharge, quoteTotals, depositRequired, round2, type RoomDims } from './rabsCalc.js';

const R = {
  jobs: () => AppDataSource.getRepository(RabsJob),
  meas: () => AppDataSource.getRepository(RabsMeasurement),
  rooms: () => AppDataSource.getRepository(RabsRoom),
  acc: () => AppDataSource.getRepository(RabsRoomAccessory),
  products: () => AppDataSource.getRepository(RabsProduct),
  labour: () => AppDataSource.getRepository(RabsLabourRule),
  quotes: () => AppDataSource.getRepository(RabsQuote),
  lines: () => AppDataSource.getRepository(RabsQuoteLine)
};

type LineDraft = Omit<RabsQuoteLine, 'id' | 'quoteId'>;

const UNIT_LABEL: Record<string, string> = { m2: 'm²', sqyd: 'sq yd', linear_m: 'm', item: 'each', pack: 'pack', roll: 'roll', stair: 'stair' };
export const unitLabel = (u: string) => UNIT_LABEL[u] ?? u;

function pickLabourRules(rules: RabsLabourRule[], product: RabsProduct, room: RabsRoom): RabsLabourRule[] {
  const forCat = rules.filter((r) => r.category === product.category);
  const pool = forCat.length ? forCat : rules.filter((r) => r.category === 'ANY' && product.kind === 'flooring');
  const name = room.name.toLowerCase();
  // General rules always apply; room-specific rules (e.g. "Stairs") are added on top.
  const chosen = pool.filter((r) => !r.roomType || name.includes(r.roomType.toLowerCase()));
  return chosen.filter((r) => r.basis !== 'per_stair' || room.stairs > 0);
}

/** Build every quote line automatically from the measured rooms — no retyping. */
export async function buildLinesFromMeasurement(ctx: Ctx, measurementId: string): Promise<LineDraft[]> {
  const rooms = await R.rooms().find({ where: { measurementId }, order: { sortOrder: 'ASC', id: 'ASC' } });
  if (!rooms.length) throw bad('Add at least one room before creating the quotation');
  const productIds = new Set<string>();
  rooms.forEach((r) => r.productId && productIds.add(r.productId));
  const accs = await R.acc().find({ where: { roomId: In(rooms.map((r) => r.id)) } });
  accs.forEach((a) => productIds.add(a.productId));
  const products = productIds.size ? await R.products().find({ where: { id: In([...productIds]) } }) : [];
  const pmap = new Map(products.map((p) => [p.id, p]));
  const rules = await R.labour().find({ where: { organizationId: ctx.orgId, isActive: true } });

  const lines: LineDraft[] = [];
  let order = 0;
  const missing = rooms.filter((r) => !r.productId).map((r) => r.name);
  if (missing.length) throw bad(`Choose a product for: ${missing.join(', ')}`);

  for (const room of rooms) {
    const p = pmap.get(room.productId!)!;
    const dims: RoomDims = { lengthM: room.lengthM, widthM: room.widthM, areaM2: room.areaM2, areaSqyd: room.areaSqyd, perimeterM: room.perimeterM };
    const qty = round2(room.productQty ?? productQuantity(p, dims));
    const meta = { lengthM: room.lengthM, widthM: room.widthM, areaM2: room.areaM2, areaSqyd: room.areaSqyd, perimeterM: room.perimeterM, category: p.category };
    lines.push({
      roomId: room.id,
      roomName: room.name,
      lineType: 'product',
      productId: p.id,
      description: `${p.name}${p.colour ? ` — ${p.colour}` : ''}`,
      qty,
      unit: p.unit,
      unitCost: p.costPrice,
      unitPrice: p.sellPrice,
      lineCost: round2(qty * p.costPrice),
      lineTotal: round2(qty * p.sellPrice),
      meta,
      sortOrder: order++
    });
    for (const a of accs.filter((x) => x.roomId === room.id)) {
      const ap = pmap.get(a.productId);
      if (!ap) continue;
      lines.push({
        roomId: room.id,
        roomName: room.name,
        lineType: 'accessory',
        productId: ap.id,
        description: ap.name,
        qty: a.qty,
        unit: ap.unit,
        unitCost: ap.costPrice,
        unitPrice: ap.sellPrice,
        lineCost: round2(a.qty * ap.costPrice),
        lineTotal: round2(a.qty * ap.sellPrice),
        meta: null,
        sortOrder: order++
      });
    }
    for (const rule of pickLabourRules(rules, p, room)) {
      const l = labourCharge(rule, dims, room.stairs, p.calcMethod === 'per_item' ? qty : 1);
      if (l.total <= 0) continue;
      lines.push({
        roomId: room.id,
        roomName: room.name,
        lineType: 'labour',
        productId: null,
        description: rule.name,
        qty: l.qty,
        unit: l.unit,
        unitCost: l.unitCost,
        unitPrice: l.unitPrice,
        lineCost: l.cost,
        lineTotal: l.total,
        meta: { labourRuleId: rule.id, basis: rule.basis },
        sortOrder: order++
      });
    }
  }
  return lines;
}

async function applyTotals(ctx: Ctx, quote: RabsQuote) {
  const lines = await R.lines().find({ where: { quoteId: quote.id } });
  const s = ctx.settings;
  let t;
  try {
    t = quoteTotals({ lines, discountType: quote.discountType, discountValue: quote.discountValue, deliveryCharge: quote.deliveryCharge, vatRate: quote.vatRate });
  } catch (e: any) {
    throw bad(e.message);
  }
  const deposit = depositRequired(t.total, s);
  await R.quotes().update(
    { id: quote.id },
    {
      subtotal: t.subtotal,
      discountAmount: t.discountAmount,
      deliveryCharge: t.deliveryCharge,
      netTotal: t.netTotal,
      vatAmount: t.vatAmount,
      total: t.total,
      depositRequired: deposit,
      costTotal: t.costTotal,
      marginAmount: t.marginAmount,
      marginPercent: t.marginPercent
    }
  );
}

async function writeLines(quoteId: string, lines: LineDraft[]) {
  await R.lines().delete({ quoteId });
  if (lines.length) await R.lines().insert(lines.map((l) => ({ ...l, quoteId })));
}

/** Extra lines typed on the quote (not from the measurement) survive a rebuild, as long as their room still exists. */
async function customLinesToKeep(fromQuoteId: string | null, rooms: Set<string>, startOrder: number): Promise<LineDraft[]> {
  if (!fromQuoteId) return [];
  const custom = await R.lines().find({ where: { quoteId: fromQuoteId, lineType: 'custom' }, order: { sortOrder: 'ASC', id: 'ASC' } });
  return custom
    .filter((l) => !l.roomId || rooms.has(l.roomId))
    .map(({ id: _i, quoteId: _q, ...l }, i) => ({ ...l, sortOrder: startOrder + i }));
}

/** CREATE QUOTATION: builds (or rebuilds the current draft) from the measurement. Sent quotes get a new version. */
export async function createQuoteFromMeasurement(ctx: Ctx, jobId: string) {
  requireCap(ctx, 'quotes');
  const job = await loadJob(ctx, jobId);
  if (job.closedAt) throw conflict('This job is closed');
  if (job.acceptedQuoteId) throw conflict('A quotation has already been accepted for this job');
  const m = await R.meas().findOne({ where: { jobId: job.id }, order: { id: 'DESC' } });
  if (!m) throw bad('Measure the rooms first (START MEASUREMENT)');
  const lines = await buildLinesFromMeasurement(ctx, m.id);
  const settings = await getSettings(ctx.orgId);
  const [latest] = await R.quotes().find({ where: { jobId: job.id }, order: { id: 'DESC' }, take: 1 });

  let quote: RabsQuote;
  if (latest && latest.status === 'draft') {
    quote = latest;
    await addTimeline(ctx, job.id, 'quote', `Quotation ${quote.quoteNumber} v${quote.version} rebuilt from latest measurements`);
  } else {
    const quoteNumber = latest ? latest.quoteNumber : await nextNumber(ctx.orgId, 'quote');
    const version = latest ? latest.version + 1 : 1;
    if (latest && latest.status === 'sent') await R.quotes().update({ id: latest.id }, { status: 'superseded' });
    const valid = new Date(Date.now() + settings.quoteValidityDays * 86400000);
    quote = await R.quotes().save(
      R.quotes().create({
        organizationId: ctx.orgId,
        jobId: job.id,
        measurementId: m.id,
        quoteNumber,
        version,
        status: 'draft',
        discountType: latest?.discountType ?? 'none',
        discountValue: latest?.discountValue ?? 0,
        deliveryCharge: latest?.deliveryCharge ?? (job.requiresDelivery ? settings.defaultDeliveryCharge : 0),
        vatRate: settings.vatRate,
        notes: latest?.notes ?? null,
        validUntil: valid.toISOString().slice(0, 10),
        createdBy: ctx.userId,
        subtotal: 0, discountAmount: 0, netTotal: 0, vatAmount: 0, total: 0, depositRequired: 0, costTotal: 0, marginAmount: 0, marginPercent: 0
      })
    );
    await addTimeline(ctx, job.id, 'quote', `Quotation ${quoteNumber} v${version} created automatically from ${new Set(lines.map((l) => l.roomId)).size} room(s)`);
  }
  const roomIds = new Set(lines.map((l) => l.roomId).filter(Boolean) as string[]);
  const kept = await customLinesToKeep(latest?.id ?? null, roomIds, lines.length);
  await writeLines(quote.id, [...lines, ...kept]);
  await R.meas().update({ id: m.id }, { status: 'complete' });
  await applyTotals(ctx, quote);
  await recomputeJob(ctx, job.id);
  return R.quotes().findOneOrFail({ where: { id: quote.id } });
}

/**
 * Rooms changed after the quote was drafted: refresh the draft so the quote always matches the measurement.
 * Sent quotes are left alone (the next CREATE QUOTATION makes a new version). Returns true if a draft was refreshed.
 */
export async function refreshDraftFromMeasurement(ctx: Ctx, jobId: string): Promise<boolean> {
  const [latest] = await R.quotes().find({ where: { jobId }, order: { id: 'DESC' }, take: 1 });
  if (!latest || latest.status !== 'draft' || !ctx.caps.has('quotes')) return false;
  const m = await R.meas().findOne({ where: { jobId }, order: { id: 'DESC' } });
  if (!m) return false;
  const roomCount = await R.rooms().count({ where: { measurementId: m.id } });
  if (!roomCount) {
    const custom = await customLinesToKeep(latest.id, new Set(), 0);
    await writeLines(latest.id, custom);
    await applyTotals(ctx, latest);
    return true;
  }
  let lines: LineDraft[];
  try {
    lines = await buildLinesFromMeasurement(ctx, m.id);
  } catch {
    return false;
  }
  const roomIds = new Set(lines.map((l) => l.roomId).filter(Boolean) as string[]);
  await writeLines(latest.id, [...lines, ...(await customLinesToKeep(latest.id, roomIds, lines.length))]);
  await applyTotals(ctx, latest);
  await addTimeline(ctx, jobId, 'quote', `Quotation ${latest.quoteNumber} v${latest.version} updated automatically after a room change`);
  return true;
}

async function loadQuote(ctx: Ctx, id: string) {
  const q = await R.quotes().findOne({ where: { id, organizationId: ctx.orgId } });
  if (!q) throw notFound('Quotation');
  await loadJob(ctx, q.jobId);
  return q;
}

function assertDraft(q: RabsQuote) {
  if (q.status !== 'draft') throw conflict(`This quotation is ${q.status}. Use REVISE to make a new version.`);
}

export async function getQuote(ctx: Ctx, id: string) {
  const q = await loadQuote(ctx, id);
  const lines = await R.lines().find({ where: { quoteId: q.id }, order: { sortOrder: 'ASC', id: 'ASC' } });
  return { quote: q, lines };
}

export interface QuotePatch {
  discountType?: 'none' | 'percent' | 'fixed';
  discountValue?: number;
  deliveryCharge?: number;
  notes?: string | null;
  validUntil?: string | null;
}

export async function updateQuote(ctx: Ctx, id: string, patch: QuotePatch) {
  requireCap(ctx, 'quotes');
  const q = await loadQuote(ctx, id);
  assertDraft(q);
  const upd: Partial<RabsQuote> = {};
  if (patch.discountType !== undefined) upd.discountType = patch.discountType;
  if (patch.discountValue !== undefined) upd.discountValue = round2(patch.discountValue);
  if ((upd.discountType ?? q.discountType) === 'none') upd.discountValue = 0;
  if (patch.deliveryCharge !== undefined) upd.deliveryCharge = round2(patch.deliveryCharge);
  if (patch.notes !== undefined) upd.notes = patch.notes || null;
  if (patch.validUntil !== undefined) upd.validUntil = patch.validUntil || null;
  await R.quotes().update({ id: q.id }, upd);
  await applyTotals(ctx, { ...q, ...upd } as RabsQuote);
  return getQuote(ctx, q.id);
}

export async function addQuoteLine(ctx: Ctx, id: string, input: { description: string; qty: number; unitPrice: number; unitCost?: number; unit?: string; roomId?: string | null }) {
  requireCap(ctx, 'quotes');
  const q = await loadQuote(ctx, id);
  assertDraft(q);
  let roomName: string | null = null;
  if (input.roomId) {
    const room = await R.rooms().findOne({ where: { id: input.roomId, jobId: q.jobId } });
    if (!room) throw bad('Room not found on this job');
    roomName = room.name;
  }
  const max = Number((await AppDataSource.query('SELECT COALESCE(MAX(sort_order),0)+1 n FROM rabs_quote_lines WHERE quote_id = ?', [q.id]))[0].n);
  await R.lines().insert({
    quoteId: q.id,
    roomId: input.roomId || null,
    roomName,
    lineType: 'custom',
    productId: null,
    description: input.description.trim(),
    qty: round2(input.qty),
    unit: input.unit || 'item',
    unitCost: round2(input.unitCost ?? 0),
    unitPrice: round2(input.unitPrice),
    lineCost: round2(input.qty * (input.unitCost ?? 0)),
    lineTotal: round2(input.qty * input.unitPrice),
    meta: null as any,
    sortOrder: max
  });
  await applyTotals(ctx, q);
  return getQuote(ctx, q.id);
}

export async function updateQuoteLine(ctx: Ctx, id: string, lineId: string, input: { qty?: number; unitPrice?: number; description?: string }) {
  requireCap(ctx, 'quotes');
  const q = await loadQuote(ctx, id);
  assertDraft(q);
  const line = await R.lines().findOne({ where: { id: lineId, quoteId: q.id } });
  if (!line) throw notFound('Quote line');
  const qty = input.qty !== undefined ? round2(input.qty) : line.qty;
  const unitPrice = input.unitPrice !== undefined ? round2(input.unitPrice) : line.unitPrice;
  if (input.unitPrice !== undefined && input.unitPrice !== line.unitPrice) requireCap(ctx, 'view_prices');
  await R.lines().update(
    { id: line.id },
    { qty, unitPrice, description: input.description?.trim() || line.description, lineTotal: round2(qty * unitPrice), lineCost: round2(qty * line.unitCost) }
  );
  await applyTotals(ctx, q);
  return getQuote(ctx, q.id);
}

export async function deleteQuoteLine(ctx: Ctx, id: string, lineId: string) {
  requireCap(ctx, 'quotes');
  const q = await loadQuote(ctx, id);
  assertDraft(q);
  const r = await R.lines().delete({ id: lineId, quoteId: q.id });
  if (!r.affected) throw notFound('Quote line');
  await applyTotals(ctx, q);
  return getQuote(ctx, q.id);
}

export async function sendQuote(ctx: Ctx, id: string) {
  requireCap(ctx, 'quotes');
  const q = await loadQuote(ctx, id);
  if (q.status === 'sent') return q;
  assertDraft(q);
  const lines = await R.lines().count({ where: { quoteId: q.id } });
  if (!lines) throw bad('The quotation has no lines');
  await R.quotes().update({ id: q.id }, { status: 'sent', sentAt: new Date() });
  await addTimeline(ctx, q.jobId, 'quote', `Quotation ${q.quoteNumber} v${q.version} sent to customer (£${q.total.toFixed(2)})`);
  await recomputeJob(ctx, q.jobId);
  return R.quotes().findOneOrFail({ where: { id: q.id } });
}

/** REVISE: copy an existing (sent/declined) quote into a new draft version. */
export async function reviseQuote(ctx: Ctx, id: string) {
  requireCap(ctx, 'quotes');
  const q = await loadQuote(ctx, id);
  if (q.status === 'accepted') throw conflict('Accepted quotations keep their original values. Add a variation on the job instead.');
  if (q.status === 'draft') return q;
  const job = await R.jobs().findOneOrFail({ where: { id: q.jobId } });
  if (job.acceptedQuoteId) throw conflict('A quotation has already been accepted for this job');
  const [latest] = await R.quotes().find({ where: { jobId: q.jobId, quoteNumber: q.quoteNumber }, order: { version: 'DESC' }, take: 1 });
  await R.quotes().update({ jobId: q.jobId, status: In(['sent', 'draft']) }, { status: 'superseded' });
  const { id: _id, createdAt: _c, updatedAt: _u, ...rest } = q;
  const nq = await R.quotes().save(R.quotes().create({ ...rest, version: latest.version + 1, status: 'draft', sentAt: null, acceptedAt: null, acceptedByName: null, createdBy: ctx.userId }));
  const lines = await R.lines().find({ where: { quoteId: q.id } });
  await writeLines(nq.id, lines.map(({ id: _i, quoteId: _q, ...l }) => l));
  await applyTotals(ctx, nq);
  await addTimeline(ctx, q.jobId, 'quote', `Quotation ${q.quoteNumber} revised → v${nq.version}`);
  await recomputeJob(ctx, q.jobId);
  return R.quotes().findOneOrFail({ where: { id: nq.id } });
}

export async function declineQuote(ctx: Ctx, id: string) {
  requireCap(ctx, 'quotes');
  const q = await loadQuote(ctx, id);
  if (q.status === 'accepted') throw conflict('This quotation is already accepted');
  await R.quotes().update({ id: q.id }, { status: 'declined' });
  await addTimeline(ctx, q.jobId, 'quote', `Quotation ${q.quoteNumber} v${q.version} declined by customer`);
  await recomputeJob(ctx, q.jobId);
}

/** ACCEPT (optionally + convert to job in the same click). Snapshot values are frozen on the accepted version. */
export async function acceptQuote(ctx: Ctx, id: string, opts: { acceptedByName?: string | null; convert?: boolean }) {
  requireCap(ctx, 'accept');
  const q = await loadQuote(ctx, id);
  const job = await R.jobs().findOneOrFail({ where: { id: q.jobId } });
  if (job.acceptedQuoteId && job.acceptedQuoteId !== q.id) throw conflict('Another quotation is already accepted for this job');
  if (q.status !== 'accepted') {
    if (!['draft', 'sent'].includes(q.status)) throw conflict(`A ${q.status} quotation cannot be accepted`);
    if (q.total <= 0) throw bad('The quotation total must be more than £0');
    const customer = (await AppDataSource.query('SELECT name FROM rabs_customers WHERE id = ?', [job.rabsCustomerId]))[0];
    await R.quotes().update({ id: q.id }, { status: 'accepted', acceptedAt: new Date(), acceptedByName: opts.acceptedByName?.trim() || customer?.name || null, sentAt: q.sentAt ?? new Date() });
    await R.quotes().update({ jobId: q.jobId, id: Not(q.id), status: In(['draft', 'sent']) }, { status: 'superseded' });
    await R.jobs().update({ id: job.id }, { acceptedQuoteId: q.id, depositRequired: q.depositRequired, totalAmount: q.total });
    await addTimeline(ctx, job.id, 'accepted', `Quotation ${q.quoteNumber} v${q.version} accepted — £${q.total.toFixed(2)} inc VAT`);
  }
  if (opts.convert) return convertToJob(ctx, job.id);
  return recomputeJob(ctx, job.id);
}

/** Convert this quotation into a job? → YES. Everything is carried forward by reference. */
export async function convertToJob(ctx: Ctx, jobId: string) {
  requireCap(ctx, 'accept');
  const job = await loadJob(ctx, jobId);
  if (!job.acceptedQuoteId) throw bad('Accept the quotation first');
  if (job.convertedAt) return recomputeJob(ctx, job.id);
  const lines = await R.lines().find({ where: { quoteId: job.acceptedQuoteId } });
  const productIds = [...new Set(lines.filter((l) => l.productId).map((l) => l.productId!))];
  const products = productIds.length ? await R.products().find({ where: { id: In(productIds) } }) : [];
  // Furniture assembly is done by the delivery crew, so only flooring needs a fitting visit.
  const hasFlooring = products.some((p) => p.kind === 'flooring');
  const hasFurniture = products.some((p) => p.kind === 'furniture');
  const q = await R.quotes().findOneOrFail({ where: { id: job.acceptedQuoteId } });
  await R.jobs().update(
    { id: job.id },
    {
      convertedAt: new Date(),
      requiresFitting: hasFlooring || (!hasFurniture && job.requiresFitting),
      requiresDelivery: hasFurniture || q.deliveryCharge > 0 || job.requiresDelivery
    }
  );
  const rooms = new Set(lines.map((l) => l.roomName).filter(Boolean)).size;
  await addTimeline(
    ctx,
    job.id,
    'converted',
    `Converted to job ${job.jobNumber}: ${rooms} room(s), ${lines.length} line(s), deposit £${job.depositRequired.toFixed(2)} required`
  );
  return recomputeJob(ctx, job.id);
}
