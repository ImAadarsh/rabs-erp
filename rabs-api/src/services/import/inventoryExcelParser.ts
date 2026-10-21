/**
 * Parse RABS inventory seed Excel (.xlsx) into structured product rows.
 * Expected headers match "Inventory sheet updated *.xlsx".
 */

import * as XLSX from 'xlsx';

export interface InventorySheetRow {
  sku: string;
  barcode?: string;
  name: string;
  description?: string;
  category?: string;
  subCategory?: string;
  brand?: string;
  uom?: string;
  packSize?: string;
  openingQuantity?: number;
  reorderLevel?: number;
  reorderQuantity?: number;
  costPrice?: number;
  sellingPrice?: number;
  taxPercent?: number;
  warehouseName?: string;
  binCode?: string;
  supplierName?: string;
  supplierSku?: string;
  leadTimeDays?: number;
  lotNumber?: string;
  expiryDate?: string | null;
  status: 'active' | 'inactive' | 'discontinued';
  dateAdded?: string | null;
  remarks?: string;
  rowNumber: number;
}

export interface InventorySheetPreview {
  rowCount: number;
  sample: InventorySheetRow[];
  categories: string[];
  warehouses: string[];
  suppliers: string[];
  warnings: string[];
  warningCount: number;
}

const HEADER_ALIASES: Record<keyof Omit<InventorySheetRow, 'rowNumber' | 'status'>, string[]> = {
  sku: ['sku / item code', 'sku', 'item code'],
  barcode: ['barcode / upc', 'barcode', 'upc'],
  name: ['product name', 'name'],
  description: ['description'],
  category: ['category'],
  subCategory: ['sub-category', 'sub category', 'subcategory'],
  brand: ['brand / manufacturer', 'brand', 'manufacturer'],
  uom: ['unit of measure (uom)', 'unit of measure', 'uom'],
  packSize: ['pack size'],
  openingQuantity: ['opening quantity', 'opening qty', 'qty'],
  reorderLevel: ['reorder level'],
  reorderQuantity: ['reorder quantity', 'reorder qty'],
  costPrice: ['unit cost price', 'cost price', 'cost'],
  sellingPrice: ['unit selling price', 'selling price', 'price'],
  taxPercent: ['tax / gst %', 'tax / gst', 'tax %', 'gst %', 'tax'],
  warehouseName: ['warehouse / location', 'warehouse', 'location'],
  binCode: ['bin / rack no.', 'bin / rack no', 'bin', 'rack no', 'rack'],
  supplierName: ['supplier name', 'supplier'],
  supplierSku: ['supplier sku'],
  leadTimeDays: ['lead time (days)', 'lead time'],
  lotNumber: ['batch / lot no.', 'batch / lot no', 'batch', 'lot no', 'lot'],
  expiryDate: ['expiry date', 'expiry'],
  dateAdded: ['date added'],
  remarks: ['remarks', 'notes']
};

