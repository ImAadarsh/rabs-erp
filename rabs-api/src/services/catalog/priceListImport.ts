/**
 * Import price list items from CSV / XLSX.
 *
 * One row per variant. The variant is identified by `variant_id`, `sku` (variant SKU) or `barcode`
 * (first non-empty, in that order). Rows are upserted on (price list, variant). Invalid rows are
 * skipped and reported with their spreadsheet row number; valid rows are still imported unless
 * the request is a dry run.
 */
import * as XLSX from 'xlsx';
import { In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { PriceListItem } from '@entities/catalog/PriceListItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Barcode } from '@entities/catalog/Barcode.js';

export const PRICE_LIST_IMPORT_COLUMNS = [
  'sku',
  'barcode',
  'variant_id',
  'price',
  'compare_at_price',
  'cost_price',
  'min_quantity',
  'max_quantity',
  'currency'
] as const;

type ColumnKey = (typeof PRICE_LIST_IMPORT_COLUMNS)[number];

const HEADER_ALIASES: Record<string, ColumnKey> = {
  sku: 'sku',
  variant_sku: 'sku',
  variantsku: 'sku',
  item_code: 'sku',
  barcode: 'barcode',
  ean: 'barcode',
  upc: 'barcode',
  variant_id: 'variant_id',
  variantid: 'variant_id',
  price: 'price',
  unit_price: 'price',
  compare_at_price: 'compare_at_price',
  compare_at: 'compare_at_price',
  rrp: 'compare_at_price',
  cost_price: 'cost_price',
  cost: 'cost_price',
  min_quantity: 'min_quantity',
  min_qty: 'min_quantity',
  minimum_quantity: 'min_quantity',
  max_quantity: 'max_quantity',
  max_qty: 'max_quantity',
  maximum_quantity: 'max_quantity',
  currency: 'currency'
};

export type PriceListImportError = { row: number; identifier: string; message: string };

export type PriceListImportResult = {
  dryRun: boolean;
  totalRows: number;
  validRows: number;
  created: number;
  updated: number;
  failed: number;
  errors: PriceListImportError[];
};

type ParsedRow = {
  row: number;
  identifier: string;
  sku: string;
  barcode: string;
  variantId: string;
  price: string;
  compareAtPrice: string;
  costPrice: string;
  minQuantity: string;
  maxQuantity: string;
  currency: string;
};

function normalizeHeader(h: unknown): string {
  return String(h ?? '')
    .replace(/^\uFEFF/, '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

/** Raw cell values are used so long numeric barcodes are not reformatted as 5.01E+12. */
function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'number') return String(v);
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  return String(v).trim();
}

function readMatrix(buffer: Buffer, fileName: string): unknown[][] {
  const lower = fileName.toLowerCase();
  let workbook: XLSX.WorkBook;
  if (lower.endsWith('.csv') || lower.endsWith('.txt')) {
    // Read CSV as text with raw values so SKUs like 000123 keep their leading zeros.
    workbook = XLSX.read(buffer.toString('utf8').replace(/^\uFEFF/, ''), { type: 'string', raw: true });
  } else if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    workbook = XLSX.read(buffer, { type: 'buffer' });
  } else {
    throw new Error('Unsupported file type. Upload a .csv or .xlsx file.');
  }
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error('The file has no sheets');
  return XLSX.utils.sheet_to_json(workbook.Sheets[sheetName]!, { header: 1, defval: '', raw: true, blankrows: false }) as unknown[][];
}

export function parsePriceListFile(buffer: Buffer, fileName: string): ParsedRow[] {
  const matrix = readMatrix(buffer, fileName);
  if (!matrix.length) throw new Error('The file is empty');

  const columns = new Map<ColumnKey, number>();
  (matrix[0] ?? []).forEach((h, idx) => {
    const key = HEADER_ALIASES[normalizeHeader(h)];
    if (key && !columns.has(key)) columns.set(key, idx);
  });
  if (!columns.has('price')) {
    throw new Error('Missing required column "price". Download the template for the expected columns.');
  }
  if (!columns.has('sku') && !columns.has('barcode') && !columns.has('variant_id')) {
    throw new Error('Add a "sku", "barcode" or "variant_id" column to identify each product.');
  }

  const get = (cells: unknown[], key: ColumnKey) => {
    const idx = columns.get(key);
    return idx === undefined ? '' : cellText(cells[idx]);
  };

  const rows: ParsedRow[] = [];
  for (let i = 1; i < matrix.length; i++) {
    const cells = matrix[i] ?? [];
    if (cells.every((c) => cellText(c) === '')) continue;
    const sku = get(cells, 'sku');
    const barcode = get(cells, 'barcode');
    const variantId = get(cells, 'variant_id');
    rows.push({
      // Spreadsheet row number as the user sees it (header is row 1).
      row: i + 1,
      identifier: variantId ? `variant ${variantId}` : sku || barcode,
      sku,
      barcode,
      variantId,
      price: get(cells, 'price'),
      compareAtPrice: get(cells, 'compare_at_price'),
      costPrice: get(cells, 'cost_price'),
      minQuantity: get(cells, 'min_quantity'),
      maxQuantity: get(cells, 'max_quantity'),
      currency: get(cells, 'currency')
    });
  }
  return rows;
}

