/**
 * ABS Interiors catalog → Good Till EPOS export / sync service.
 */

import { AppDataSource } from '@config/data-source.js';
import { Barcode } from '@entities/catalog/Barcode.js';
import { generateBarcodeFromSku } from '@utils/barcodeGenerator.js';
import {
  GoodTillApiClient,
  type GoodTillCredentials,
  type GoodTillEcommerceProduct
} from './goodtillApiClient.js';

export interface GoodTillExportVariant {
  id: string;
  sku: string;
  name?: string;
  price?: number;
  inventoryQty?: number;
  barcode?: string;
  weightGrams?: number;
  option1Name?: string;
  option1Value?: string;
  status: 'active' | 'inactive' | 'discontinued';
}

export interface GoodTillExportItem {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  status: 'active' | 'inactive' | 'discontinued';
  variants: GoodTillExportVariant[];
}

export type GoodTillExportMode = 'push' | 'sync';

export interface GoodTillExportOptions {
  /** @deprecated Prefer `mode`. Kept for API compatibility. */
  duplicateMode?: 'skip' | 'update';
  /** push = create missing only; sync = create missing + update changed fields */
  mode?: GoodTillExportMode;
  vatCodeId: string;
  generateBarcodes: boolean;
}

export interface GoodTillExportResult {
  created: number;
  updated: number;
  skipped: number;
  unchanged: number;
  barcodesGenerated: number;
  errors: Array<{ sku: string; message: string }>;
  channelMappings: Array<{ catalogItemId: string; externalId: string; sku: string }>;
}

async function resolveBarcode(
  variantId: string,
  sku: string,
  existing: string | undefined,
  generate: boolean
): Promise<{ barcode: string | undefined; generated: boolean }> {
  if (existing) return { barcode: existing, generated: false };
  if (!generate) return { barcode: undefined, generated: false };

  const barcodeRepo = AppDataSource.getRepository(Barcode);
  const primary = await barcodeRepo.findOne({
    where: { variant: { id: variantId }, isPrimary: true }
  });
  if (primary) return { barcode: primary.barcode, generated: false };

  const anyBarcode = await barcodeRepo.findOne({ where: { variant: { id: variantId } } });
  if (anyBarcode) return { barcode: anyBarcode.barcode, generated: false };

  const value = generateBarcodeFromSku(sku);
  await barcodeRepo.save(
    barcodeRepo.create({
      variant: { id: variantId } as Barcode['variant'],
      barcode: value,
      type: 'EAN',
      isPrimary: true
    })
  );
  return { barcode: value, generated: true };
}

function flattenSkuMap(products: GoodTillEcommerceProduct[]): Map<string, GoodTillEcommerceProduct> {
  const map = new Map<string, GoodTillEcommerceProduct>();
  function walk(list: GoodTillEcommerceProduct[]) {
    for (const p of list) {
      if (p.product_sku) map.set(p.product_sku.toLowerCase(), p);
      if (p.variants?.length) walk(p.variants);
    }
  }
  walk(products);
  return map;
}

function resolveMode(opts: GoodTillExportOptions): GoodTillExportMode {
  if (opts.mode === 'push' || opts.mode === 'sync') return opts.mode;
  return opts.duplicateMode === 'update' ? 'sync' : 'push';
}

function money(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '0.00';
  return Number(n).toFixed(2);
}

function qty(n: number | undefined | null): string {
  if (n == null || !Number.isFinite(Number(n))) return '0.000';
  return Number(n).toFixed(3);
}

function normText(v: unknown): string {
  return String(v ?? '')
    .trim()
    .replace(/\s+/g, ' ');
}

function buildPayload(
  item: GoodTillExportItem,
  variant: GoodTillExportVariant,
  opts: GoodTillExportOptions,
  outletId: string
): Record<string, unknown> {
  const track = true;
  return {
    outlet_id: outletId,
    vat_code_id: opts.vatCodeId,
    product_name: variant.name ?? item.name,
    display_name: variant.name ?? item.name,
    product_sku: variant.sku,
    product_desc: item.description ?? '',
    selling_price: money(variant.price),
    barcode: variant.barcode ?? '',
    active: variant.status === 'active' ? 1 : 0,
    shareable: 1,
    track_inventory: track ? 1 : 0,
    inventory: qty(variant.inventoryQty ?? 0),
    weight: variant.weightGrams ?? undefined,
    has_variant: 0,
    has_attributes: variant.option1Name ? 1 : 0,
    attributes: variant.option1Name ? [variant.option1Name] : []
  };
}

/**
 * Detect what differs between ERP and the current EPOS product.
 * Quantity is tracked separately from other fields because Good Till updates
 * stock through a dedicated delta endpoint (`PUT /products/:id` ignores it).
 */
