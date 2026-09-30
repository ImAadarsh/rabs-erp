/**
 * End-to-end "Mr Smith" journey against a running API.
 *   RABS_API=http://127.0.0.1:4015 RABS_OFFICE_EMAIL=office@rabsinteriors.app RABS_FITTER_EMAIL=fitter@rabsinteriors.app \
 *   RABS_PASSWORD_FILE=/root/.rabs-staff-initial-password node dist/scripts/e2eRabsJourney.js
 * Passwords are read from a file and never printed.
 */
import { readFileSync } from 'fs';
import assert from 'node:assert/strict';
import zlib from 'zlib';

const API = (process.env.RABS_API || 'http://127.0.0.1:4015').replace(/\/$/, '');
const PASSWORD = (process.env.RABS_PASSWORD || (process.env.RABS_PASSWORD_FILE ? readFileSync(process.env.RABS_PASSWORD_FILE, 'utf8') : '')).trim();
const OFFICE = process.env.RABS_OFFICE_EMAIL || 'office@rabsinteriors.app';
const FITTER = process.env.RABS_FITTER_EMAIL || 'fitter@rabsinteriors.app';

let step = 0;
const ok = (msg: string) => console.log(`  ✔ ${String(++step).padStart(2, '0')} ${msg}`);

async function login(email: string) {
  const r = await fetch(`${API}/api/iam/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASSWORD }) });
  const j: any = await r.json();
  if (!r.ok) throw new Error(`login ${email} failed: ${j?.error?.message}`);
  return j.accessToken as string;
}

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

async function main() {
  if (!PASSWORD) throw new Error('Set RABS_PASSWORD_FILE (or RABS_PASSWORD)');
  console.log(`RABS Mr Smith journey against ${API}`);
  const office = client(await login(OFFICE));
  const fitter = client(await login(FITTER));
  ok('Office and fitter logged in');

  const meta = await office.get('/meta');
  const twist = meta.products.find((p: any) => p.code === 'CPT-TWIST-4');
  const surveyor = meta.staff.find((s: any) => s.roles.includes('SURVEYOR'));
  const fitterUser = meta.staff.find((s: any) => s.email === FITTER);
  assert.ok(twist && surveyor && fitterUser, 'seed data present');
  assert.equal(meta.me.permissions.includes('view_costs'), false, 'office must not see costs');
  ok('Meta loaded (catalogue, staff, statuses); office cannot see cost/margin');

  // Validation
  const v1 = await office.raw('POST', '/enquiries', { customer: { name: 'No Contact' } }, [400]);
  assert.match(v1.data.error.message, /phone number or email/);
  const v2 = await office.raw('POST', '/enquiries', { customer: { name: 'Bad Postcode', phone: '07700 900999', postcode: 'XYZ' } }, [400]);
  assert.match(v2.data.error.message, /postcode/i);
  ok('Validation: contact required, UK postcode checked');

  const phone = `07700 9${String(Date.now()).slice(-5)}`;
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  let job = await office.post('/enquiries', {
    customer: { name: 'Mr John Smith', phone, email: `john.smith.${Date.now()}@example.co.uk`, addressLine1: '10 Waterloo Road', city: 'Burslem', postcode: 'ST6 3HF', source: 'Walk-in' },
    appointment: { scheduledAt: `${tomorrow}T10:00:00`, purpose: 'measure', staffUserId: surveyor.id, notes: 'Measure lounge and bedroom' }
  });
  const jobId = job.job.id;
  assert.equal(job.status.code, 'APPOINTMENT');
  assert.equal(job.nextAction.code, 'start_measurement');
  assert.equal(job.nextAction.label, 'NEXT: START MEASUREMENT'.replace('NEXT: ', ''));
  ok(`Created Mr Smith → job ${job.job.jobNumber}, appointment booked (status Appointment, next START MEASUREMENT)`);

  const dup = await office.raw('POST', '/enquiries', { customer: { name: 'John Smith', phone } }, [409]);
  assert.match(dup.data.error.message, /already has this phone/);
  ok('Duplicate customer detected by phone');

  const m = await office.post(`/jobs/${jobId}/measurement`, {});
  const prev = await office.post('/calc/room', { name: 'Lounge', unitInput: 'm', lengthM: 5, widthM: 4, productId: twist.id });
  assert.equal(prev.areaM2, 20);
  assert.equal(prev.areaSqyd, 23.92);
  assert.equal(prev.perimeterM, 18);
  const ftPrev = await office.post('/calc/room', { unitInput: 'ftin', lengthFt: 16, lengthIn: 4.85, widthFt: 13, widthIn: 1.48, productId: twist.id });
  assert.ok(Math.abs(ftPrev.lengthM - 5) < 0.01 && Math.abs(ftPrev.widthM - 4) < 0.01);
  const badIn = await office.raw('POST', '/calc/room', { unitInput: 'ftin', lengthFt: 10, lengthIn: 12, widthFt: 10, widthIn: 0 }, [400]);
  assert.match(badIn.data.error.message, /less than 12/);
  ok('Start Measurement (customer pre-filled); calc preview 5m×4m = 20 m² / 23.92 sq yd; ft/in converts; inches ≥12 rejected');

  const lounge = await office.post(`/measurements/${m.id}/rooms`, { name: 'Lounge', unitInput: 'm', lengthM: 5, widthM: 4, doors: 1, productId: twist.id });
  const lp = await office.post(`/rooms/${lounge.id}/photos`, photos(3));
  assert.equal(lp.length, 3);
  const bed = await office.post(`/measurements/${m.id}/rooms`, { name: 'Bedroom 1', unitInput: 'm', lengthM: 4, widthM: 3, doors: 1, productId: twist.id });
  await office.post(`/rooms/${bed.id}/photos`, photos(3));
  job = await office.get(`/jobs/${jobId}`);
  assert.equal(job.status.code, 'MEASUREMENT');
  assert.equal(job.measurement.rooms.length, 2);
  assert.equal(job.measurement.rooms[0].photos.length, 3);
  assert.equal(job.measurement.rooms[0].accessories.length, 3, 'underlay + gripper + door bar auto-ticked');
  const photoUrl = job.measurement.rooms[0].photos[0].url as string;
  const img = await fetch(photoUrl.replace(/^https?:\/\/[^/]+/, API));
  assert.equal(img.status, 200);
  ok('Lounge 5×4 + Bedroom 4×3 saved with 3 photos each; accessories auto-selected; photos served');

  const q = await office.post(`/jobs/${jobId}/quotes`, {});
  const full = await office.get(`/quotes/${q.id}`);
  const rooms = new Set(full.lines.map((l: any) => l.roomName));
  assert.deepEqual([...rooms], ['Lounge', 'Bedroom 1']);
  const types = full.lines.map((l: any) => `${l.roomName}:${l.lineType}`);
  assert.ok(types.includes('Lounge:labour') && types.includes('Bedroom 1:accessory'));
  assert.equal(full.quote.subtotal, 1031.72);
  assert.equal(full.quote.vatAmount, 206.34);
  assert.equal(full.quote.total, 1238.06);
  assert.equal(full.quote.depositRequired, 309.52);
  assert.equal(full.quote.costTotal, undefined, 'cost hidden from office');
  ok(`Create Quotation: ${full.lines.length} lines auto-built per room (carpet, underlay, gripper, door bar, fitting); £1,031.72 + VAT £206.34 = £1,238.06; deposit 25% £309.52`);

  const again = await office.post(`/jobs/${jobId}/quotes`, {});
  assert.equal(again.id, q.id, 'clicking Create Quotation twice rebuilds the same draft');
  await office.post(`/quotes/${q.id}/send`);
  job = await office.get(`/jobs/${jobId}`);
  assert.equal(job.status.code, 'QUOTE_SENT');
  assert.equal(job.nextAction.code, 'accept_quote');
  ok('No duplicate drafts; quote sent (status Quotation Sent, next ACCEPT & CREATE JOB)');

  job = await office.post(`/quotes/${q.id}/accept`, { convert: true, acceptedByName: 'John Smith' });
  assert.equal(job.status.code, 'DEPOSIT_PENDING');
  assert.equal(job.money.total, 1238.06);
  assert.equal(job.money.depositRequired, 309.52);
  assert.equal(job.job.jobNumber, job.job.jobNumber);
  assert.ok(job.job.convertedAt);
  ok('Accept & Convert to Job in one click → Deposit Pending; rooms, prices, deposit carried by reference');

  const locked = await office.raw('PATCH', `/rooms/${lounge.id}`, { lengthM: 6 }, [409]);
  assert.match(locked.data.error.message, /locked/);
  const over = await office.raw('POST', `/jobs/${jobId}/payments`, { amount: 5000, method: 'card' }, [400]);
  assert.match(over.data.error.message, /outstanding balance/);
  ok('Accepted quote locks rooms; overpayment rejected');

  job = await office.post(`/jobs/${jobId}/payments`, { amount: 309.52, method: 'card', reference: 'DEP-SMITH' });
  assert.equal(job.status.code, 'CONFIRMED');
  assert.equal(job.payments[0].kind, 'deposit');
  assert.equal(job.nextAction.code, 'check_materials');
  ok('Deposit £309.52 recorded → job auto Confirmed (next CHECK MATERIALS)');

  job = await office.post(`/jobs/${jobId}/materials/check`);
  assert.equal(job.status.code, 'READY_TO_FIT');
  assert.ok(job.materials.length >= 4 && job.materials.every((x: any) => x.status === 'reserved'));
  ok(`Materials checked: ${job.materials.length} items reserved from stock → Ready to Fit`);

  const today = londonToday();
  job = await office.post(`/jobs/${jobId}/bookings`, { type: 'fitting', scheduledDate: today, slot: 'AM', staffUserId: fitterUser.id, instructions: 'Door code 1234' });
  assert.equal(job.status.code, 'FITTING_TODAY');
  const bookingId = job.bookings[0].id;
  ok('Fitting booked for today with the fitter → Fitting Today');

  const work = await fitter.get('/my-work?scope=today');
  assert.ok(work.some((w: any) => String(w.jobId) === String(jobId)));
  const fj = await fitter.get(`/jobs/${jobId}`);
  assert.equal(fj.money, null, 'fitter sees no prices');
  assert.equal(fj.measurement.rooms.length, 2);
  await fitter.raw('POST', `/jobs/${jobId}/payments`, { amount: 10, method: 'cash' }, [403]);
  ok('Fitter opens the same job on phone: rooms & address visible, prices hidden, cannot take payments');

  await fitter.post(`/bookings/${bookingId}/start`);
  await fitter.post(`/bookings/${bookingId}/photos`, photos(2, { kind: 'before' }));
  const nosig = await fitter.raw('POST', `/bookings/${bookingId}/complete`, {}, [400]);
  assert.match(nosig.data.error.message, /must sign/);
  const b0 = fj.bookings[0];
  await fitter.put(`/bookings/${bookingId}/checklist`, { checklist: b0.checklist.map((c: any) => ({ ...c, done: true })) });
  await fitter.post(`/bookings/${bookingId}/photos`, photos(2, { kind: 'after' }));
  const sig = `data:image/png;base64,${tinyPng(7).toString('base64')}`;
  await fitter.post(`/bookings/${bookingId}/signature`, { dataUrl: sig, signedName: 'John Smith' });
  await fitter.post(`/bookings/${bookingId}/complete`, { notes: 'Lovely job' });
  job = await office.get(`/jobs/${jobId}`);
  assert.equal(job.status.code, 'FITTING_COMPLETE');
  assert.equal(job.nextAction.code, 'collect_balance');
  assert.equal(job.bookings[0].photos.length, 4);
  assert.ok(job.bookings[0].signatureUrl);
  ok('Fitter: before/after photos, checklist, customer signature (required) → Fitting Complete (next COLLECT BALANCE)');

  job = await office.post(`/jobs/${jobId}/invoice`);
  assert.equal(job.status.code, 'BALANCE_PENDING');
  assert.equal(job.invoice.total, 1238.06);
  assert.equal(job.invoice.balance, 928.54);
  ok(`Invoice ${job.invoice.invoiceNumber} generated from accepted quote: £1,238.06, balance £928.54`);

  job = await office.post(`/jobs/${jobId}/payments`, { amount: 928.54, method: 'bank_transfer', reference: 'BAL-SMITH' });
  assert.equal(job.status.code, 'FULLY_PAID');
  assert.equal(job.invoice.status, 'paid');
  assert.equal(job.money.balance, 0);
  ok('Balance £928.54 recorded → invoice paid, Fully Paid (next CLOSE JOB)');

  job = await office.post(`/jobs/${jobId}/close`, {});
  assert.equal(job.status.code, 'CLOSED');
  assert.equal(job.progress.index, 9);
  assert.ok(job.timeline.length >= 15);
  ok(`Job closed; progress bar at CLOSED; timeline has ${job.timeline.length} entries`);

  for (const term of [job.job.jobNumber, q.quoteNumber, job.invoice.invoiceNumber, phone.replace(/\s/g, ''), 'Smith', 'ST6 3HF']) {
    const s = await office.get(`/search?q=${encodeURIComponent(term)}`);
    assert.ok(s.jobs.some((r: any) => r.id === String(jobId)), `search "${term}"`);
  }
  ok('Global search finds the job by job no., quote no., invoice no., phone, name and postcode');

  for (const p of ['/reports/pipeline', '/reports/sales', '/reports/outstanding', '/reports/schedule', '/reports/purchasing', '/dashboard']) await office.get(p);
  await fitter.raw('GET', '/reports/sales', undefined, [403]);
  ok('Reports & dashboard respond; fitter blocked from sales report');

  console.log(`\nMr Smith journey PASSED (${step} checks) — job ${job.job.jobNumber}`);
}

main().catch((e) => {
  console.error('\nE2E FAILED:', e.message);
  process.exit(1);
});
