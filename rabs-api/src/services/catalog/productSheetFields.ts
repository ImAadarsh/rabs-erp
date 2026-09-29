/**
 * Read/write the inventory-sheet fields that live outside catalog_items
 * (barcode, warehouse, bin, supplier, opening qty, reorder, lot, expiry).
 */

import { AppDataSource } from '@config/data-source.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Barcode } from '@entities/catalog/Barcode.js';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { Bin } from '@entities/inventory/Bin.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { resolveBarcodeSymbology } from '@utils/barcodeSymbology.js';

export interface ProductSheetFields {
  barcode?: string | null;
  openingQuantity?: number | null;
  reorderLevel?: number | null;
  reorderQuantity?: number | null;
  warehouseName?: string | null;
  binCode?: string | null;
  supplierName?: string | null;
  lotNumber?: string | null;
  expiryDate?: string | null;
}

export interface LoadedSheetFields {
  barcode: string | null;
  openingQuantity: number | null;
  reorderLevel: number | null;
  reorderQuantity: number | null;
  warehouseId: string | null;
  warehouseName: string | null;
  binId: string | null;
  binCode: string | null;
  supplierName: string | null;
  lotNumber: string | null;
  expiryDate: string | null;
}

function slugCode(input: string, max = 20): string {
  const base = input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
  return base || 'AUTO';
}

