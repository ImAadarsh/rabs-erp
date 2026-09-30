import { Router, Request, Response, NextFunction } from 'express';
import { z, ZodError, ZodTypeAny } from 'zod';
import multer from 'multer';
import { authMiddleware } from '@middlewares/auth.js';
import { buildCtx, HttpError, parseId, requireCap, type Ctx } from '@services/rabs/rabsCore.js';
import * as J from '@services/rabs/rabsJobs.js';
import * as Q from '@services/rabs/rabsQuotes.js';
import * as O from '@services/rabs/rabsOps.js';
import * as V from '@services/rabs/rabsViews.js';
import * as A from '@services/rabs/rabsAdmin.js';

export const rabsRouter = Router();
rabsRouter.use(authMiddleware);

const photoUpload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024, files: 12 } });
const photos = (req: Request, res: Response, next: NextFunction) =>
  photoUpload.array('files', 12)(req, res, (err: any) => {
    if (!err) return next();
    const message = err.code === 'LIMIT_FILE_SIZE' ? 'Each photo must be under 15 MB' : err.code === 'LIMIT_FILE_COUNT' ? 'Upload up to 12 photos at a time' : err.message || 'Upload failed';
    res.status(400).json({ error: { message, status: 400 } });
  });

type Handler = (ctx: Ctx, req: Request) => Promise<unknown>;
const COST_FIELDS = new Set(['costTotal', 'marginAmount', 'marginPercent', 'unitCost', 'lineCost', 'costPrice']);
function stripCosts(v: any): any {
  if (Array.isArray(v)) return v.map(stripCosts);
  if (!v || typeof v !== 'object' || v instanceof Date) return v;
  const o: Record<string, any> = {};
  for (const [k, val] of Object.entries(v)) if (!COST_FIELDS.has(k)) o[k] = stripCosts(val);
  return o;
}

const h = (fn: Handler, status = 200) => async (req: Request, res: Response) => {
  try {
    const ctx = await buildCtx(req);
    let out = await fn(ctx, req);
    if (!ctx.caps.has('view_costs') && out && typeof out === 'object') out = stripCosts(JSON.parse(JSON.stringify(out)));
    res.status(status).json(out === undefined ? { ok: true } : out);
  } catch (err: any) {
    if (err instanceof ZodError) {
      const first = err.issues[0];
      const field = first?.path?.join('.') || 'input';
      res.status(400).json({ error: { message: friendlyZod(field, first?.message), status: 400, fields: err.flatten().fieldErrors } });
      return;
    }
    if (err instanceof HttpError) {
      res.status(err.status).json({ error: { message: err.message, status: err.status, details: err.details } });
      return;
    }
    const status = err?.status && Number.isInteger(err.status) ? err.status : 500;
    if (status >= 500) console.error('[rabs]', req.method, req.originalUrl, err);
    res.status(status).json({ error: { message: status >= 500 ? 'Something went wrong. Please try again.' : err.message, status } });
  }
};

const LABELS: Record<string, string> = {
  name: 'Name', phone: 'Phone', email: 'Email', scheduledAt: 'Date & time', amount: 'Amount', lengthM: 'Length', widthM: 'Width',
  lengthFt: 'Length (ft)', lengthIn: 'Length (in)', widthFt: 'Width (ft)', widthIn: 'Width (in)', scheduledDate: 'Date', description: 'Description',
  qty: 'Quantity', unitPrice: 'Price', signedName: 'Customer name', postcode: 'Postcode'
};
function friendlyZod(field: string, msg?: string) {
  const key = field.split('.').pop() || field;
  let text = msg ?? 'is not valid';
  if (/received nan|expected number/i.test(text)) text = 'must be a number';
  else if (/^required$/i.test(text)) text = 'is required';
  else if (/^expected (string|boolean)/i.test(text)) text = 'is not valid';
  return `${LABELS[key] ?? key}: ${text}`;
}

const parse = <T extends ZodTypeAny>(schema: T, data: unknown): z.infer<T> => schema.parse(data ?? {});
const id = (req: Request, key = 'id') => parseId(req.params[key]);

