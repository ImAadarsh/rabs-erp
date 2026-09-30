/**
 * Unit checks for RABS workflow calculations.
 * Usage: npx tsx src/scripts/testRabsCalc.ts   (or node dist/scripts/testRabsCalc.js)
 */
import assert from 'node:assert/strict';
import {
  ftInToMetres, metresToFtIn, roomDimensions, rollCutArea, productQuantity, accessoryQuantity,
  labourCharge, quoteTotals, depositRequired, balanceDue, addVat
} from '../services/rabs/rabsCalc.js';
import { deriveStatus, DEFAULT_STATUSES, PROGRESS_STEPS } from '../services/rabs/rabsWorkflow.js';

let passed = 0;
function t(name: string, fn: () => void) {
  try {
    fn();
    passed++;
    console.log('  ok  ', name);
  } catch (e) {
    console.error('  FAIL', name);
    throw e;
  }
}

t('ft/in → metres', () => {
  assert.equal(ftInToMetres(10, 0), 3.048);
  assert.equal(ftInToMetres(12, 6), 3.81);
  assert.equal(ftInToMetres(0, 6), 0.152);
  assert.throws(() => ftInToMetres(10, 12));
  assert.throws(() => ftInToMetres(-1, 0));
});

t('metres → ft/in', () => {
  assert.deepEqual(metresToFtIn(3.048), { ft: 10, inches: 0 });
  assert.deepEqual(metresToFtIn(3.81), { ft: 12, inches: 6 });
});

t('room m², sq yd, perimeter (Lounge 5×4)', () => {
  const d = roomDimensions(5, 4);
  assert.equal(d.areaM2, 20);
  assert.equal(d.areaSqyd, 23.92);
  assert.equal(d.perimeterM, 18);
  assert.throws(() => roomDimensions(0, 4));
  assert.throws(() => roomDimensions(101, 4));
});

t('room from ft/in (12ft 6in × 10ft)', () => {
  const d = roomDimensions(ftInToMetres(12, 6), ftInToMetres(10, 0));
  assert.equal(d.areaM2, 11.61);
  assert.equal(d.areaSqyd, 13.89);
});

t('roll cut area picks cheapest orientation', () => {
  // 5×4 room on 4m roll: 1 drop of 4m wide × 5m = 20 m²
  assert.equal(rollCutArea(5, 4, 4), 20);
  // 4×3 on 4m roll: 1 drop 4m × 3m = 12 m²
  assert.equal(rollCutArea(4, 3, 4), 12);
  // 6×4.5 on 4m roll: across 4.5 → 2 drops×4×6=48; across 6 → 2 drops×4×4.5=36 → 36
  assert.equal(rollCutArea(6, 4.5, 4), 36);
  // 3.5×2.5 on 5m roll → 1 drop 5×2.5 = 12.5
  assert.equal(rollCutArea(3.5, 2.5, 5), 12.5);
});

t('product qty: carpet per m² on roll with wastage', () => {
  const d = roomDimensions(5, 4);
  assert.equal(productQuantity({ calcMethod: 'per_m2', unit: 'm2', rollWidthM: 4, wastagePercent: 0 }, d), 20);
  assert.equal(productQuantity({ calcMethod: 'per_m2', unit: 'm2', rollWidthM: null, wastagePercent: 10 }, d), 22);
});

t('product qty: per sq yd', () => {
  const d = roomDimensions(5, 4);
  assert.equal(productQuantity({ calcMethod: 'per_sqyd', unit: 'sqyd', wastagePercent: 0 }, d), 23.92);
});

t('product qty: laminate packs (2.22 m²/pack, 10% waste)', () => {
  const d = roomDimensions(4, 3); // 12 m² × 1.1 = 13.2 / 2.22 = 5.95 → 6 packs
  assert.equal(productQuantity({ calcMethod: 'per_pack', unit: 'pack', packCoverageM2: 2.22, wastagePercent: 10 }, d), 6);
  assert.throws(() => productQuantity({ calcMethod: 'per_pack', unit: 'pack', packCoverageM2: 0 }, d));
});

