/**
 * End-to-end "Mr Smith" journey plus the awkward cases, against a running API. Everything it creates is deleted at the end.
 *   RABS_API=https://api.rabsinteriors.app \
 *   RABS_PASSWORD_FILE=/root/.rabs-staff-initial-password RABS_ADMIN_PASSWORD_FILE=/root/.rabs-admin-initial-password \
 *   node dist/scripts/e2eRabsJourney.js
 * Optional: RABS_OFFICE_EMAIL, RABS_FITTER_EMAIL, RABS_SURVEYOR_EMAIL, RABS_ADMIN_EMAIL, RABS_PASSWORD, RABS_ADMIN_PASSWORD.
 * Passwords are read from env/files and never printed.
 */
import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import zlib from 'zlib';

const API = (process.env.RABS_API || 'http://127.0.0.1:4015').replace(/\/$/, '');
const secret = (value?: string, file?: string) => (value || (file ? readFileSync(file, 'utf8') : '')).trim();
const PASSWORD = secret(process.env.RABS_PASSWORD, process.env.RABS_PASSWORD_FILE);
const ADMIN_PASSWORD = secret(process.env.RABS_ADMIN_PASSWORD, process.env.RABS_ADMIN_PASSWORD_FILE);
const OFFICE = process.env.RABS_OFFICE_EMAIL || 'office@rabsinteriors.app';
const FITTER = process.env.RABS_FITTER_EMAIL || 'fitter@rabsinteriors.app';
const SURVEYOR = process.env.RABS_SURVEYOR_EMAIL || 'surveyor@rabsinteriors.app';
const ADMIN = process.env.RABS_ADMIN_EMAIL || 'admin@rabsinteriors.app';

let step = 0;
const ok = (msg: string) => console.log(`  ✔ ${String(++step).padStart(2, '0')} ${msg}`);

async function login(email: string, password: string) {
  const r = await fetch(`${API}/api/iam/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`login ${email} failed: ${j?.error?.message}`);
  return j.accessToken as string;
}

type Client = ReturnType<typeof client>;
function client(token: string) {
  const call = async (method: string, path: string, body?: unknown, expect = [200, 201]) => {
    const isForm = body instanceof FormData;
    const r = await fetch(`${API}/api/rabs${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body && !isForm ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? (isForm ? (body as FormData) : JSON.stringify(body)) : undefined
    });
    const text = await r.text();
    const json = text ? JSON.parse(text) : null;
    if (!expect.includes(r.status)) throw new Error(`${method} ${path} → ${r.status}: ${json?.error?.message ?? text}`);
    return { status: r.status, data: json };
  };
  return {
    get: (p: string, e?: number[]) => call('GET', p, undefined, e).then((x) => x.data),
    post: (p: string, b?: unknown, e?: number[]) => call('POST', p, b ?? {}, e).then((x) => x.data),
    put: (p: string, b?: unknown, e?: number[]) => call('PUT', p, b ?? {}, e).then((x) => x.data),
    patch: (p: string, b?: unknown, e?: number[]) => call('PATCH', p, b ?? {}, e).then((x) => x.data),
    del: (p: string, b?: unknown, e?: number[]) => call('DELETE', p, b, e).then((x) => x.data),
    raw: call
  };
}