// ---- Schemas -----------------------------------------------------------------------

const optStr = (max = 255) => z.string().trim().max(max).optional().nullable();
const ukPhone = z.string().trim().max(40).regex(/^[+\d][\d\s()-]{6,}$/, 'enter a valid phone number').optional().nullable().or(z.literal(''));
const email = z.string().trim().email('enter a valid email').max(190).optional().nullable().or(z.literal(''));
const postcode = z.string().trim().max(10).regex(/^[A-Za-z]{1,2}\d[A-Za-z\d]?\s*\d[A-Za-z]{2}$/, 'enter a valid UK postcode').optional().nullable().or(z.literal(''));
const idStr = z.union([z.string().regex(/^\d+$/), z.number().int().positive()]).transform(String);
const money = (max = 1_000_000) => z.coerce.number().min(0, 'cannot be negative').max(max, `must be ${max.toLocaleString()} or less`);

const customerSchema = z.object({
  name: z.string().trim().min(2, 'is required').max(160),
  phone: ukPhone,
  email,
  addressLine1: optStr(190),
  addressLine2: optStr(190),
  city: optStr(100),
  postcode,
  source: optStr(60),
  notes: optStr(2000)
}).refine((c) => !!(c.phone || c.email), { message: 'enter a phone number or email', path: ['phone'] });

const appointmentSchema = z.object({
  scheduledAt: z.string().min(8, 'is required'),
  durationMin: z.coerce.number().int().min(15).max(480).optional(),
  purpose: optStr(40).transform((v) => v || undefined),
  staffUserId: idStr.optional().nullable(),
  notes: optStr(2000)
});

const enquirySchema = z.object({
  customerId: idStr.optional(),
  customer: customerSchema.optional(),
  title: optStr(190),
  requiresFitting: z.boolean().optional(),
  requiresDelivery: z.boolean().optional(),
  notes: optStr(2000),
  appointment: appointmentSchema.optional().nullable(),
  allowDuplicate: z.boolean().optional()
}).refine((d) => d.customerId || d.customer, { message: 'choose an existing customer or enter a new one', path: ['customer'] });

const dimNum = z.coerce.number().min(0, 'cannot be negative').max(100, 'must be 100 or less');
const roomSchema = z.object({
  name: z.string().trim().min(1, 'is required').max(80),
  unitInput: z.enum(['m', 'ftin']).default('m'),
  lengthM: dimNum.optional().nullable(),
  widthM: dimNum.optional().nullable(),
  lengthFt: z.coerce.number().int().min(0).max(330).optional().nullable(),
  lengthIn: z.coerce.number().min(0).max(11.99, 'must be less than 12').optional().nullable(),
  widthFt: z.coerce.number().int().min(0).max(330).optional().nullable(),
  widthIn: z.coerce.number().min(0).max(11.99, 'must be less than 12').optional().nullable(),
  doors: z.coerce.number().int().min(0).max(20).optional(),
  stairs: z.coerce.number().int().min(0).max(60).optional(),
  productId: idStr.optional().nullable(),
  productQty: z.coerce.number().min(0.01).max(10000).optional().nullable(),
  notes: optStr(2000),
  accessories: z.array(z.object({ productId: idStr, qty: z.coerce.number().min(0.01).max(10000) })).max(30).optional()
});

const paymentSchema = z.object({
  amount: z.coerce.number().positive('must be more than £0').max(1_000_000),
  method: z.enum(['cash', 'card', 'bank_transfer', 'finance', 'cheque', 'other']).default('card'),
  kind: z.enum(['deposit', 'part', 'balance', 'refund']).optional(),
  paidAt: optStr(40),
  reference: optStr(120),
  notes: optStr(255)
});

const bookingSchema = z.object({
  type: z.enum(['fitting', 'delivery']),
  scheduledDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'choose a date'),
  slot: z.enum(['AM', 'PM', 'All day', 'Evening']).optional(),
  staffUserId: idStr.optional().nullable(),
  instructions: optStr(2000)
});

