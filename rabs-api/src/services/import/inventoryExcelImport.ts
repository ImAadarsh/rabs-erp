/**
 * Import inventory seed Excel rows into catalog + inventory modules.
 */

import { AppDataSource } from '@config/data-source.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Barcode } from '@entities/catalog/Barcode.js';
import { TaxCode } from '@entities/catalog/TaxCode.js';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { Location } from '@entities/iam/Location.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { Bin } from '@entities/inventory/Bin.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import type { InventorySheetRow } from './inventoryExcelParser.js';

export type InventoryImportOptions = {
  organizationId: string;
  businessUnitId?: string;
  duplicateMode: 'skip' | 'update';
  importInventory?: boolean;
};

export type InventoryImportResult = {
  productsCreated: number;
  productsUpdated: number;
  productsSkipped: number;
  variantsCreated: number;
  barcodesCreated: number;
  warehousesCreated: number;
  binsCreated: number;
  suppliersCreated: number;
  stockItemsCreated: number;
  stockItemsUpdated: number;
  taxCodesCreated: number;
  errors: Array<{ sku: string; rowNumber: number; message: string }>;
};

function slugCode(input: string, max = 40): string {
  const base = input
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, max);
  return base || 'AUTO';
}

function parseExpiry(value?: string | null): Date | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