// tiny PNG for photo uploads
function tinyPng(seed: number) {
  const w = 64, h = 48;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) raw.set([(x * 4 + seed * 30) & 255, (y * 5) & 255, 120], y * (w * 3 + 1) + 1 + x * 3);
  const crcT = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b: Buffer) => { let c = 0xffffffff; for (const v of b) c = crcT[(c ^ v) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); const td = Buffer.concat([Buffer.from(t), d]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([l, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
// smallest valid baseline JPEG (1×1 grey)
const TINY_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQEASABIAAD/2wBDAP//////////////////////////////////////////////////////////////////////////////////////wgALCAABAAEBAREA/8QAFBABAAAAAAAAAAAAAAAAAAAAAP/aAAgBAQABPxA=',
  'base64'
);
function photos(n: number, extra?: Record<string, string>) {
  const fd = new FormData();
  for (let i = 0; i < n; i++) fd.append('files', new Blob([tinyPng(i)], { type: 'image/png' }), `photo-${i}.png`);
  for (const [k, v] of Object.entries(extra || {})) fd.append(k, v);
  return fd;
}

function londonToday() {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/London' }));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
const addDays = (day: string, n: number) => {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const uniquePhone = () => `07700 9${String(Date.now() + Math.floor(Math.random() * 1000)).slice(-5)}`;

const created: Array<{ id: string; number: string }> = [];
const restore: Array<{ what: string; run: () => Promise<unknown> }> = [];

async function newEnquiry(office: Client, name: string, extra: Record<string, unknown> = {}) {
  const tag = `${Date.now()}${Math.floor(Math.random() * 100)}`;
  const agg = await office.post('/enquiries', {
    customer: { name, phone: uniquePhone(), email: `e2e.${tag}@example.co.uk`, addressLine1: '1 Test Street', city: 'Hanley', postcode: 'ST1 1AA', source: 'Walk-in' },
    notes: 'Automated test record — deleted by the test',
    ...extra
  });
  created.push({ id: agg.job.id, number: agg.job.jobNumber });
  return agg;
}

async function main(admin: Client) {
  const office = client(await login(OFFICE, PASSWORD));
  const fitter = client(await login(FITTER, PASSWORD));
  const surveyorC = client(await login(SURVEYOR, PASSWORD));
  ok('Admin, office, surveyor and fitter logged in');

  const meta = await office.get('/meta');
  const twist = meta.products.find((p: any) => p.code === 'CPT-TWIST-4');
  const sofa = meta.products.find((p: any) => p.code === 'SOFA-3S-GREY');
  const surveyor = meta.staff.find((s: any) => s.roles.includes('SURVEYOR'));
  const fitterUser = meta.staff.find((s: any) => s.email === FITTER);
  const driver = meta.staff.find((s: any) => s.roles.includes('DRIVER'));
  assert.ok(twist && sofa && surveyor && fitterUser, 'seed data present');
  assert.equal(meta.me.permissions.includes('view_costs'), false, 'office must not see costs');
  assert.equal(meta.progressSteps.map((s: any) => s.label).join(' → '), 'APPOINTMENT → MEASURE → QUOTE → ACCEPTED → DEPOSIT → MATERIAL → FITTING/DELIVERY → COMPLETE → BALANCE → CLOSED');
  ok('Meta: catalogue, staff, statuses; progress labels exact; office cannot see cost/margin');

  // ---- Validation --------------------------------------------------------------------------
  const v1 = await office.raw('POST', '/enquiries', { customer: { name: 'No Contact' } }, [400]);
  assert.match(v1.data.error.message, /phone number or email/);
  const v2 = await office.raw('POST', '/enquiries', { customer: { name: 'Bad Postcode', phone: '07700 900999', postcode: 'XYZ' } }, [400]);
  assert.match(v2.data.error.message, /postcode/i);
  const vNaN = await office.raw('POST', '/calc/room', { unitInput: 'm', lengthM: 'abc', widthM: 4 }, [400]);
  assert.match(vNaN.data.error.message, /must be a number/);
  const vNeg = await office.raw('POST', '/calc/room', { unitInput: 'm', lengthM: -2, widthM: 4 }, [400]);
  assert.match(vNeg.data.error.message, /cannot be negative/);
  const vHuge = await office.raw('POST', '/calc/room', { unitInput: 'm', lengthM: 99999, widthM: 4 }, [400]);
  assert.match(vHuge.data.error.message, /100 or less/);
  const v1211 = await office.post('/calc/room', { unitInput: 'ftin', lengthFt: 12, lengthIn: 11, widthFt: 10, widthIn: 0, productId: twist.id });
  assert.equal(v1211.lengthM, 3.937);
  const badIn = await office.raw('POST', '/calc/room', { unitInput: 'ftin', lengthFt: 10, lengthIn: 12, widthFt: 10, widthIn: 0 }, [400]);
  assert.match(badIn.data.error.message, /less than 12|11\.99/);
  const vPay = await office.raw('POST', '/jobs/1/payments', { amount: -5, method: 'card' }, [400, 404]);
  assert.ok(vPay.status === 400 || vPay.status === 404);
  ok("Validation: contact & postcode required; 'abc' → must be a number; negative, huge and 10'12\" rejected; 12'11\" = 3.937 m");

  // ---- Mr Smith: enquiry → appointment ---------------------------------------------------------
  const phone = uniquePhone();
  const tomorrow = addDays(londonToday(), 1);
  let job = await office.post('/enquiries', {
    customer: { name: 'Mr John Smith', phone, email: `john.smith.${Date.now()}@example.co.uk`, addressLine1: '10 Waterloo Road', city: 'Burslem', postcode: 'ST6 3HF', source: 'Walk-in' },
    appointment: { scheduledAt: `${tomorrow}T10:00:00`, purpose: 'measure', staffUserId: surveyor.id, notes: 'Measure lounge and bedroom' }
  });
  const jobId = job.job.id;
  created.push({ id: jobId, number: job.job.jobNumber });
  assert.equal(job.status.code, 'APPOINTMENT');
  assert.equal(job.nextAction.code, 'start_measurement');
  assert.equal(job.nextAction.label, 'START MEASUREMENT');
  ok(`Created Mr Smith → job ${job.job.jobNumber}, appointment booked (status Appointment, NEXT: START MEASUREMENT)`);

  const dup = await office.raw('POST', '/enquiries', { customer: { name: 'John Smith', phone } }, [409]);
  assert.match(dup.data.error.message, /already has this phone/);
  ok('Duplicate customer detected by phone');

  // ---- Measurement ----------------------------------------------------------------------------
  const m = await office.post(`/jobs/${jobId}/measurement`, {});
  const prev = await office.post('/calc/room', { name: 'Lounge', unitInput: 'm', lengthM: 5, widthM: 4, productId: twist.id });
  assert.equal(prev.areaM2, 20);
  assert.equal(prev.areaSqyd, 23.92);
  assert.equal(prev.perimeterM, 18);
  const ftPrev = await office.post('/calc/room', { unitInput: 'ftin', lengthFt: 16, lengthIn: 4.85, widthFt: 13, widthIn: 1.48, productId: twist.id });
  assert.ok(Math.abs(ftPrev.lengthM - 5) < 0.01 && Math.abs(ftPrev.widthM - 4) < 0.01);
  const zeroW = await office.raw('POST', `/measurements/${m.id}/rooms`, { name: 'Zero', unitInput: 'm', lengthM: 4, widthM: 0, productId: twist.id }, [400]);
  assert.match(zeroW.data.error.message, /length and width|greater than 0/i);
  ok('Start Measurement; preview 5m×4m = 20 m² / 23.92 sq yd; ft/in converts; 0 width rejected when saving');

  const lounge = await office.post(`/measurements/${m.id}/rooms`, { name: 'Lounge', unitInput: 'm', lengthM: 5, widthM: 4, doors: 1, productId: twist.id });
  const lp = await office.post(`/rooms/${lounge.id}/photos`, photos(3));
  assert.equal(lp.length, 3);
  const jpg = new FormData();
  jpg.append('files', new Blob([TINY_JPEG], { type: 'image/jpeg' }), 'phone.jpg');
  const jp = await office.post(`/rooms/${lounge.id}/photos`, jpg);
  assert.equal(jp[0].mimeType, 'image/jpeg');
  const notImg = new FormData();
  notImg.append('files', new Blob([Buffer.from('%PDF-1.4 test')], { type: 'application/pdf' }), 'x.pdf');
  await office.raw('POST', `/rooms/${lounge.id}/photos`, notImg, [400]);
  const bed = await office.post(`/measurements/${m.id}/rooms`, { name: 'Bedroom 1', unitInput: 'm', lengthM: 4, widthM: 3, doors: 1, productId: twist.id });
  await office.post(`/rooms/${bed.id}/photos`, photos(3));
  const xss = '<img src=x onerror=alert(1)> Park on drive';
  const mn = await office.patch(`/measurements/${m.id}`, { notes: xss });
  assert.equal(mn.notes, xss, 'notes stored as plain text (React escapes on display)');
  job = await office.get(`/jobs/${jobId}`);
  assert.equal(job.status.code, 'MEASUREMENT');
  assert.equal(job.nextAction.label, 'CREATE QUOTATION');
  assert.equal(job.measurement.rooms.length, 2);
  assert.equal(job.measurement.rooms[0].photos.length, 4);
  assert.equal(job.measurement.rooms[0].accessories.length, 3, 'underlay + gripper + door bar auto-ticked');
  const photoUrl = job.measurement.rooms[0].photos[0].url as string;
  const img = await fetch(photoUrl.replace(/^https?:\/\/[^/]+/, API));
  assert.equal(img.status, 200);
  ok('Lounge 5×4 (3 PNG + 1 JPEG) + Bedroom 4×3 saved; PDF refused as room photo; accessories auto-ticked; photos served; XSS text kept inert');

  // ---- Quotation --------------------------------------------------------------------------------
  const q = await office.post(`/jobs/${jobId}/quotes`, {});
  let full = await office.get(`/quotes/${q.id}`);
  const rooms = new Set(full.lines.map((l: any) => l.roomName));
  assert.deepEqual([...rooms], ['Lounge', 'Bedroom 1']);
  const types = full.lines.map((l: any) => `${l.roomName}:${l.lineType}`);
  assert.ok(types.includes('Lounge:labour') && types.includes('Bedroom 1:accessory'));
  assert.equal(full.quote.subtotal, 1031.72);
  assert.equal(full.quote.vatAmount, 206.34);
  assert.equal(full.quote.total, 1238.06);
  assert.equal(full.quote.depositRequired, 309.52);
  assert.equal(full.quote.costTotal, undefined, 'cost hidden from office');
  ok(`Create Quotation: ${full.lines.length} lines per room; £1,031.72 + VAT £206.34 = £1,238.06; deposit 25% £309.52`);

  // Room changes keep the draft in step; extra lines survive
  full = await office.post(`/quotes/${q.id}/lines`, { description: 'Move & refit wardrobe', qty: 1, unitPrice: 50 });
  assert.equal(full.quote.subtotal, 1081.72);
  const hall = await office.post(`/measurements/${m.id}/rooms`, { name: 'Hall', unitInput: 'm', lengthM: 2, widthM: 1, doors: 1, productId: twist.id });
  full = await office.get(`/quotes/${q.id}`);
  assert.ok(full.quote.subtotal > 1081.72, 'adding a room refreshes the draft');
  assert.ok(full.lines.some((l: any) => l.description === 'Move & refit wardrobe'), 'extra line kept');
  await office.del(`/rooms/${hall.id}`);
  full = await office.get(`/quotes/${q.id}`);
  assert.equal(full.quote.subtotal, 1081.72, 'deleting the room recalculates the draft');
  await office.patch(`/rooms/${bed.id}`, { lengthM: 4.5 });
  full = await office.get(`/quotes/${q.id}`);
  assert.ok(full.quote.subtotal > 1081.72, 'editing a room refreshes the draft');
  await office.patch(`/rooms/${bed.id}`, { lengthM: 4 });
  const extra = (await office.get(`/quotes/${q.id}`)).lines.find((l: any) => l.description === 'Move & refit wardrobe');
  full = await office.del(`/quotes/${q.id}/lines/${extra.id}`);
  assert.equal(full.quote.subtotal, 1031.72);
  ok('Add / edit / delete room → draft quote recalculates by itself; manually added extra lines are kept');

  const again = await office.post(`/jobs/${jobId}/quotes`, {});
  assert.equal(again.id, q.id, 'clicking Create Quotation twice rebuilds the same draft');
  await office.post(`/quotes/${q.id}/send`);
  job = await office.get(`/jobs/${jobId}`);
  assert.equal(job.status.code, 'QUOTE_SENT');
  assert.equal(job.nextAction.label, 'ACCEPT & CREATE JOB');
  ok('No duplicate drafts; quote sent (Quotation Sent, NEXT: ACCEPT & CREATE JOB)');

  job = await office.post(`/quotes/${q.id}/accept`, { convert: true, acceptedByName: 'John Smith' });
  assert.equal(job.status.code, 'DEPOSIT_PENDING');
  assert.equal(job.money.total, 1238.06);
  assert.equal(job.money.depositRequired, 309.52);
  assert.ok(job.job.convertedAt);
  assert.equal(job.job.jobNumber, created.find((c) => c.id === jobId)!.number, 'job number kept from enquiry');
  ok('YES — Convert this quotation into a job → Deposit Pending; same job number; rooms, prices, deposit carried');

  // Admin price change: audited, accepted quote untouched
  const oldPrice = twist.sellPrice;
  restore.push({ what: 'twist price', run: () => admin.patch(`/admin/products/${twist.id}`, { sellPrice: oldPrice }) });
  const newPrice = Math.round((oldPrice + 1) * 100) / 100;
  await admin.patch(`/admin/products/${twist.id}`, { sellPrice: newPrice });
  const audit = await admin.get('/admin/audit?limit=20');
  assert.ok(audit.some((a: any) => a.entity === 'product' && String(a.entity_id) === String(twist.id) && a.field === 'sellPrice' && Math.abs(Number(a.new_value) - newPrice) < 0.001), 'price change audited');
  const accepted = await office.get(`/quotes/${q.id}`);
  assert.equal(accepted.quote.total, 1238.06, 'accepted quote keeps its values');
  await admin.patch(`/admin/products/${twist.id}`, { sellPrice: oldPrice });
  restore.pop();
  ok('Admin price change written to the audit trail; accepted quote still £1,238.06');

  // Status colour change is central
  const newColour = meta.statuses.find((s: any) => s.code === 'NEW').color;
  restore.push({ what: 'NEW colour', run: () => admin.put('/admin/statuses', { statuses: [{ code: 'NEW', color: newColour }] }) });
  await admin.put('/admin/statuses', { statuses: [{ code: 'NEW', color: '#123456' }] });
  assert.equal((await office.get('/meta')).statuses.find((s: any) => s.code === 'NEW').color.toUpperCase(), '#123456');
  await admin.put('/admin/statuses', { statuses: [{ code: 'NEW', color: newColour }] });
  restore.pop();
  ok('Admin status colour change shows up for everyone (then restored)');

  const locked = await office.raw('PATCH', `/rooms/${lounge.id}`, { lengthM: 6 }, [409]);
  assert.match(locked.data.error.message, /locked/);
  const over = await office.raw('POST', `/jobs/${jobId}/payments`, { amount: 5000, method: 'card' }, [400]);
  assert.match(over.data.error.message, /outstanding balance/);
  const zero = await office.raw('POST', `/jobs/${jobId}/payments`, { amount: 0, method: 'card' }, [400]);
  assert.ok(zero.data.error.message);
  ok('Accepted quote locks rooms; overpayment and £0 payment rejected');

  job = await office.post(`/jobs/${jobId}/payments`, { amount: 100, method: 'cash' });
  assert.equal(job.status.code, 'DEPOSIT_PENDING');
  job = await office.post(`/jobs/${jobId}/payments`, { amount: 209.52, method: 'card', reference: 'DEP-SMITH' });
  assert.equal(job.status.code, 'CONFIRMED');
  assert.equal(job.nextAction.label, 'CHECK MATERIALS');
  ok('Part deposit £100 keeps Deposit Pending; rest £209.52 → Confirmed (NEXT: CHECK MATERIALS)');

  job = await office.post(`/jobs/${jobId}/materials/check`);
  assert.equal(job.status.code, 'READY_TO_FIT');
  assert.equal(job.nextAction.label, 'BOOK FITTING');
  assert.ok(job.materials.length >= 4 && job.materials.every((x: any) => x.status === 'reserved'));
  ok(`Materials checked: ${job.materials.length} items reserved → Ready to Fit (NEXT: BOOK FITTING)`);

  const today = londonToday();
  job = await office.post(`/jobs/${jobId}/bookings`, { type: 'fitting', scheduledDate: addDays(today, 3), slot: 'AM', staffUserId: fitterUser.id, instructions: 'Door code 1234' });
  assert.equal(job.status.code, 'FITTING_BOOKED');
  job = await office.post(`/jobs/${jobId}/bookings`, { type: 'fitting', scheduledDate: today, slot: 'AM', staffUserId: fitterUser.id });
  assert.equal(job.status.code, 'FITTING_TODAY');
  const bookingId = job.bookings[0].id;
  ok('Fitting booked in 3 days → Fitting Booked; moved to today → Fitting Today (set from the date)');

  const work = await fitter.get('/my-work?scope=today');
  assert.ok(work.some((w: any) => String(w.jobId) === String(jobId)));
  const fj = await fitter.get(`/jobs/${jobId}`);
  assert.equal(fj.money, null, 'fitter sees no prices');
  assert.equal(fj.measurement.rooms.length, 2);
  await fitter.raw('POST', `/jobs/${jobId}/payments`, { amount: 10, method: 'cash' }, [403]);
  await fitter.raw('GET', '/admin/settings', undefined, [403]);
  ok('Fitter: sees rooms & address on phone, no prices, cannot take payments or open admin');

  const sj = await surveyorC.get(`/jobs/${jobId}`);
  assert.ok(sj.money, 'surveyor sees prices');
  await surveyorC.raw('POST', `/jobs/${jobId}/payments`, { amount: 10, method: 'cash' }, [403]);
  const sq = await surveyorC.get(`/quotes/${q.id}`);
  assert.equal(sq.quote.costTotal, undefined, 'surveyor cannot see cost/margin');
  const aq = await admin.get(`/quotes/${q.id}`);
  assert.ok(aq.quote.costTotal !== undefined, 'admin sees cost/margin');
  ok('Surveyor sees prices but not cost, cannot take payments; admin sees cost & margin');

  await fitter.post(`/bookings/${bookingId}/start`);
  await fitter.post(`/bookings/${bookingId}/photos`, photos(2, { kind: 'before' }));
  const nosig = await fitter.raw('POST', `/bookings/${bookingId}/complete`, {}, [400]);
  assert.match(nosig.data.error.message, /must sign/);
  const b0 = fj.bookings[0];
  await fitter.put(`/bookings/${bookingId}/checklist`, { checklist: b0.checklist.map((c: any) => ({ ...c, done: true })) });
  const sig = `data:image/png;base64,${tinyPng(7).toString('base64')}`;
  await fitter.post(`/bookings/${bookingId}/signature`, { dataUrl: sig, signedName: 'John Smith' });
  const noAfter = await fitter.raw('POST', `/bookings/${bookingId}/complete`, {}, [400]);
  assert.match(noAfter.data.error.message, /after/);
  await fitter.post(`/bookings/${bookingId}/photos`, photos(2, { kind: 'after' }));
  await fitter.post(`/bookings/${bookingId}/complete`, { notes: 'Lovely job' });
  job = await office.get(`/jobs/${jobId}`);
  assert.equal(job.status.code, 'FITTING_COMPLETE');
  assert.equal(job.nextAction.label, 'COLLECT BALANCE');
  assert.equal(job.bookings[0].photos.length, 4);
  assert.ok(job.bookings[0].signatureUrl);
  assert.ok(job.materials.every((x: any) => x.status === 'used'), 'stock marked used');
  ok('Fitter: before photos, checklist, signature and at least one after photo are required → Fitting Complete (NEXT: COLLECT BALANCE)');

  job = await office.post(`/jobs/${jobId}/issue`, { note: 'Door bar loose in bedroom' });
  assert.equal(job.status.code, 'ISSUE');
  assert.equal(job.nextAction.code, 'resolve_issue');
  job = await office.post(`/jobs/${jobId}/issue/resolve`, { note: 'Refixed' });
  assert.equal(job.status.code, 'FITTING_COMPLETE');
  ok('Issue / snag raised (red, NEXT: RESOLVE ISSUE) and resolved');

  job = await office.post(`/jobs/${jobId}/invoice`);
  assert.equal(job.status.code, 'BALANCE_PENDING');
  assert.equal(job.invoice.total, 1238.06);
  assert.equal(job.invoice.balance, 928.54);
  ok(`Invoice ${job.invoice.invoiceNumber} from accepted quote: £1,238.06, balance £928.54`);

  job = await office.post(`/jobs/${jobId}/variations`, { description: 'Extra door bar for WC', netAmount: 50, approve: true });
  assert.equal(job.invoice.total, 1298.06);
  assert.equal(job.money.balance, 988.54);
  ok('Approved variation £50 + VAT → invoice £1,298.06, balance £988.54');

  job = await office.post(`/jobs/${jobId}/payments`, { amount: 500, method: 'card' });
  assert.equal(job.status.code, 'BALANCE_PENDING');
  assert.equal(job.money.balance, 488.54);
  const over2 = await office.raw('POST', `/jobs/${jobId}/payments`, { amount: 1000, method: 'card' }, [400]);
  assert.match(over2.data.error.message, /outstanding balance/);
  job = await office.post(`/jobs/${jobId}/payments`, { amount: 100, method: 'card', kind: 'refund' });
  assert.equal(job.money.balance, 588.54);
  job = await office.post(`/jobs/${jobId}/payments`, { amount: 588.54, method: 'bank_transfer', reference: 'BAL-SMITH' });
  assert.equal(job.status.code, 'FULLY_PAID');
  assert.equal(job.invoice.status, 'paid');
  assert.equal(job.money.balance, 0);
  assert.equal(job.nextAction.label, 'CLOSE JOB');
  ok('Part payment £500, overpayment refused, £100 refund, final £588.54 → Fully Paid (NEXT: CLOSE JOB)');

  job = await office.post(`/jobs/${jobId}/close`, {});
  assert.equal(job.status.code, 'CLOSED');
  assert.equal(job.progress.index, 9);
  job = await office.post(`/jobs/${jobId}/issue`, { note: 'Customer rang: seam lifting in lounge' });
  assert.equal(job.status.code, 'ISSUE');
  assert.equal(job.job.closedAt, null);
  job = await office.post(`/jobs/${jobId}/issue/resolve`, { note: 'Seam re-glued' });
  assert.equal(job.status.code, 'FULLY_PAID');
  job = await office.post(`/jobs/${jobId}/close`, {});
  assert.equal(job.status.code, 'CLOSED');
  assert.ok(job.timeline.length >= 20);
  ok(`Closed → snag after close reopens it → resolved → closed again; timeline ${job.timeline.length} entries`);

  for (const term of [job.job.jobNumber, q.quoteNumber, job.invoice.invoiceNumber, phone.replace(/\s/g, ''), 'Smith', 'ST6 3HF', '10 Waterloo']) {
    const s = await office.get(`/search?q=${encodeURIComponent(term)}`);
    assert.ok(s.jobs.some((r: any) => r.id === String(jobId)), `search "${term}"`);
  }
  ok('Search finds the job by job no., quote no., invoice no., phone, name, postcode and address');

  // ---- Side job: settings, numbering, re-versioning, accept then convert ----------------------------
  const settings = await admin.get('/admin/settings');
  const orig = { vatRate: settings.vatRate, depositPercent: settings.depositPercent, quotePrefix: settings.quotePrefix };
  restore.push({ what: 'settings', run: () => admin.put('/admin/settings', orig) });
  let side = await newEnquiry(office, 'E2E Versions Test');
  const sm = await office.post(`/jobs/${side.job.id}/measurement`, {});
  const kitchen = await office.post(`/measurements/${sm.id}/rooms`, { name: 'Kitchen', unitInput: 'm', lengthM: 3, widthM: 3, productId: twist.id });
  await admin.put('/admin/settings', { vatRate: 0.15, depositPercent: 30, quotePrefix: 'QT-' });
  const sq1 = await office.post(`/jobs/${side.job.id}/quotes`, {});
  await admin.put('/admin/settings', orig);
  restore.pop();
  assert.ok(sq1.quoteNumber.startsWith('QT-'), 'quote prefix from admin');
  assert.equal(Number(sq1.vatRate), 0.15);
  assert.equal(sq1.depositRequired, Math.round(sq1.total * 30) / 100);
  const settingsAudit = await admin.get('/admin/audit?limit=30');
  assert.ok(settingsAudit.some((a: any) => a.entity === 'settings' && a.field === 'quotePrefix'), 'prefix change audited');
  ok(`Admin VAT 15%, deposit 30%, prefix QT- → new quote ${sq1.quoteNumber} uses them (all audited), then restored`);

  await office.post(`/quotes/${sq1.id}/send`);
  await office.patch(`/rooms/${kitchen.id}`, { lengthM: 4 });
  const sq2 = await office.post(`/jobs/${side.job.id}/quotes`, {});
  assert.notEqual(sq2.id, sq1.id);
  assert.equal(sq2.version, 2);
  const v1q = await office.get(`/quotes/${sq1.id}`);
  assert.equal(v1q.quote.status, 'superseded');
  assert.equal(v1q.quote.total, sq1.total, 'old version keeps its values');
  assert.equal(Number(v1q.quote.vatRate), 0.15, 'old version keeps its VAT rate');
  assert.equal(Number(sq2.vatRate), Number(orig.vatRate));
  ok('Changing a room after sending makes version 2; version 1 keeps its prices and VAT');

  side = await office.post(`/quotes/${sq2.id}/accept`, { acceptedByName: 'Tester' });
  assert.equal(side.status.code, 'ACCEPTED');
  assert.equal(side.nextAction.code, 'convert_job');
  side = await office.post(`/jobs/${side.job.id}/convert`);
  assert.equal(side.status.code, 'DEPOSIT_PENDING');
  await fitter.raw('GET', `/jobs/${side.job.id}`, undefined, [403, 404]);
  ok('Accept only → Accepted (NEXT: convert); Convert → Deposit Pending; fitter cannot open a job they are not booked on');

  // ---- Delivery-only job --------------------------------------------------------------------------
  let del = await newEnquiry(office, 'E2E Delivery Test');
  const dm = await office.post(`/jobs/${del.job.id}/measurement`, {});
  await office.post(`/measurements/${dm.id}/rooms`, { name: 'Lounge', productId: sofa.id, productQty: 1 });
  const dq = await office.post(`/jobs/${del.job.id}/quotes`, {});
  del = await office.post(`/quotes/${dq.id}/accept`, { convert: true });
  assert.equal(del.job.requiresDelivery, true);
  assert.equal(del.job.requiresFitting, false);
  del = await office.post(`/jobs/${del.job.id}/payments`, { amount: del.money.depositRequired, method: 'card' });
  del = await office.post(`/jobs/${del.job.id}/materials/check`);
  if (del.status.code === 'MATERIALS_PENDING') {
    for (const mi of del.materials.filter((x: any) => x.status === 'to_order')) {
      await office.post(`/materials/${mi.id}/status`, { status: 'ordered' });
      await office.post(`/materials/${mi.id}/status`, { status: 'received' });
    }
    del = await office.get(`/jobs/${del.job.id}`);
  }
  assert.equal(del.status.code, 'DELIVERY_REQUIRED');
  assert.equal(del.nextAction.label, 'BOOK DELIVERY');
  del = await office.post(`/jobs/${del.job.id}/bookings`, { type: 'delivery', scheduledDate: tomorrow, slot: 'PM', staffUserId: driver?.id ?? null });
  assert.equal(del.status.code, 'DELIVERY_BOOKED');
  ok('Sofa-only job: needs delivery not fitting → Delivery Required (NEXT: BOOK DELIVERY) → Delivery Booked');

  for (const p of ['/reports/pipeline', '/reports/sales', '/reports/outstanding', '/reports/schedule', '/reports/purchasing', '/dashboard']) await office.get(p);
  await fitter.raw('GET', '/reports/sales', undefined, [403]);
  ok('Reports & dashboard respond; fitter blocked from sales report');

  // ---- Admin delete (also the cleanup path) ------------------------------------------------------
  await office.raw('DELETE', `/admin/jobs/${del.job.id}`, { confirm: del.job.jobNumber }, [403]);
  const wrong = await admin.raw('DELETE', `/admin/jobs/${del.job.id}`, { confirm: 'RJ-0000' }, [400]);
  assert.match(wrong.data.error.message, /Type the job number/);
  ok('Delete job: office refused; admin must type the exact job number');
}

async function cleanup(admin: Client | null) {
  for (const r of restore.reverse()) {
    try {
      if (admin) await r.run();
      console.log(`  ↺ restored ${r.what}`);
    } catch (e: any) {
      console.error(`  ✖ could not restore ${r.what}: ${e.message}`);
    }
  }
  if (!created.length) return true;
  if (!admin) {
    console.error(`  ✖ no admin login — test jobs left behind: ${created.map((c) => c.number).join(', ')}`);
    return false;
  }
  let allGone = true;
  for (const c of created) {
    try {
      const r = await admin.del(`/admin/jobs/${c.id}`, { confirm: c.number, reason: 'Automated e2e test cleanup', deleteCustomer: true });
      await admin.raw('GET', `/jobs/${c.id}`, undefined, [404]);
      console.log(`  🧹 deleted ${r.deleted}${r.customerDeleted ? ' and its customer' : ''}`);
    } catch (e: any) {
      allGone = false;
      console.error(`  ✖ cleanup of ${c.number} failed: ${e.message}`);
    }
  }
  return allGone;
}

(async () => {
  if (!PASSWORD) throw new Error('Set RABS_PASSWORD_FILE (or RABS_PASSWORD)');
  if (!ADMIN_PASSWORD) throw new Error('Set RABS_ADMIN_PASSWORD_FILE (or RABS_ADMIN_PASSWORD) — needed for admin checks and cleanup');
  console.log(`RABS end-to-end journey against ${API}`);
  let admin: Client | null = null;
  let failed: Error | null = null;
  try {
    admin = client(await login(ADMIN, ADMIN_PASSWORD));
    await main(admin);
  } catch (e: any) {
    failed = e;
  }
  console.log('\nCleaning up test data…');
  const clean = await cleanup(admin);
  if (failed) {
    console.error('\nE2E FAILED:', failed.message);
    process.exit(1);
  }
  if (!clean) {
    console.error('\nE2E passed but cleanup was incomplete');
    process.exit(1);
  }
  console.log(`\nRABS journey PASSED (${step} checks), all test records removed`);
})().catch((e) => {
  console.error('\nE2E FAILED:', e.message);
  process.exit(1);
});