t('accessory qty: underlay, gripper, door bar, adhesive pack', () => {
  const d = roomDimensions(5, 4);
  assert.equal(accessoryQuantity({ accessoryBasis: 'area', accessoryFactor: 1, unit: 'm2', wastagePercent: 5 }, d, 1), 21);
  assert.equal(accessoryQuantity({ accessoryBasis: 'perimeter', accessoryFactor: 1, unit: 'linear_m' }, d, 1), 18);
  assert.equal(accessoryQuantity({ accessoryBasis: 'door', accessoryFactor: 1, unit: 'item' }, d, 2), 2);
  assert.equal(accessoryQuantity({ accessoryBasis: 'area', accessoryFactor: 1, unit: 'pack', packCoverageM2: 15 }, d, 1), 2);
  assert.equal(accessoryQuantity({ accessoryBasis: 'each', accessoryFactor: 1, unit: 'item' }, d, 0), 1);
});

t('labour per m² and minimum charge', () => {
  const d = roomDimensions(5, 4);
  const l = labourCharge({ basis: 'per_m2', sellRate: 6, costRate: 4, minCharge: 50 }, d, 0);
  assert.equal(l.total, 120);
  assert.equal(l.cost, 80);
  const small = labourCharge({ basis: 'per_m2', sellRate: 6, costRate: 4, minCharge: 50 }, roomDimensions(2, 1.5), 0);
  assert.equal(small.total, 50);
  assert.equal(small.qty, 1);
  const stairs = labourCharge({ basis: 'per_stair', sellRate: 8, costRate: 5, minCharge: 0 }, d, 13);
  assert.equal(stairs.total, 104);
  const beds = labourCharge({ basis: 'per_item', sellRate: 30, costRate: 15, minCharge: 0 }, roomDimensions(1, 1), 0, 2);
  assert.equal(beds.total, 60);
});

t('quote totals: discount, delivery, VAT, margin', () => {
  const r = quoteTotals({
    lines: [
      { lineTotal: 500, lineCost: 300 },
      { lineTotal: 100, lineCost: 60 }
    ],
    discountType: 'percent',
    discountValue: 10,
    deliveryCharge: 25,
    vatRate: 0.2
  });
  assert.equal(r.subtotal, 600);
  assert.equal(r.discountAmount, 60);
  assert.equal(r.netTotal, 565);
  assert.equal(r.vatAmount, 113);
  assert.equal(r.total, 678);
  assert.equal(r.costTotal, 360);
  assert.equal(r.marginAmount, 180);
  assert.equal(r.marginPercent, 33.33);
  const fixed = quoteTotals({ lines: [{ lineTotal: 50, lineCost: 0 }], discountType: 'fixed', discountValue: 80, deliveryCharge: 0, vatRate: 0.2 });
  assert.equal(fixed.discountAmount, 50);
  assert.equal(fixed.total, 0);
  assert.throws(() => quoteTotals({ lines: [], discountType: 'percent', discountValue: 120, deliveryCharge: 0, vatRate: 0.2 }));
});

t('deposit rules and balance', () => {
  assert.equal(depositRequired(678, { depositMode: 'percent', depositPercent: 25, depositFixedAmount: 0, depositMinAmount: 0 }), 169.5);
  assert.equal(depositRequired(200, { depositMode: 'percent', depositPercent: 25, depositFixedAmount: 0, depositMinAmount: 100 }), 100);
  assert.equal(depositRequired(80, { depositMode: 'fixed', depositPercent: 0, depositFixedAmount: 100, depositMinAmount: 0 }), 80);
  assert.equal(depositRequired(500, { depositMode: 'none', depositPercent: 25, depositFixedAmount: 0, depositMinAmount: 0 }), 0);
  assert.equal(balanceDue(678, 169.5), 508.5);
  assert.equal(balanceDue(678, 700), 0);
  assert.deepEqual(addVat(100, 0.2), { net: 100, vat: 20, gross: 120 });
});