function diffProduct(
  existing: GoodTillEcommerceProduct,
  item: GoodTillExportItem,
  variant: GoodTillExportVariant
): { metadataChanged: boolean; qtyChanged: boolean } {
  const desiredName = normText(variant.name ?? item.name);
  const desiredDesc = normText(item.description ?? '');
  const desiredPrice = money(variant.price);
  const desiredQty = qty(variant.inventoryQty ?? 0);
  const desiredBarcode = normText(variant.barcode ?? '');
  const desiredActive = variant.status === 'active' ? 1 : 0;

  const currentName = normText(existing.product_name);
  const currentDesc = normText(existing.product_desc ?? '');
  const currentPrice = money(Number(existing.selling_price));
  const currentQty = qty(Number(existing.inventory));
  const currentBarcode = normText(existing.barcode ?? '');
  // ecommerce list may not expose active; treat missing as active
  const currentActive = 1;

  let metadataChanged = false;
  if (desiredName !== currentName) metadataChanged = true;
  if (desiredDesc !== currentDesc) metadataChanged = true;
  if (desiredPrice !== currentPrice) metadataChanged = true;
  if (desiredBarcode && desiredBarcode !== currentBarcode) metadataChanged = true;
  if (desiredActive !== currentActive && variant.status !== 'active') metadataChanged = true;

  const qtyChanged = desiredQty !== currentQty;

  return { metadataChanged, qtyChanged };
}

/**
 * Push or sync ABS Interiors catalog items to Good Till EPOS.
 * - push: create products that don't exist in EPOS yet (skip existing)
 * - sync: create missing + update name/description/price/stock/barcode when changed
 */
export async function exportItemsToGoodTill(
  creds: GoodTillCredentials,
  items: GoodTillExportItem[],
  opts: GoodTillExportOptions
): Promise<GoodTillExportResult> {
  const client = new GoodTillApiClient(creds);
  await client.login();
  const outletId = client.getOutletId();
  const mode = resolveMode(opts);

  const existingRaw = await client.getEcommerceProducts();
  const skuMap = flattenSkuMap(existingRaw);

  const result: GoodTillExportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    unchanged: 0,
    barcodesGenerated: 0,
    errors: [],
    channelMappings: []
  };

  for (const item of items) {
    for (const variant of item.variants) {
      try {
        const { barcode, generated } = await resolveBarcode(
          variant.id,
          variant.sku,
          variant.barcode,
          opts.generateBarcodes
        );
        if (generated) result.barcodesGenerated++;
        variant.barcode = barcode;

        const existing = skuMap.get(variant.sku.toLowerCase());
        const payload = buildPayload(item, variant, opts, outletId);

        if (existing) {
          if (mode === 'push') {
            result.skipped++;
            result.channelMappings.push({
              catalogItemId: item.id,
              externalId: existing.product_id,
              sku: variant.sku
            });
            continue;
          }

          const { metadataChanged, qtyChanged } = diffProduct(existing, item, variant);

          if (!metadataChanged && !qtyChanged) {
            result.unchanged++;
            result.channelMappings.push({
              catalogItemId: item.id,
              externalId: existing.product_id,
              sku: variant.sku
            });
            continue;
          }

          // Metadata (name/desc/price/barcode) goes through the product PUT.
          if (metadataChanged) {
            await client.patchProduct(existing.product_id, payload);
          }

          // Stock must go through the delta endpoint — PUT ignores `inventory`.
          if (qtyChanged) {
            await client.setInventoryLevel(
              existing.product_id,
              Number(variant.inventoryQty ?? 0),
              Number(existing.inventory)
            );
          }

          result.updated++;
          result.channelMappings.push({
            catalogItemId: item.id,
            externalId: existing.product_id,
            sku: variant.sku
          });
        } else {
          const created = await client.createProduct(payload);
          // Create may not set stock reliably; force the level via the delta
          // endpoint by reading back the freshly-created inventory.
          const desiredQty = Number(variant.inventoryQty ?? 0);
          if (variant.status === 'active' && desiredQty !== 0) {
            try {
              const [inv] = await client.getEcommerceInventory([variant.sku]);
              const current = inv ? Number(inv.inventory) : 0;
              await client.setInventoryLevel(created.id, desiredQty, current);
            } catch {
              // non-fatal: stock will reconcile on the next sync
            }
          }
          result.created++;
          result.channelMappings.push({
            catalogItemId: item.id,
            externalId: created.id,
            sku: variant.sku
          });
          skuMap.set(variant.sku.toLowerCase(), {
            product_id: created.id,
            product_sku: variant.sku,
            product_name: String(payload.product_name),
            product_desc: String(payload.product_desc ?? ''),
            selling_price: String(payload.selling_price),
            inventory: String(payload.inventory),
            barcode: String(payload.barcode ?? '')
          } as GoodTillEcommerceProduct);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Export failed';
        result.errors.push({ sku: variant.sku, message });
      }
    }
  }

  return result;
}