function parseMoney(raw: string): number | null {
  const cleaned = raw.replace(/[£$€,\s]/g, '');
  if (cleaned === '') return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}

function parseIntField(raw: string): number | null {
  if (raw.trim() === '') return null;
  const n = Number(raw.trim());
  return Number.isInteger(n) ? n : NaN;
}

async function chunkedFind<T>(ids: string[], load: (chunk: string[]) => Promise<T[]>): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += 500) out.push(...(await load(ids.slice(i, i + 500))));
  return out;
}

export async function importPriceListItems(
  priceList: PriceList,
  rows: ParsedRow[],
  dryRun: boolean
): Promise<PriceListImportResult> {
  const errors: PriceListImportError[] = [];

  const variantIds = [...new Set(rows.map((r) => r.variantId).filter(Boolean))];
  const skus = [...new Set(rows.map((r) => r.sku).filter(Boolean))];
  const barcodes = [...new Set(rows.map((r) => r.barcode).filter(Boolean))];

  const variantRepo = AppDataSource.getRepository(Variant);
  const byId = new Map(
    (await chunkedFind(variantIds, (c) => variantRepo.find({ where: { id: In(c) } }))).map((v) => [String(v.id), v])
  );
  const bySku = new Map(
    (await chunkedFind(skus, (c) => variantRepo.find({ where: { variantSku: In(c) } }))).map((v) => [v.variantSku.toLowerCase(), v])
  );
  const byBarcode = new Map(
    (await chunkedFind(barcodes, (c) => AppDataSource.getRepository(Barcode).find({ where: { barcode: In(c) }, relations: ['variant'] })))
      .filter((b) => b.variant)
      .map((b) => [b.barcode, b.variant])
  );

  const listCurrency = (priceList.currency || 'GBP').toUpperCase();
  const seen = new Map<string, number>();
  const valid: Array<{ variant: Variant; price: number; compareAtPrice: number | null; costPrice: number | null; minQuantity: number | null; maxQuantity: number | null }> = [];

  for (const r of rows) {
    const fail = (message: string) => errors.push({ row: r.row, identifier: r.identifier || '(blank)', message });

    let variant: Variant | undefined;
    if (r.variantId) {
      variant = byId.get(r.variantId);
      if (!variant) { fail(`No variant with id ${r.variantId}`); continue; }
    } else if (r.sku) {
      variant = bySku.get(r.sku.toLowerCase());
      if (!variant) { fail(`No variant with SKU "${r.sku}"`); continue; }
    } else if (r.barcode) {
      variant = byBarcode.get(r.barcode);
      if (!variant) { fail(`No variant with barcode "${r.barcode}"`); continue; }
    } else {
      fail('SKU, barcode or variant_id is required');
      continue;
    }

    const price = parseMoney(r.price);
    if (price === null) { fail('Price is required'); continue; }
    if (Number.isNaN(price) || price < 0) { fail(`Invalid price "${r.price}"`); continue; }

    const compareAtPrice = parseMoney(r.compareAtPrice);
    if (Number.isNaN(compareAtPrice) || (compareAtPrice !== null && compareAtPrice < 0)) { fail(`Invalid compare_at_price "${r.compareAtPrice}"`); continue; }
    const costPrice = parseMoney(r.costPrice);
    if (Number.isNaN(costPrice) || (costPrice !== null && costPrice < 0)) { fail(`Invalid cost_price "${r.costPrice}"`); continue; }

    const minQuantity = parseIntField(r.minQuantity);
    if (Number.isNaN(minQuantity) || (minQuantity !== null && minQuantity < 1)) { fail(`min_quantity must be a whole number of at least 1 (got "${r.minQuantity}")`); continue; }
    const maxQuantity = parseIntField(r.maxQuantity);
    if (Number.isNaN(maxQuantity) || (maxQuantity !== null && maxQuantity < 1)) { fail(`max_quantity must be a whole number of at least 1 (got "${r.maxQuantity}")`); continue; }
    if (maxQuantity !== null && maxQuantity < (minQuantity ?? 1)) { fail('max_quantity cannot be lower than min_quantity'); continue; }

    if (r.currency && r.currency.toUpperCase() !== listCurrency) {
      fail(`Currency ${r.currency.toUpperCase()} does not match the price list currency ${listCurrency}`);
      continue;
    }

    const key = String(variant.id);
    const firstRow = seen.get(key);
    if (firstRow !== undefined) { fail(`Duplicate of row ${firstRow} (same variant ${variant.variantSku})`); continue; }
    seen.set(key, r.row);

    valid.push({ variant, price, compareAtPrice, costPrice, minQuantity, maxQuantity });
  }

  const itemRepo = AppDataSource.getRepository(PriceListItem);
  const existingRows = await chunkedFind(valid.map((v) => String(v.variant.id)), (c) =>
    itemRepo.find({ where: { priceList: { id: priceList.id }, variant: { id: In(c) } }, relations: ['variant'] })
  );
  const existing = new Map(existingRows.map((i) => [String(i.variant.id), i]));

  let created = 0;
  let updated = 0;
  if (!dryRun) {
    await AppDataSource.transaction(async (manager) => {
      const repo = manager.getRepository(PriceListItem);
      for (const v of valid) {
        const current = existing.get(String(v.variant.id));
        if (current) {
          current.price = v.price;
          if (v.compareAtPrice !== null) current.compareAtPrice = v.compareAtPrice;
          if (v.costPrice !== null) current.costPrice = v.costPrice;
          if (v.minQuantity !== null) current.minQuantity = v.minQuantity;
          if (v.maxQuantity !== null) current.maxQuantity = v.maxQuantity;
          await repo.save(current);
          updated++;
        } else {
          await repo.save(repo.create({
            priceList: { id: priceList.id } as PriceList,
            variant: v.variant,
            price: v.price,
            compareAtPrice: v.compareAtPrice,
            costPrice: v.costPrice,
            minMarginPercent: null,
            minQuantity: v.minQuantity ?? 1,
            maxQuantity: v.maxQuantity
          }));
          created++;
        }
      }
    });
  } else {
    for (const v of valid) {
      if (existing.has(String(v.variant.id))) updated++;
      else created++;
    }
  }

  return {
    dryRun,
    totalRows: rows.length,
    validRows: valid.length,
    created,
    updated,
    failed: errors.length,
    errors: errors.sort((a, b) => a.row - b.row)
  };
}