const productSchema = z.object({
  code: z.string().trim().min(1).max(60),
  name: z.string().trim().min(2).max(255),
  category: z.string().trim().min(1).max(60),
  kind: z.enum(['flooring', 'accessory', 'furniture', 'service']),
  unit: z.enum(['m2', 'sqyd', 'linear_m', 'item', 'pack', 'roll']),
  calcMethod: z.enum(['per_m2', 'per_sqyd', 'per_linear_m', 'per_item', 'per_pack']),
  rollWidthM: z.coerce.number().min(0.5).max(10).optional().nullable(),
  packCoverageM2: z.coerce.number().min(0.01).max(1000).optional().nullable(),
  wastagePercent: z.coerce.number().min(0).max(50).optional(),
  costPrice: money(100000),
  sellPrice: money(100000),
  accessoryBasis: z.enum(['area', 'perimeter', 'door', 'each']).optional().nullable(),
  accessoryFactor: z.coerce.number().min(0).max(100).optional().nullable(),
  appliesTo: z.array(z.string().max(60)).max(20).optional().nullable(),
  defaultSelected: z.boolean().optional(),
  variantId: idStr.optional().nullable(),
  colour: optStr(120),
  supplier: optStr(120),
  isActive: z.boolean().optional(),
  sortOrder: z.coerce.number().int().min(0).max(9999).optional()
});

const labourSchema = z.object({
  name: z.string().trim().min(2).max(120),
  category: z.string().trim().min(1).max(60).default('ANY'),
  roomType: optStr(60),
  basis: z.enum(['per_m2', 'per_sqyd', 'per_room', 'per_stair', 'per_item', 'fixed']),
  costRate: money(100000),
  sellRate: money(100000),
  minCharge: money(100000).optional(),
  isActive: z.boolean().optional()
});