export async function runInventoryExcelImport(
  rows: InventorySheetRow[],
  options: InventoryImportOptions
): Promise<InventoryImportResult> {
  const result: InventoryImportResult = {
    productsCreated: 0,
    productsUpdated: 0,
    productsSkipped: 0,
    variantsCreated: 0,
    barcodesCreated: 0,
    warehousesCreated: 0,
    binsCreated: 0,
    suppliersCreated: 0,
    stockItemsCreated: 0,
    stockItemsUpdated: 0,
    taxCodesCreated: 0,
    errors: []
  };

  const org = await AppDataSource.getRepository(Organization).findOne({
    where: { id: options.organizationId }
  });
  if (!org) throw new Error('Invalid organizationId');

  let businessUnit: BusinessUnit | null = null;
  if (options.businessUnitId) {
    businessUnit = await AppDataSource.getRepository(BusinessUnit).findOne({
      where: { id: options.businessUnitId },
      relations: ['organization']
    });
    if (!businessUnit || businessUnit.organization.id !== org.id) {
      throw new Error('Invalid businessUnitId');
    }
  } else {
    businessUnit = await AppDataSource.getRepository(BusinessUnit).findOne({
      where: { organization: { id: org.id } }
    });
  }

  // Ensure a location exists for auto-created warehouses
  let location: Location | null = null;
  if (businessUnit) {
    location = await AppDataSource.getRepository(Location).findOne({
      where: { businessUnit: { id: businessUnit.id } },
      relations: ['businessUnit']
    });
    if (!location) {
      const locRepo = AppDataSource.getRepository(Location);
      location = await locRepo.save(
        locRepo.create({
          businessUnit,
          code: 'MAIN',
          name: 'Main Location',
          type: 'warehouse',
          countryCode: 'GB',
          isDefault: true,
          status: 'active'
        })
      );
    }
  }

  const warehouseCache = new Map<string, Warehouse>();
  const binCache = new Map<string, Bin>();
  const supplierCache = new Map<string, Supplier>();
  const taxCache = new Map<string, TaxCode>();

  const taxRepo = AppDataSource.getRepository(TaxCode);
  const whRepo = AppDataSource.getRepository(Warehouse);
  const binRepo = AppDataSource.getRepository(Bin);
  const supplierRepo = AppDataSource.getRepository(Supplier);

  async function resolveTaxCode(taxPercent?: number): Promise<TaxCode | null> {
    if (taxPercent == null || !Number.isFinite(taxPercent)) return null;
    const rate = taxPercent > 1 ? taxPercent / 100 : taxPercent;
    const key = rate.toFixed(4);
    if (taxCache.has(key)) return taxCache.get(key)!;

    const pctLabel = Math.round(rate * 100);
    const code = `VAT${pctLabel}`;

    let tax =
      (await taxRepo
        .createQueryBuilder('t')
        .where('t.organization_id = :orgId', { orgId: org!.id })
        .andWhere('(t.code = :code OR ROUND(t.rate, 4) = ROUND(:rate, 4))', { code, rate })
        .getOne()) ?? null;

    if (!tax) {
      tax = await taxRepo.save(
        taxRepo.create({
          organization: org!,
          code,
          name: pctLabel === 0 ? 'Zero-rated (0%)' : `VAT ${pctLabel}%`,
          rate,
          countryCode: 'GB',
          description: `Auto-created from inventory import · ${pctLabel}%`,
          isDefault: pctLabel === 20,
          status: 'active'
        })
      );
      result.taxCodesCreated++;
    }
    taxCache.set(key, tax);
    return tax;
  }

  async function resolveWarehouse(name?: string): Promise<Warehouse | null> {
    if (!name || !location) return null;
    const key = name.toLowerCase();
    if (warehouseCache.has(key)) return warehouseCache.get(key)!;

    let wh =
      (await whRepo
        .createQueryBuilder('w')
        .leftJoinAndSelect('w.location', 'loc')
        .where('(LOWER(w.name) = LOWER(:name) OR LOWER(COALESCE(w.address_line1, \'\')) = LOWER(:name))', { name })
        .getOne()) ?? null;

    if (!wh) {
      const code = slugCode(name, 20);
      const existingCode = await whRepo.findOne({ where: { code } });
      wh = await whRepo.save(
        whRepo.create({
          location,
          code: existingCode ? `${code}_${Date.now().toString().slice(-4)}` : code,
          name,
          type: 'main_hub',
          addressLine1: name,
          countryCode: 'GB',
          isDefault: warehouseCache.size === 0,
          status: 'active'
        })
      );
      result.warehousesCreated++;
    }
    warehouseCache.set(key, wh);
    return wh;
  }

  async function resolveBin(warehouse: Warehouse, binCode?: string): Promise<Bin | null> {
    if (!binCode) return null;
    const key = `${warehouse.id}:${binCode.toLowerCase()}`;
    if (binCache.has(key)) return binCache.get(key)!;

    let bin = await binRepo.findOne({
      where: { warehouse: { id: warehouse.id }, code: binCode },
      relations: ['warehouse']
    });
    if (!bin) {
      bin = await binRepo.save(
        binRepo.create({
          warehouse,
          code: binCode,
          name: binCode,
          rack: binCode,
          binType: 'standard',
          status: 'active'
        })
      );
      result.binsCreated++;
    }
    binCache.set(key, bin);
    return bin;
  }

  async function resolveSupplier(name?: string): Promise<Supplier | null> {
    if (!name) return null;
    const key = name.toLowerCase();
    if (supplierCache.has(key)) return supplierCache.get(key)!;

    let supplier = await supplierRepo
      .createQueryBuilder('s')
      .where('s.organization_id = :orgId', { orgId: org!.id })
      .andWhere('LOWER(s.name) = LOWER(:name)', { name })
      .getOne();

    if (!supplier) {
      const code = slugCode(name, 20);
      const existing = await supplierRepo.findOne({
        where: { organization: { id: org!.id }, code }
      });
      supplier = await supplierRepo.save(
        supplierRepo.create({
          organization: org!,
          code: existing ? `${code}_${Date.now().toString().slice(-4)}` : code,
          name,
          currency: 'GBP',
          countryCode: 'GB',
          status: 'active'
        })
      );
      result.suppliersCreated++;
    }
    supplierCache.set(key, supplier);
    return supplier;
  }

  for (const row of rows) {
    try {
      await AppDataSource.transaction(async (manager) => {
        const catRepo = manager.getRepository(CatalogItem);
        const varRepo = manager.getRepository(Variant);
        const barRepo = manager.getRepository(Barcode);
        const stkRepo = manager.getRepository(StockItem);

        let item = await catRepo.findOne({
          where: { organization: { id: org.id }, sku: row.sku },
          relations: ['organization', 'taxCode']
        });

        if (item && options.duplicateMode === 'skip') {
          result.productsSkipped++;
          return;
        }

        const taxCode = await resolveTaxCode(row.taxPercent);
        const attrs: Record<string, unknown> = {
          ...(item?.attributes ?? {})
        };
        if (row.supplierName) attrs.supplierName = row.supplierName;
        if (row.warehouseName) attrs.warehouseName = row.warehouseName;
        if (row.binCode) attrs.binCode = row.binCode;
        if (row.lotNumber) attrs.lotNumber = row.lotNumber;

        if (!item) {
          item = catRepo.create({
            organization: org,
            businessUnit,
            sku: row.sku,
            name: row.name,
            description: row.description ?? null,
            category: row.category ?? null,
            subCategory: row.subCategory ?? null,
            brand: row.brand ?? null,
            manufacturer: row.brand ?? null,
            uom: row.uom ?? null,
            packSize: row.packSize ?? null,
            costPrice: row.costPrice ?? null,
            sellingPrice: row.sellingPrice ?? null,
            currency: 'GBP',
            supplierSku: row.supplierSku ?? null,
            leadTimeDays: row.leadTimeDays ?? null,
            remarks: row.remarks ?? null,
            taxCode,
            attributes: Object.keys(attrs).length ? attrs : null,
            status: row.status
          });
          await catRepo.save(item);
          result.productsCreated++;
        } else {
          item.name = row.name;
          item.description = row.description ?? item.description;
          item.category = row.category ?? item.category;
          item.subCategory = row.subCategory ?? item.subCategory;
          item.brand = row.brand ?? item.brand;
          item.manufacturer = row.brand ?? item.manufacturer;
          item.uom = row.uom ?? item.uom;
          item.packSize = row.packSize ?? item.packSize;
          item.costPrice = row.costPrice ?? item.costPrice;
          item.sellingPrice = row.sellingPrice ?? item.sellingPrice;
          item.supplierSku = row.supplierSku ?? item.supplierSku;
          item.leadTimeDays = row.leadTimeDays ?? item.leadTimeDays;
          item.remarks = row.remarks ?? item.remarks;
          item.status = row.status;
          if (taxCode) item.taxCode = taxCode;
          item.attributes = Object.keys(attrs).length ? attrs : item.attributes;
          await catRepo.save(item);
          result.productsUpdated++;
        }

        let variant = await varRepo.findOne({
          where: { variantSku: row.sku },
          relations: ['catalogItem']
        });
        if (!variant) {
          variant = await varRepo.save(
            varRepo.create({
              catalogItem: item,
              variantSku: row.sku,
              name: row.name,
              costPrice: row.costPrice ?? null,
              costCurrency: 'GBP',
              position: 0,
              status: row.status
            })
          );
          result.variantsCreated++;
        } else if (options.duplicateMode === 'update') {
          variant.name = row.name;
          variant.costPrice = row.costPrice ?? variant.costPrice;
          variant.status = row.status;
          await varRepo.save(variant);
        }

        if (row.barcode) {
          const existingBarcode = await barRepo.findOne({ where: { barcode: row.barcode } });
          if (!existingBarcode) {
            await barRepo.save(
              barRepo.create({
                variant,
                barcode: row.barcode,
                type: row.barcode.replace(/\D/g, '').length === 12 ? 'UPC' : 'EAN',
                isPrimary: true
              })
            );
            result.barcodesCreated++;
          }
        }

        if (options.importInventory !== false) {
          await resolveSupplier(row.supplierName);
          const warehouse = await resolveWarehouse(row.warehouseName);
          if (warehouse) {
            const bin = await resolveBin(warehouse, row.binCode);
            const qty = Math.max(0, Math.round(row.openingQuantity ?? 0));
            let stock = await stkRepo.findOne({
              where: {
                variant: { id: variant.id },
                warehouse: { id: warehouse.id },
                ...(row.lotNumber ? { lotNumber: row.lotNumber } : {})
              },
              relations: ['variant', 'warehouse', 'bin']
            });

            if (!stock) {
              // Fallback: same variant+warehouse without lot filter
              stock = await stkRepo.findOne({
                where: {
                  variant: { id: variant.id },
                  warehouse: { id: warehouse.id }
                },
                relations: ['variant', 'warehouse', 'bin']
              });
            }

            if (!stock) {
              await stkRepo.save(
                stkRepo.create({
                  variant,
                  warehouse,
                  bin,
                  lotNumber: row.lotNumber ?? null,
                  expiryDate: parseExpiry(row.expiryDate),
                  quantityOnHand: qty,
                  quantityReserved: 0,
                  safetyStockLevel: 0,
                  reorderPoint: Math.round(row.reorderLevel ?? 0),
                  reorderQuantity: Math.round(row.reorderQuantity ?? 0),
                  status: 'available',
                  costPrice: row.costPrice ?? null
                })
              );
              result.stockItemsCreated++;
            } else if (options.duplicateMode === 'update') {
              stock.quantityOnHand = qty;
              stock.reorderPoint = Math.round(row.reorderLevel ?? stock.reorderPoint);
              stock.reorderQuantity = Math.round(row.reorderQuantity ?? stock.reorderQuantity);
              stock.lotNumber = row.lotNumber ?? stock.lotNumber;
              stock.expiryDate = parseExpiry(row.expiryDate) ?? stock.expiryDate;
              stock.costPrice = row.costPrice ?? stock.costPrice;
              if (bin) stock.bin = bin;
              await stkRepo.save(stock);
              result.stockItemsUpdated++;
            }
          }
        }
      });
    } catch (err) {
      result.errors.push({
        sku: row.sku,
        rowNumber: row.rowNumber,
        message: err instanceof Error ? err.message : 'Import failed'
      });
    }
  }

  return result;
}