/** Template with the expected headers and one example row. */
export function buildPriceListTemplate(format: 'csv' | 'xlsx'): Buffer {
  const header = [...PRICE_LIST_IMPORT_COLUMNS];
  const example = ['ABC-123-RED', '', '', '9.99', '12.99', '4.50', '1', '', 'GBP'];
  const sheet = XLSX.utils.aoa_to_sheet([header, example]);
  if (format === 'csv') {
    return Buffer.from(XLSX.utils.sheet_to_csv(sheet), 'utf8');
  }
  sheet['!cols'] = header.map((h) => ({ wch: Math.max(14, h.length + 2) }));
  const notes = XLSX.utils.aoa_to_sheet([
    ['Column', 'Required', 'Notes'],
    ['sku', 'one of sku / barcode / variant_id', 'Variant SKU. Matched case-insensitively.'],
    ['barcode', 'one of sku / barcode / variant_id', 'Any barcode attached to the variant.'],
    ['variant_id', 'one of sku / barcode / variant_id', 'Internal variant id. Takes priority when filled.'],
    ['price', 'yes', 'Price in the price list currency, e.g. 9.99'],
    ['compare_at_price', 'no', 'Was / RRP price'],
    ['cost_price', 'no', 'Unit cost'],
    ['min_quantity', 'no', 'Whole number, default 1'],
    ['max_quantity', 'no', 'Whole number, at least min_quantity'],
    ['currency', 'no', 'If filled, must equal the price list currency'],
    ['', '', 'Existing items for the same variant are updated; new variants are added.']
  ]);
  notes['!cols'] = [{ wch: 18 }, { wch: 34 }, { wch: 60 }];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'Price list items');
  XLSX.utils.book_append_sheet(workbook, notes, 'Instructions');
  return XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
}