const hex = z.string().regex(/^#[0-9A-Fa-f]{6}$/, 'must be a colour like #2563EB');

// ---- Meta, search, dashboard --------------------------------------------------------

rabsRouter.get('/meta', h((ctx) => V.meta(ctx)));
rabsRouter.get('/dashboard', h((ctx) => V.dashboard(ctx)));
rabsRouter.get('/search', h((ctx, req) => V.search(ctx, String(req.query.q || ''))));

// ---- Customers & enquiries ------------------------------------------------------------

rabsRouter.get('/customers', h((ctx, req) => J.listCustomers(ctx, req.query.q as string)));
rabsRouter.get('/customers/duplicates', h((ctx, req) => J.findDuplicateCustomers(ctx, req.query.phone as string, req.query.email as string)));
rabsRouter.get('/customers/:id', h((ctx, req) => J.getCustomer(ctx, id(req))));
rabsRouter.post('/customers', h(async (ctx, req) => J.createCustomer(ctx, parse(customerSchema, req.body)), 201));
rabsRouter.patch('/customers/:id', h((ctx, req) => J.updateCustomer(ctx, id(req), parse(customerSchema.innerType().partial(), req.body))));

/** One screen: new/existing customer → job number → optional appointment. */
rabsRouter.post(
  '/enquiries',
  h(async (ctx, req) => {
    const b = parse(enquirySchema, req.body);
    let customerId = b.customerId;
    if (!customerId && b.customer) {
      if (!b.allowDuplicate) {
        const dups = await J.findDuplicateCustomers(ctx, b.customer.phone, b.customer.email || null);
        if (dups.length) throw new HttpError(409, `${dups[0].name} already has this phone/email. Open the existing customer or tick "create anyway".`, { duplicates: dups });
      }
      customerId = (await J.createCustomer(ctx, b.customer)).id;
    }
    const job = await J.createJob(ctx, { customerId: customerId!, title: b.title, requiresFitting: b.requiresFitting, requiresDelivery: b.requiresDelivery, notes: b.notes });
    if (b.appointment) await J.createAppointment(ctx, job.id, b.appointment);
    return V.jobAggregate(ctx, job.id);
  }, 201)
);

// ---- Jobs ------------------------------------------------------------------------------

rabsRouter.get('/jobs', h((ctx, req) => V.listJobs(ctx, req.query as any)));
rabsRouter.get('/jobs/:id', h((ctx, req) => V.jobAggregate(ctx, id(req))));
rabsRouter.patch(
  '/jobs/:id',
  h(async (ctx, req) => {
    const b = parse(z.object({ title: optStr(190), siteAddress: optStr(255), notes: optStr(4000), requiresFitting: z.boolean().optional(), requiresDelivery: z.boolean().optional(), surveyorUserId: idStr.optional().nullable() }), req.body);
    await J.updateJob(ctx, id(req), b);
    return V.jobAggregate(ctx, id(req));
  })
);
rabsRouter.post('/jobs/:id/appointments', h(async (ctx, req) => (await J.createAppointment(ctx, id(req), parse(appointmentSchema, req.body)), V.jobAggregate(ctx, id(req))), 201));
rabsRouter.post('/jobs/:id/measurement', h(async (ctx, req) => J.startMeasurement(ctx, id(req), parse(z.object({ appointmentId: idStr.optional().nullable() }), req.body).appointmentId)));
rabsRouter.post('/jobs/:id/quotes', h(async (ctx, req) => Q.createQuoteFromMeasurement(ctx, id(req)), 201));
rabsRouter.post('/jobs/:id/convert', h(async (ctx, req) => (await Q.convertToJob(ctx, id(req)), V.jobAggregate(ctx, id(req)))));
rabsRouter.post('/jobs/:id/payments', h(async (ctx, req) => (await O.recordPayment(ctx, id(req), parse(paymentSchema, req.body)), V.jobAggregate(ctx, id(req))), 201));
rabsRouter.post('/jobs/:id/materials/check', h(async (ctx, req) => (await O.checkMaterials(ctx, id(req)), V.jobAggregate(ctx, id(req)))));
rabsRouter.post('/jobs/:id/bookings', h(async (ctx, req) => (await O.bookWork(ctx, id(req), parse(bookingSchema, req.body)), V.jobAggregate(ctx, id(req))), 201));
rabsRouter.post('/jobs/:id/invoice', h(async (ctx, req) => (await O.generateInvoice(ctx, id(req)), V.jobAggregate(ctx, id(req)))));
rabsRouter.post(
  '/jobs/:id/variations',
  h(async (ctx, req) => {
    const b = parse(z.object({ description: z.string().trim().min(2, 'is required').max(255), netAmount: z.coerce.number().min(-100000).max(100000), approve: z.boolean().optional() }), req.body);
    await O.addVariation(ctx, id(req), b);
    return V.jobAggregate(ctx, id(req));
  }, 201)
);
rabsRouter.post('/jobs/:id/issue', h(async (ctx, req) => (await O.raiseIssue(ctx, id(req), parse(z.object({ note: z.string().trim().min(3, 'describe the issue').max(1000) }), req.body).note), V.jobAggregate(ctx, id(req)))));
rabsRouter.post('/jobs/:id/issue/resolve', h(async (ctx, req) => (await O.resolveIssue(ctx, id(req), parse(z.object({ note: optStr(1000) }), req.body).note), V.jobAggregate(ctx, id(req)))));
rabsRouter.post('/jobs/:id/close', h(async (ctx, req) => (await O.closeJob(ctx, id(req), parse(z.object({ force: z.boolean().optional(), reason: optStr(500) }), req.body)), V.jobAggregate(ctx, id(req)))));
rabsRouter.post('/jobs/:id/reopen', h(async (ctx, req) => (await O.reopenJob(ctx, id(req)), V.jobAggregate(ctx, id(req)))));
rabsRouter.post('/jobs/:id/files', photos, h(async (ctx, req) => J.addJobFiles(ctx, id(req), (req.files as Express.Multer.File[]) || [], 'document', (req.body?.caption as string) || undefined), 201));

// ---- Appointments ------------------------------------------------------------------------

rabsRouter.get('/appointments', h((ctx, req) => J.listAppointments(ctx, req.query.from as string, req.query.to as string, req.query.staff as string)));
rabsRouter.patch('/appointments/:id', h((ctx, req) => J.updateAppointment(ctx, id(req), parse(appointmentSchema.partial().extend({ status: z.enum(['booked', 'done', 'cancelled']).optional() }), req.body))));

// ---- Measurement & rooms --------------------------------------------------------------------

rabsRouter.patch('/measurements/:id', h((ctx, req) => J.updateMeasurementNotes(ctx, id(req), parse(z.object({ notes: optStr(4000) }), req.body).notes ?? null)));
rabsRouter.post('/measurements/:id/rooms', h(async (ctx, req) => J.addRoom(ctx, id(req), parse(roomSchema, req.body)), 201));
rabsRouter.patch('/rooms/:id', h((ctx, req) => J.updateRoom(ctx, id(req), parse(roomSchema.partial(), req.body))));
rabsRouter.delete('/rooms/:id', h((ctx, req) => J.deleteRoom(ctx, id(req))));
rabsRouter.post('/rooms/:id/photos', photos, h(async (ctx, req) => J.addRoomPhotos(ctx, id(req), (req.files as Express.Multer.File[]) || []), 201));
rabsRouter.post('/calc/room', h((ctx, req) => J.calcRoomPreview(ctx, parse(roomSchema.extend({ name: z.string().optional().default('Room') }), req.body))));
rabsRouter.delete('/files/:id', h((ctx, req) => J.deleteFile(ctx, id(req))));

// ---- Quotes -----------------------------------------------------------------------------------

rabsRouter.get('/quotes/:id', h((ctx, req) => Q.getQuote(ctx, id(req))));
rabsRouter.patch(
  '/quotes/:id',
  h((ctx, req) =>
    Q.updateQuote(ctx, id(req), parse(z.object({ discountType: z.enum(['none', 'percent', 'fixed']).optional(), discountValue: money(100000).optional(), deliveryCharge: money(10000).optional(), notes: optStr(4000), validUntil: optStr(10) }), req.body))
  )
);
rabsRouter.post(
  '/quotes/:id/lines',
  h((ctx, req) =>
    Q.addQuoteLine(ctx, id(req), parse(z.object({ description: z.string().trim().min(2, 'is required').max(255), qty: z.coerce.number().min(0.01).max(10000), unitPrice: z.coerce.number().min(-100000).max(100000), unitCost: money(100000).optional(), unit: optStr(20).transform((v) => v || undefined), roomId: idStr.optional().nullable() }), req.body)),
  201)
);
rabsRouter.patch('/quotes/:id/lines/:lineId', h((ctx, req) => Q.updateQuoteLine(ctx, id(req), parseId(req.params.lineId), parse(z.object({ qty: z.coerce.number().min(0.01).max(10000).optional(), unitPrice: z.coerce.number().min(-100000).max(100000).optional(), description: optStr(255).transform((v) => v || undefined) }), req.body))));
rabsRouter.delete('/quotes/:id/lines/:lineId', h((ctx, req) => Q.deleteQuoteLine(ctx, id(req), parseId(req.params.lineId))));
rabsRouter.post('/quotes/:id/rebuild', h(async (ctx, req) => {
  const { quote } = await Q.getQuote(ctx, id(req));
  return Q.createQuoteFromMeasurement(ctx, quote.jobId);
}));
rabsRouter.post('/quotes/:id/send', h((ctx, req) => Q.sendQuote(ctx, id(req))));
rabsRouter.post('/quotes/:id/revise', h((ctx, req) => Q.reviseQuote(ctx, id(req)), 201));
rabsRouter.post('/quotes/:id/decline', h((ctx, req) => Q.declineQuote(ctx, id(req))));
rabsRouter.post(
  '/quotes/:id/accept',
  h(async (ctx, req) => {
    const b = parse(z.object({ acceptedByName: optStr(160), convert: z.boolean().optional() }), req.body);
    const job = await Q.acceptQuote(ctx, id(req), b);
    return V.jobAggregate(ctx, job.id);
  })
);

// ---- Payments, variations, materials ------------------------------------------------------------

rabsRouter.delete('/payments/:id', h((ctx, req) => O.deletePayment(ctx, id(req))));
rabsRouter.post('/variations/:id/approve', h((ctx, req) => O.setVariationStatus(ctx, id(req), 'approved')));
rabsRouter.post('/variations/:id/reject', h((ctx, req) => O.setVariationStatus(ctx, id(req), 'rejected')));
rabsRouter.post('/materials/:id/status', h((ctx, req) => O.setMaterialStatus(ctx, id(req), parse(z.object({ status: z.enum(['ordered', 'received']) }), req.body).status)));

// ---- Fitting / delivery & field work -----------------------------------------------------------

rabsRouter.get('/my-work', h((ctx, req) => O.myWork(ctx, (['today', 'upcoming', 'all'].includes(String(req.query.scope)) ? req.query.scope : 'upcoming') as any)));
rabsRouter.post('/bookings/:id/cancel', h((ctx, req) => O.cancelBooking(ctx, id(req))));
rabsRouter.post('/bookings/:id/start', h((ctx, req) => O.startBooking(ctx, id(req))));
rabsRouter.put('/bookings/:id/checklist', h((ctx, req) => {
  const b = parse(z.object({ checklist: z.array(z.object({ label: z.string().min(1).max(200), done: z.boolean() })).max(40), notes: optStr(4000) }), req.body);
  return O.updateChecklist(ctx, id(req), b.checklist, b.notes);
}));
rabsRouter.post('/bookings/:id/photos', photos, h(async (ctx, req) => {
  const kind = parse(z.object({ kind: z.enum(['before', 'after']) }), req.body).kind;
  return O.addBookingPhotos(ctx, id(req), kind, (req.files as Express.Multer.File[]) || []);
}, 201));
rabsRouter.post('/bookings/:id/signature', h((ctx, req) => {
  const b = parse(z.object({ dataUrl: z.string().max(3_000_000), signedName: z.string().trim().min(2, 'is required').max(160) }), req.body);
  return O.saveSignature(ctx, id(req), b.dataUrl, b.signedName);
}));
rabsRouter.post('/bookings/:id/complete', h((ctx, req) => O.completeBooking(ctx, id(req), parse(z.object({ notes: optStr(4000) }), req.body).notes)));

// ---- Reports -------------------------------------------------------------------------------------

rabsRouter.get('/reports/pipeline', h((ctx) => V.reportPipeline(ctx)));
rabsRouter.get('/reports/sales', h((ctx, req) => V.reportSales(ctx, req.query.from as string, req.query.to as string)));
rabsRouter.get('/reports/outstanding', h((ctx) => V.reportOutstanding(ctx)));
rabsRouter.get('/reports/schedule', h((ctx, req) => V.reportSchedule(ctx, req.query.from as string, req.query.to as string)));
rabsRouter.get('/reports/purchasing', h((ctx) => V.reportPurchasing(ctx)));

// ---- Admin -----------------------------------------------------------------------------------------

rabsRouter.use('/admin', async (req: Request, res: Response, next: NextFunction) => {
  if (req.method === 'GET') return next();
  try {
    requireCap(await buildCtx(req), 'admin');
    next();
  } catch (err: any) {
    const status = err instanceof HttpError ? err.status : 500;
    res.status(status).json({ error: { message: status >= 500 ? 'Something went wrong. Please try again.' : err.message, status } });
  }
});

rabsRouter.get('/admin/settings', h((ctx) => A.getAdminSettings(ctx)));
rabsRouter.put(
  '/admin/settings',
  h((ctx, req) =>
    A.updateSettings(
      ctx,
      parse(
        z.object({
          vatRate: z.coerce.number().min(0).max(0.5).optional(),
          pricesIncludeVat: z.boolean().optional(),
          depositMode: z.enum(['percent', 'fixed', 'none']).optional(),
          depositPercent: z.coerce.number().min(0).max(100).optional(),
          depositFixedAmount: money(100000).optional(),
          depositMinAmount: money(100000).optional(),
          autoCloseWhenPaid: z.boolean().optional(),
          defaultDeliveryCharge: money(10000).optional(),
          quoteValidityDays: z.coerce.number().int().min(1).max(365).optional(),
          jobPrefix: z.string().trim().min(1).max(20).optional(),
          quotePrefix: z.string().trim().min(1).max(20).optional(),
          invoicePrefix: z.string().trim().min(1).max(20).optional(),
          nextJobNumber: z.coerce.number().int().min(1).optional(),
          nextQuoteNumber: z.coerce.number().int().min(1).optional(),
          nextInvoiceNumber: z.coerce.number().int().min(1).optional(),
          documentFooter: optStr(2000),
          quoteTerms: optStr(4000),
          companyDetails: z.record(z.string().max(300)).optional().nullable()
        }),
        req.body
      ) as any
    )
  )
);
rabsRouter.get('/admin/statuses', h((ctx) => A.listStatuses(ctx)));
rabsRouter.put(
  '/admin/statuses',
  h((ctx, req) =>
    A.updateStatuses(ctx, parse(z.object({ statuses: z.array(z.object({ code: z.string().max(40), label: z.string().trim().min(1).max(80).optional(), color: hex.optional(), textColor: hex.optional(), nextActionLabel: optStr(80), isActive: z.boolean().optional() })).max(40) }), req.body).statuses)
  )
);
rabsRouter.get('/admin/products', h((ctx) => A.listProducts(ctx)));
rabsRouter.post('/admin/products', h((ctx, req) => A.createProduct(ctx, parse(productSchema, req.body) as any), 201));
rabsRouter.patch('/admin/products/:id', h((ctx, req) => A.updateProduct(ctx, id(req), parse(productSchema.partial(), req.body) as any)));
rabsRouter.get('/admin/labour-rules', h((ctx) => A.listLabour(ctx)));
rabsRouter.post('/admin/labour-rules', h((ctx, req) => A.createLabour(ctx, parse(labourSchema, req.body) as any), 201));
rabsRouter.patch('/admin/labour-rules/:id', h((ctx, req) => A.updateLabour(ctx, id(req), parse(labourSchema.partial(), req.body) as any)));
rabsRouter.get('/admin/audit', h((ctx, req) => A.listAudit(ctx, Number(req.query.limit) || 200)));
rabsRouter.get('/admin/permissions', h((ctx) => A.getPermissions(ctx)));
rabsRouter.put('/admin/permissions', h((ctx, req) => A.updatePermissions(ctx, parse(z.object({ matrix: z.record(z.array(z.string().max(50)).max(40)) }), req.body).matrix)));
rabsRouter.get('/admin/staff', h((ctx) => A.listStaff(ctx)));
rabsRouter.post(
  '/admin/staff',
  h((ctx, req) =>
    A.createStaff(ctx, parse(z.object({ email: z.string().trim().email('enter a valid email'), firstName: z.string().trim().min(1, 'is required').max(100), lastName: optStr(100), roleCode: z.string().min(2).max(50), password: z.string().min(8, 'must be at least 8 characters').max(100) }), req.body)),
  201)
);
rabsRouter.patch('/admin/staff/:id/role', h((ctx, req) => A.setStaffRole(ctx, id(req), parse(z.object({ roleCode: z.string().min(2).max(50) }), req.body).roleCode)));
rabsRouter.get('/admin/check', h(async (ctx) => (requireCap(ctx, 'admin'), { ok: true })));
rabsRouter.delete(
  '/admin/jobs/:id',
  h((ctx, req) =>
    O.deleteJob(ctx, id(req), parse(z.object({ confirm: z.string().trim().min(1, 'type the job number to confirm').max(40), reason: optStr(255), deleteCustomer: z.boolean().optional() }), req.body))
  )
);