/** Parse YYYY-MM-DD as local midnight so DATE columns don't shift a day. */
function toDate(value?: string | null): Date | null {
  if (!value) return null;
  const ymd = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  if (ymd) return new Date(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Format a DATE column value back to YYYY-MM-DD using local parts. */
function toIsoDateString(value: unknown): string | null {
  if (!value) return null;
  if (typeof value === 'string') {
    const ymd = /^\d{4}-\d{2}-\d{2}/.exec(value);
    return ymd ? ymd[0] : null;
  }
  const d = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(d.getTime())) return null;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function barcodeType(value: string): Barcode['type'] {
  const { symbology } = resolveBarcodeSymbology(value);
  switch (symbology) {
    case 'UPC':
      return 'UPC';
    case 'EAN13':
    case 'EAN8':
      return 'EAN';
    case 'CODE39':
    case 'CODE128':
      return 'CODE128';
    default:
      return 'EAN';
  }
}

/**
 * Bulk-load sheet fields for a set of catalog items (used by list/get responses).
 */
export async function loadSheetFieldsForItems(
  itemIds: string[]
): Promise<Map<string, LoadedSheetFields>> {
  const map = new Map<string, LoadedSheetFields>();
  if (!itemIds.length) return map;

  const rows: Array<Record<string, any>> = await AppDataSource.query(
    `
    SELECT
      v.catalog_item_id                      AS catalogItemId,
      MIN(v.id)                              AS variantId,
      MAX(bc.barcode)                        AS barcode,
      MAX(si.warehouse_id)                   AS warehouseId,
      MAX(w.name)                            AS warehouseName,
      MAX(si.bin_id)                         AS binId,
      MAX(b.code)                            AS binCode,
      SUM(COALESCE(si.quantity_on_hand, 0))  AS openingQuantity,
      MAX(si.reorder_point)                  AS reorderLevel,
      MAX(si.reorder_quantity)               AS reorderQuantity,
      MAX(si.lot_number)                     AS lotNumber,
      MAX(si.expiry_date)                    AS expiryDate
    FROM variants v
    LEFT JOIN barcodes bc    ON bc.variant_id = v.id
    LEFT JOIN stock_items si ON si.variant_id = v.id
    LEFT JOIN warehouses w   ON w.id = si.warehouse_id
    LEFT JOIN bins b         ON b.id = si.bin_id
    WHERE v.catalog_item_id IN (${itemIds.map(() => '?').join(',')})
      AND v.deleted_at IS NULL
    GROUP BY v.catalog_item_id
    `,
    itemIds
  );

  for (const r of rows) {
    const expiry = toIsoDateString(r.expiryDate);
    map.set(String(r.catalogItemId), {
      barcode: r.barcode ?? null,
      openingQuantity: r.openingQuantity != null ? Number(r.openingQuantity) : null,
      reorderLevel: r.reorderLevel != null ? Number(r.reorderLevel) : null,
      reorderQuantity: r.reorderQuantity != null ? Number(r.reorderQuantity) : null,
      warehouseId: r.warehouseId != null ? String(r.warehouseId) : null,
      warehouseName: r.warehouseName ?? null,
      binId: r.binId != null ? String(r.binId) : null,
      binCode: r.binCode ?? null,
      supplierName: null,
      lotNumber: r.lotNumber ?? null,
      expiryDate: expiry
    });
  }

  return map;
}

/** Merge loaded sheet fields (and attribute fallbacks) onto plain item objects. */
export function decorateItemsWithSheetFields<T extends { id: string; attributes?: any }>(
  items: T[],
  loaded: Map<string, LoadedSheetFields>
): Array<T & Partial<LoadedSheetFields>> {
  return items.map((item) => {
    const extra = loaded.get(String(item.id));
    const attrs = (item.attributes ?? {}) as Record<string, any>;
    return {
      ...item,
      barcode: extra?.barcode ?? null,
      openingQuantity: extra?.openingQuantity ?? null,
      reorderLevel: extra?.reorderLevel ?? null,
      reorderQuantity: extra?.reorderQuantity ?? null,
      warehouseId: extra?.warehouseId ?? null,
      warehouseName: extra?.warehouseName ?? attrs.warehouseName ?? null,
      binId: extra?.binId ?? null,
      binCode: extra?.binCode ?? attrs.binCode ?? null,
      supplierName: attrs.supplierName ?? null,
      lotNumber: extra?.lotNumber ?? attrs.lotNumber ?? null,
      expiryDate: extra?.expiryDate ?? null
    };
  });
}

async function resolveLocation(
  org: Organization,
  businessUnit: BusinessUnit | null
): Promise<Location | null> {
  const locRepo = AppDataSource.getRepository(Location);
  let bu = businessUnit;
  if (!bu) {
    bu = await AppDataSource.getRepository(BusinessUnit).findOne({
      where: { organization: { id: org.id } }
    });
  }
  if (!bu) return null;

  let location = await locRepo.findOne({
    where: { businessUnit: { id: bu.id } },
    relations: ['businessUnit']
  });
  if (!location) {
    location = await locRepo.save(
      locRepo.create({
        businessUnit: bu,
        code: 'MAIN',
        name: 'Main Location',
        type: 'warehouse',
        countryCode: 'GB',
        isDefault: true,
        status: 'active'
      })
    );
  }
  return location;
}

async function resolveWarehouse(
  name: string,
  org: Organization,
  businessUnit: BusinessUnit | null
): Promise<Warehouse | null> {
  const whRepo = AppDataSource.getRepository(Warehouse);
  const found = await whRepo
    .createQueryBuilder('w')
    .leftJoinAndSelect('w.location', 'loc')
    .where("(LOWER(w.name) = LOWER(:name) OR LOWER(COALESCE(w.address_line1, '')) = LOWER(:name))", {
      name
    })
    .getOne();
  if (found) return found;

  const location = await resolveLocation(org, businessUnit);
  if (!location) return null;

  const code = slugCode(name);
  const clash = await whRepo.findOne({ where: { code } });
  return whRepo.save(
    whRepo.create({
      location,
      code: clash ? `${code}_${Date.now().toString().slice(-4)}` : code,
      name,
      type: 'main_hub',
      addressLine1: name,
      countryCode: 'GB',
      status: 'active'
    })
  );
}

async function resolveBin(warehouse: Warehouse, code: string): Promise<Bin> {
  const binRepo = AppDataSource.getRepository(Bin);
  const found = await binRepo.findOne({
    where: { warehouse: { id: warehouse.id }, code },
    relations: ['warehouse']
  });
  if (found) return found;
  return binRepo.save(
    binRepo.create({
      warehouse,
      code,
      name: code,
      rack: code,
      binType: 'standard',
      status: 'active'
    })
  );
}

async function resolveSupplier(name: string, org: Organization): Promise<Supplier> {
  const supRepo = AppDataSource.getRepository(Supplier);
  const found = await supRepo
    .createQueryBuilder('s')
    .where('s.organization_id = :orgId', { orgId: org.id })
    .andWhere('LOWER(s.name) = LOWER(:name)', { name })
    .getOne();
  if (found) return found;

  const code = slugCode(name);
  const clash = await supRepo.findOne({ where: { organization: { id: org.id }, code } });
  return supRepo.save(
    supRepo.create({
      organization: org,
      code: clash ? `${code}_${Date.now().toString().slice(-4)}` : code,
      name,
      currency: 'GBP',
      countryCode: 'GB',
      status: 'active'
    })
  );
}

/**
 * Ensure the product has a default variant, then persist barcode + stock/warehouse fields.
 */
export async function syncProductSheetFields(
  item: CatalogItem,
  fields: ProductSheetFields
): Promise<void> {
  const touchesStock =
    fields.openingQuantity != null ||
    fields.reorderLevel != null ||
    fields.reorderQuantity != null ||
    !!fields.warehouseName ||
    !!fields.binCode ||
    !!fields.lotNumber ||
    !!fields.expiryDate;

  const touchesBarcode = fields.barcode !== undefined;

  if (!touchesStock && !touchesBarcode && !fields.supplierName) return;

  const variantRepo = AppDataSource.getRepository(Variant);
  let variant = await variantRepo.findOne({
    where: { catalogItem: { id: item.id } },
    relations: ['catalogItem'],
    order: { position: 'ASC' }
  });

  if (!variant) {
    variant = await variantRepo.save(
      variantRepo.create({
        catalogItem: item,
        variantSku: item.sku,
        name: item.name,
        costPrice: item.costPrice ?? null,
        costCurrency: item.currency ?? 'GBP',
        position: 0,
        status: item.status
      })
    );
  }

  // Barcode
  if (touchesBarcode) {
    const barcodeRepo = AppDataSource.getRepository(Barcode);
    const value = (fields.barcode ?? '').trim();
    const current = await barcodeRepo.findOne({
      where: { variant: { id: variant.id } },
      relations: ['variant']
    });

    if (!value) {
      if (current) await barcodeRepo.remove(current);
    } else {
      const owned = await barcodeRepo.findOne({
        where: { barcode: value },
        relations: ['variant']
      });
      if (owned && owned.variant?.id !== variant.id) {
        throw new Error(`Barcode ${value} is already used by another product`);
      }
      if (current) {
        current.barcode = value;
        current.type = barcodeType(value);
        current.isPrimary = true;
        await barcodeRepo.save(current);
      } else {
        await barcodeRepo.save(
          barcodeRepo.create({
            variant,
            barcode: value,
            type: barcodeType(value),
            isPrimary: true
          })
        );
      }
    }
  }

  const org = item.organization;
  if (fields.supplierName && org) {
    await resolveSupplier(fields.supplierName.trim(), org);
  }

  if (!touchesStock || !org) return;

  const stockRepo = AppDataSource.getRepository(StockItem);
  let stock = await stockRepo.findOne({
    where: { variant: { id: variant.id } },
    relations: ['variant', 'warehouse', 'bin']
  });

  let warehouse: Warehouse | null = stock?.warehouse ?? null;
  if (fields.warehouseName?.trim()) {
    warehouse = await resolveWarehouse(fields.warehouseName.trim(), org, item.businessUnit ?? null);
  }
  if (!warehouse) {
    // No warehouse to attach stock to — skip silently so product fields still save
    return;
  }

  let bin: Bin | null = stock?.bin ?? null;
  if (fields.binCode?.trim()) {
    bin = await resolveBin(warehouse, fields.binCode.trim());
  }

  const expiry = toDate(fields.expiryDate);

  if (!stock) {
    await stockRepo.save(
      stockRepo.create({
        variant,
        warehouse,
        bin,
        lotNumber: fields.lotNumber?.trim() || null,
        expiryDate: expiry,
        quantityOnHand: Math.max(0, Math.round(fields.openingQuantity ?? 0)),
        quantityReserved: 0,
        safetyStockLevel: 0,
        reorderPoint: Math.round(fields.reorderLevel ?? 0),
        reorderQuantity: Math.round(fields.reorderQuantity ?? 0),
        status: 'available',
        costPrice: item.costPrice ?? null
      })
    );
    return;
  }

  stock.warehouse = warehouse;
  stock.bin = bin;
  if (fields.openingQuantity != null) {
    stock.quantityOnHand = Math.max(0, Math.round(fields.openingQuantity));
  }
  if (fields.reorderLevel != null) stock.reorderPoint = Math.round(fields.reorderLevel);
  if (fields.reorderQuantity != null) stock.reorderQuantity = Math.round(fields.reorderQuantity);
  if (fields.lotNumber !== undefined) stock.lotNumber = fields.lotNumber?.trim() || null;
  if (fields.expiryDate !== undefined) stock.expiryDate = expiry;
  await stockRepo.save(stock);
}
