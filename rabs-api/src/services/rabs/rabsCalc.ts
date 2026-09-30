/** Pure calculation helpers for the RABS workflow. No DB access — unit-tested by scripts/testRabsCalc.ts. */

export const M2_TO_SQYD = 1.19599005;
export const INCH_M = 0.0254;

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const round3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;

export function ftInToMetres(ft: number, inches: number): number {
  if (!Number.isFinite(ft) || !Number.isFinite(inches) || ft < 0 || inches < 0) throw new Error('Feet and inches must be positive numbers');
  if (inches >= 12) throw new Error('Inches must be less than 12');
  return round3((ft * 12 + inches) * INCH_M);
}

export function metresToFtIn(m: number): { ft: number; inches: number } {
  const totalIn = m / INCH_M;
  let ft = Math.floor(totalIn / 12);
  let inches = round2(totalIn - ft * 12);
  if (inches >= 12) {
    ft += 1;
    inches = 0;
  }
  return { ft, inches };
}

export interface RoomDims {
  lengthM: number;
  widthM: number;
  areaM2: number;
  areaSqyd: number;
  perimeterM: number;
}

export function roomDimensions(lengthM: number, widthM: number): RoomDims {
  if (!(lengthM > 0) || !(widthM > 0)) throw new Error('Length and width must be greater than 0');
  if (lengthM > 100 || widthM > 100) throw new Error('Length and width must be 100 m or less');
  const areaM2 = round2(lengthM * widthM);
  return {
    lengthM: round3(lengthM),
    widthM: round3(widthM),
    areaM2,
    areaSqyd: round2(lengthM * widthM * M2_TO_SQYD),
    perimeterM: round2(2 * (lengthM + widthM))
  };
}

export interface ProductCalcInput {
  calcMethod: string;
  unit: string;
  rollWidthM?: number | null;
  packCoverageM2?: number | null;
  wastagePercent?: number | null;
}

/**
 * Material cut from a roll: drops run along one side; each drop is roll-width wide.
 * Picks the orientation that uses the least material.
 */
export function rollCutArea(lengthM: number, widthM: number, rollWidthM: number): number {
  const along = (run: number, across: number) => Math.ceil(round3(across / rollWidthM)) * rollWidthM * run;
  return round2(Math.min(along(lengthM, widthM), along(widthM, lengthM)));
}

/** Quantity of the main product needed for a room, in the product's selling unit. */
export function productQuantity(p: ProductCalcInput, dims: RoomDims): number {
  const waste = 1 + Math.max(0, Number(p.wastagePercent || 0)) / 100;
  switch (p.calcMethod) {
    case 'per_m2': {
      const base = p.rollWidthM && p.rollWidthM > 0 ? rollCutArea(dims.lengthM, dims.widthM, p.rollWidthM) : dims.areaM2;
      return round2(base * waste);
    }
    case 'per_sqyd': {
      const baseM2 = p.rollWidthM && p.rollWidthM > 0 ? rollCutArea(dims.lengthM, dims.widthM, p.rollWidthM) : dims.lengthM * dims.widthM;
      return round2(baseM2 * M2_TO_SQYD * waste);
    }
    case 'per_pack': {
      const cov = Number(p.packCoverageM2 || 0);
      if (!(cov > 0)) throw new Error('Pack coverage (m²) is required for pack-priced products');
      return Math.ceil(round3((dims.areaM2 * waste) / cov));
    }
    case 'per_linear_m':
      return round2(dims.perimeterM * waste);
    case 'per_item':
    default:
      return 1;
  }
}

export interface AccessoryCalcInput {
  accessoryBasis: 'area' | 'perimeter' | 'door' | 'each' | null;
  accessoryFactor: number | null;
  unit: string;
  packCoverageM2?: number | null;
  wastagePercent?: number | null;
}

/** Suggested accessory quantity for a room (e.g. underlay per m², gripper per perimeter, door bar per door). */
export function accessoryQuantity(a: AccessoryCalcInput, dims: RoomDims, doors: number): number {
  const factor = a.accessoryFactor ?? 1;
  const waste = 1 + Math.max(0, Number(a.wastagePercent || 0)) / 100;
  let raw: number;
  switch (a.accessoryBasis) {
    case 'area':
      raw = dims.areaM2 * factor * waste;
      break;
    case 'perimeter':
      raw = dims.perimeterM * factor * waste;
      break;
    case 'door':
      raw = Math.max(0, doors) * factor;
      break;
    default:
      raw = factor;
  }
  if (a.unit === 'pack' && a.packCoverageM2 && a.packCoverageM2 > 0) return Math.ceil(round3(raw / a.packCoverageM2));
  if (a.unit === 'item' || a.unit === 'pack' || a.unit === 'roll') return Math.ceil(round3(raw));
  return round2(raw);
}