function normHeader(h: unknown): string {
  return String(h ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ');
}

function buildHeaderMap(headers: string[]): Map<string, number> {
  const map = new Map<string, number>();
  const normalized = headers.map(normHeader);

  for (const [field, aliases] of Object.entries(HEADER_ALIASES)) {
    const idx = normalized.findIndex((h) => aliases.includes(h));
    if (idx >= 0) map.set(field, idx);
  }
  return map;
}

function cellStr(row: unknown[], idx: number | undefined): string {
  if (idx == null || idx < 0) return '';
  const v = row[idx];
  if (v == null || v === '') return '';
  return String(v).trim();
}

function cellNum(row: unknown[], idx: number | undefined): number | undefined {
  const s = cellStr(row, idx);
  if (!s) return undefined;
  const n = Number(String(s).replace(/,/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export type SheetDateResult = { iso: string | null; error?: string };

const MONTH_NAMES = [
  'january', 'february', 'march', 'april', 'may', 'june',
  'july', 'august', 'september', 'october', 'november', 'december'
];

function monthFromName(name: string): number | null {
  const key = name.toLowerCase();
  const idx = MONTH_NAMES.findIndex((m) => m.startsWith(key));
  return idx >= 0 ? idx + 1 : null;
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function expandYear(y: string): number {
  const n = Number(y);
  if (y.length !== 2) return n;
  return n < 70 ? 2000 + n : 1900 + n;
}

function toIso(year: number, month: number, day: number): string | null {
  if (!Number.isInteger(year) || year < 1900 || year > 2200) return null;
  if (!Number.isInteger(month) || month < 1 || month > 12) return null;
  if (!Number.isInteger(day) || day < 1 || day > daysInMonth(year, month)) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/**
 * Parse a date cell. Text dates are UK day-first (dd/mm/yyyy, dd-mm-yy, dd.mm.yyyy, 7 Oct 2026)
 * or ISO yyyy-mm-dd; mm/yyyy means the last day of that month. Numbers are Excel serials.
 * Impossible dates (31/02/2026) return an error instead of rolling over.
 */
export function parseSheetDate(value: unknown): SheetDateResult {
  if (value == null || value === '') return { iso: null };

  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return { iso: null, error: 'is not a valid date' };
    // SheetJS builds date cells at local midnight, so read local parts (toISOString shifts the day east of UTC).
    return { iso: toIso(value.getFullYear(), value.getMonth() + 1, value.getDate()) };
  }

  const s = String(value).trim();
  if (!s) return { iso: null };

  if (typeof value === 'number' || /^\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    if (n > 20000 && n < 80000) {
      // Excel serial date (days since 1899-12-30); the fraction is the time of day.
      const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(n) * 86400000);
      return { iso: toIso(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate()) };
    }
    return { iso: null, error: 'is not a recognised date (use dd/mm/yyyy)' };
  }

  const timeSuffix = '(?:[T\\s]+\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?\\s*(?:[aApP][mM]|Z|[+-]\\d{2}:?\\d{2})?)?';
  let m: RegExpMatchArray | null;
  let iso: string | null = null;
  let matched = true;

  if ((m = s.match(new RegExp(`^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})${timeSuffix}$`)))) {
    iso = toIso(Number(m[1]), Number(m[2]), Number(m[3]));
  } else if ((m = s.match(new RegExp(`^(\\d{1,2})[-/.](\\d{1,2})[-/.](\\d{4}|\\d{2})${timeSuffix}$`)))) {
    iso = toIso(expandYear(m[3]!), Number(m[2]), Number(m[1]));
  } else if ((m = s.match(/^(\d{1,2})[-/.](\d{4})$/))) {
    const year = Number(m[2]);
    const month = Number(m[1]);
    iso = month >= 1 && month <= 12 ? toIso(year, month, daysInMonth(year, month)) : null;
  } else if ((m = s.match(/^(\d{1,2})(?:st|nd|rd|th)?[\s\-/.]+([A-Za-z]{3,9})[\s\-/.,]+(\d{4}|\d{2})$/))) {
    const month = monthFromName(m[2]!);
    if (month) iso = toIso(expandYear(m[3]!), month, Number(m[1]));
    else matched = false;
  } else {
    matched = false;
  }

  if (iso) return { iso };
  return {
    iso: null,
    error: matched ? 'is not a valid calendar date' : 'is not a recognised date (use dd/mm/yyyy)'
  };
}

function parseStatus(raw: string): 'active' | 'inactive' | 'discontinued' {
  const s = raw.trim().toLowerCase();
  if (!s) return 'active';
  if (s.includes('discontinu')) return 'discontinued';
  if (s.includes('inactive') || s === '0' || s === 'no') return 'inactive';
  return 'active';
}

export function parseInventoryExcel(buffer: Buffer): { rows: InventorySheetRow[]; preview: InventorySheetPreview } {
  const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) {
    throw new Error('Excel file has no sheets');
  }
  const sheet = workbook.Sheets[sheetName]!;
  const matrix = XLSX.utils.sheet_to_json<(string | number | Date | null)[]>(sheet, {
    header: 1,
    defval: '',
    raw: true
  }) as unknown[][];

  if (!matrix.length) {
    throw new Error('Excel sheet is empty');
  }

  const headerRow = (matrix[0] ?? []).map((h) => String(h ?? ''));
  const headerMap = buildHeaderMap(headerRow);
  if (!headerMap.has('sku') || !headerMap.has('name')) {
    throw new Error(
      'Missing required columns. Expected at least "SKU / Item Code" and "Product Name".'
    );
  }

  const warnings: string[] = [];
  const rows: InventorySheetRow[] = [];
  const categories = new Set<string>();
  const warehouses = new Set<string>();
  const suppliers = new Set<string>();

  for (let i = 1; i < matrix.length; i++) {
    const raw = matrix[i] ?? [];
    if (!raw.some((c) => String(c ?? '').trim())) continue;

    const sku = cellStr(raw, headerMap.get('sku'));
    const name = cellStr(raw, headerMap.get('name'));
    if (!sku || !name) {
      warnings.push(`Row ${i + 1}: skipped (missing SKU or Product Name)`);
      continue;
    }

    const category = cellStr(raw, headerMap.get('category')) || undefined;
    const warehouseName = cellStr(raw, headerMap.get('warehouseName')) || undefined;
    const supplierName = cellStr(raw, headerMap.get('supplierName')) || undefined;
    if (category) categories.add(category);
    if (warehouseName) warehouses.add(warehouseName);
    if (supplierName) suppliers.add(supplierName);

    const statusHeaderIdx = headerRow.findIndex((h) =>
      ['status (active/inactive)', 'status'].includes(normHeader(h))
    );

    const readDate = (field: 'expiryDate' | 'dateAdded', label: string): string | null => {
      const cell = raw[headerMap.get(field) ?? -1];
      const { iso, error } = parseSheetDate(cell);
      if (error) warnings.push(`Row ${i + 1} (${sku}): ${label} "${String(cell).trim()}" ${error}; left blank`);
      return iso;
    };
    const expiryDate = readDate('expiryDate', 'Expiry Date');
    const dateAdded = readDate('dateAdded', 'Date Added');

    rows.push({
      sku,
      barcode: cellStr(raw, headerMap.get('barcode')) || undefined,
      name,
      description: cellStr(raw, headerMap.get('description')) || undefined,
      category,
      subCategory: cellStr(raw, headerMap.get('subCategory')) || undefined,
      brand: cellStr(raw, headerMap.get('brand')) || undefined,
      uom: cellStr(raw, headerMap.get('uom')) || undefined,
      packSize: cellStr(raw, headerMap.get('packSize')) || undefined,
      openingQuantity: cellNum(raw, headerMap.get('openingQuantity')),
      reorderLevel: cellNum(raw, headerMap.get('reorderLevel')),
      reorderQuantity: cellNum(raw, headerMap.get('reorderQuantity')),
      costPrice: cellNum(raw, headerMap.get('costPrice')),
      sellingPrice: cellNum(raw, headerMap.get('sellingPrice')),
      taxPercent: cellNum(raw, headerMap.get('taxPercent')),
      warehouseName,
      binCode: cellStr(raw, headerMap.get('binCode')) || undefined,
      supplierName,
      supplierSku: cellStr(raw, headerMap.get('supplierSku')) || undefined,
      leadTimeDays: cellNum(raw, headerMap.get('leadTimeDays')),
      lotNumber: cellStr(raw, headerMap.get('lotNumber')) || undefined,
      expiryDate,
      status: parseStatus(cellStr(raw, statusHeaderIdx >= 0 ? statusHeaderIdx : undefined)),
      dateAdded,
      remarks: cellStr(raw, headerMap.get('remarks')) || undefined,
      rowNumber: i + 1
    });
  }

  return {
    rows,
    preview: {
      rowCount: rows.length,
      sample: rows.slice(0, 10),
      categories: [...categories].sort(),
      warehouses: [...warehouses].sort(),
      suppliers: [...suppliers].sort(),
      warnings: warnings.slice(0, 50),
      warningCount: warnings.length
    }
  };
}