t('workflow status derivation', () => {
  const base = {
    closed: false, hasIssue: false, converted: false, acceptedQuote: false, quoteStatus: null as string | null,
    hasMeasurement: false, hasAppointment: false, depositRequired: 0, paid: 0, balance: 0,
    materialsStatus: 'not_checked', requiresFitting: true, requiresDelivery: false,
    fitting: null as any, delivery: null as any, invoiceIssued: false, autoClose: false, today: '2026-09-30'
  };
  assert.equal(deriveStatus(base), 'NEW');
  assert.equal(deriveStatus({ ...base, hasAppointment: true }), 'APPOINTMENT');
  assert.equal(deriveStatus({ ...base, hasMeasurement: true }), 'MEASUREMENT');
  assert.equal(deriveStatus({ ...base, quoteStatus: 'draft' }), 'QUOTE_DRAFT');
  assert.equal(deriveStatus({ ...base, quoteStatus: 'sent' }), 'QUOTE_SENT');
  const acc = { ...base, acceptedQuote: true, quoteStatus: 'accepted' };
  assert.equal(deriveStatus(acc), 'ACCEPTED');
  const conv = { ...acc, converted: true, depositRequired: 100, balance: 400 };
  assert.equal(deriveStatus(conv), 'DEPOSIT_PENDING');
  const dep = { ...conv, paid: 100, balance: 300 };
  assert.equal(deriveStatus(dep), 'CONFIRMED');
  assert.equal(deriveStatus({ ...dep, materialsStatus: 'pending' }), 'MATERIALS_PENDING');
  const ready = { ...dep, materialsStatus: 'ready' };
  assert.equal(deriveStatus(ready), 'READY_TO_FIT');
  assert.equal(deriveStatus({ ...ready, fitting: { status: 'booked', date: '2026-10-02' } }), 'FITTING_BOOKED');
  assert.equal(deriveStatus({ ...ready, fitting: { status: 'booked', date: '2026-09-30' } }), 'FITTING_TODAY');
  assert.equal(deriveStatus({ ...ready, requiresFitting: false, requiresDelivery: true }), 'DELIVERY_REQUIRED');
  assert.equal(deriveStatus({ ...ready, requiresFitting: false, requiresDelivery: true, delivery: { status: 'booked', date: '2026-10-02' } }), 'DELIVERY_BOOKED');
  const done = { ...ready, fitting: { status: 'complete', date: '2026-09-29' } };
  assert.equal(deriveStatus(done), 'FITTING_COMPLETE');
  assert.equal(deriveStatus({ ...ready, requiresFitting: false, requiresDelivery: true, delivery: { status: 'complete', date: '2026-09-29' } }), 'DELIVERY_COMPLETE');
  assert.equal(deriveStatus({ ...done, invoiceIssued: true }), 'BALANCE_PENDING');
  assert.equal(deriveStatus({ ...done, invoiceIssued: true, paid: 400, balance: 0 }), 'FULLY_PAID');
  assert.equal(deriveStatus({ ...done, invoiceIssued: true, paid: 400, balance: 0, autoClose: true }), 'CLOSED');
  assert.equal(deriveStatus({ ...done, hasIssue: true }), 'ISSUE');
  assert.equal(deriveStatus({ ...done, closed: true }), 'CLOSED');
});

t('awkward input: 12ft 11in, 11.99in, zero, NaN, huge', () => {
  assert.equal(ftInToMetres(12, 11), 3.937);
  assert.equal(ftInToMetres(0, 11.99), 0.305);
  assert.throws(() => ftInToMetres(Number.NaN, 0));
  assert.throws(() => ftInToMetres(10, Number.NaN));
  assert.throws(() => roomDimensions(Number.NaN, 4));
  assert.throws(() => roomDimensions(4, 0));
  assert.throws(() => roomDimensions(-3, 4));
  assert.throws(() => roomDimensions(4, 1e9));
  const d = roomDimensions(ftInToMetres(12, 11), ftInToMetres(9, 3));
  assert.equal(d.areaM2, 11.1);
  assert.equal(d.areaSqyd, 13.27);
});