export interface LabourRuleInput {
  basis: string;
  sellRate: number;
  costRate: number;
  minCharge: number;
}

export function labourQuantity(basis: string, dims: RoomDims, stairs: number, items = 1): { qty: number; unit: string } {
  switch (basis) {
    case 'per_m2':
      return { qty: dims.areaM2, unit: 'm2' };
    case 'per_sqyd':
      return { qty: dims.areaSqyd, unit: 'sqyd' };
    case 'per_stair':
      return { qty: Math.max(0, stairs), unit: 'stair' };
    case 'per_item':
      return { qty: Math.max(1, items), unit: 'item' };
    case 'per_room':
    case 'fixed':
    default:
      return { qty: 1, unit: 'item' };
  }
}

/** Labour line totals, applying the rule's minimum charge. */
export function labourCharge(rule: LabourRuleInput, dims: RoomDims, stairs: number, items = 1) {
  const { qty, unit } = labourQuantity(rule.basis, dims, stairs, items);
  let total = round2(qty * rule.sellRate);
  let cost = round2(qty * rule.costRate);
  let unitPrice = rule.sellRate;
  let unitCost = rule.costRate;
  let displayQty = qty;
  let displayUnit = unit;
  if (rule.minCharge > 0 && total < rule.minCharge) {
    const ratio = total > 0 ? cost / total : 0;
    total = round2(rule.minCharge);
    cost = round2(total * ratio);
    displayQty = 1;
    displayUnit = 'item';
    unitPrice = total;
    unitCost = cost;
  }
  return { qty: displayQty, unit: displayUnit, unitPrice, unitCost, total, cost };
}

export interface TotalsInput {
  lines: Array<{ lineTotal: number; lineCost: number }>;
  discountType: 'none' | 'percent' | 'fixed';
  discountValue: number;
  deliveryCharge: number;
  vatRate: number;
}

export function quoteTotals(t: TotalsInput) {
  const subtotal = round2(t.lines.reduce((s, l) => s + Number(l.lineTotal || 0), 0));
  const costTotal = round2(t.lines.reduce((s, l) => s + Number(l.lineCost || 0), 0));
  let discountAmount = 0;
  if (t.discountType === 'percent') {
    if (t.discountValue < 0 || t.discountValue > 100) throw new Error('Discount % must be between 0 and 100');
    discountAmount = round2((subtotal * t.discountValue) / 100);
  } else if (t.discountType === 'fixed') {
    if (t.discountValue < 0) throw new Error('Discount cannot be negative');
    discountAmount = round2(Math.min(t.discountValue, subtotal));
  }
  const delivery = round2(Math.max(0, t.deliveryCharge || 0));
  const netTotal = round2(subtotal - discountAmount + delivery);
  const vatAmount = round2(netTotal * t.vatRate);
  const total = round2(netTotal + vatAmount);
  const marginAmount = round2(netTotal - delivery - costTotal);
  const salesNet = netTotal - delivery;
  const marginPercent = salesNet > 0 ? round2((marginAmount / salesNet) * 100) : 0;
  return { subtotal, discountAmount, deliveryCharge: delivery, netTotal, vatAmount, total, costTotal, marginAmount, marginPercent };
}

export interface DepositRule {
  depositMode: 'percent' | 'fixed' | 'none';
  depositPercent: number;
  depositFixedAmount: number;
  depositMinAmount: number;
}

export function depositRequired(total: number, rule: DepositRule): number {
  if (total <= 0 || rule.depositMode === 'none') return 0;
  let d = rule.depositMode === 'fixed' ? rule.depositFixedAmount : (total * rule.depositPercent) / 100;
  d = Math.max(d, rule.depositMinAmount || 0);
  return round2(Math.min(d, total));
}

export function balanceDue(total: number, paid: number): number {
  return round2(Math.max(0, total - paid));
}

/** VAT split for a gross/net amount. */
export function addVat(net: number, rate: number) {
  const vat = round2(net * rate);
  return { net: round2(net), vat, gross: round2(net + vat) };
}