t('deposit rule changes apply to the amount, VAT is per quote', () => {
  const s = { depositMode: 'percent', depositPercent: 30, depositFixedAmount: 0, depositMinAmount: 0 } as const;
  assert.equal(depositRequired(1238.06, s), 371.42);
  assert.equal(depositRequired(1238.06, { ...s, depositPercent: 25 }), 309.52);
  const at20 = quoteTotals({ lines: [{ lineTotal: 100, lineCost: 0 }], discountType: 'none', discountValue: 0, deliveryCharge: 0, vatRate: 0.2 });
  const at0 = quoteTotals({ lines: [{ lineTotal: 100, lineCost: 0 }], discountType: 'none', discountValue: 0, deliveryCharge: 0, vatRate: 0 });
  assert.equal(at20.total, 120);
  assert.equal(at0.total, 100);
});

t('part / over payment balances', () => {
  assert.equal(balanceDue(1238.06, 309.52), 928.54);
  assert.equal(balanceDue(1238.06, 309.52 + 500), 428.54);
  assert.equal(balanceDue(1238.06, 1238.06), 0);
  assert.equal(balanceDue(1238.06, 2000), 0);
});

t('progress bar labels match the spec exactly', () => {
  assert.equal(
    PROGRESS_STEPS.map((s) => s.label).join(' → '),
    'APPOINTMENT → MEASURE → QUOTE → ACCEPTED → DEPOSIT → MATERIAL → FITTING/DELIVERY → COMPLETE → BALANCE → CLOSED'
  );
});

t('status colours match the spec', () => {
  const c = Object.fromEntries(DEFAULT_STATUSES.map((s) => [s.code, s.color.toUpperCase()]));
  const want: Record<string, string> = {
    NEW: '#6B7280', APPOINTMENT: '#2563EB', MEASUREMENT: '#7C3AED', QUOTE_DRAFT: '#D1D5DB', QUOTE_SENT: '#F59E0B', ACCEPTED: '#16A34A',
    DEPOSIT_PENDING: '#EA580C', CONFIRMED: '#0D9488', MATERIALS_PENDING: '#DC2626', READY_TO_FIT: '#0E9F9A', FITTING_BOOKED: '#2563EB',
    FITTING_TODAY: '#FACC15', FITTING_COMPLETE: '#16A34A', DELIVERY_BOOKED: '#2563EB', DELIVERY_COMPLETE: '#16A34A', BALANCE_PENDING: '#EA580C',
    FULLY_PAID: '#166534', ISSUE: '#DC2626', CLOSED: '#111111'
  };
  for (const [k, v] of Object.entries(want)) assert.equal(c[k], v, k);
});

t('next-step buttons match the spec table', () => {
  const n = Object.fromEntries(DEFAULT_STATUSES.map((s) => [s.code, s.nextActionLabel]));
  assert.equal(n.APPOINTMENT, 'START MEASUREMENT');
  assert.equal(n.MEASUREMENT, 'CREATE QUOTATION');
  assert.equal(n.QUOTE_SENT, 'ACCEPT & CREATE JOB');
  assert.equal(n.CONFIRMED, 'CHECK MATERIALS');
  assert.equal(n.READY_TO_FIT, 'BOOK FITTING');
  assert.equal(n.DELIVERY_REQUIRED, 'BOOK DELIVERY');
  assert.equal(n.FITTING_COMPLETE, 'COLLECT BALANCE');
  assert.equal(n.FULLY_PAID, 'CLOSE JOB');
});

t('fitting date drives Fitting Today / Booked', () => {
  const ready = {
    closed: false, hasIssue: false, converted: true, acceptedQuote: true, quoteStatus: 'accepted', hasMeasurement: true, hasAppointment: true,
    depositRequired: 0, paid: 0, balance: 100, materialsStatus: 'ready', requiresFitting: true, requiresDelivery: false,
    fitting: { status: 'booked', date: '2026-10-01' }, delivery: null, invoiceIssued: false, autoClose: false, today: '2026-09-30'
  };
  assert.equal(deriveStatus(ready), 'FITTING_BOOKED');
  assert.equal(deriveStatus({ ...ready, today: '2026-10-01' }), 'FITTING_TODAY');
  assert.equal(deriveStatus({ ...ready, fitting: { status: 'in_progress', date: '2026-10-01' }, today: '2026-10-01' }), 'FITTING_TODAY');
});

console.log(`\n${passed} calculation/workflow checks passed.`);
