/**
 * Generate barcodes on Good Till EPOS products and push updates safely (full merge).
 */

import { generateBarcodeFromSku } from '@utils/barcodeGenerator.js';
import { resolveBarcodeSymbology, toBwipBcid } from '@utils/barcodeSymbology.js';
import {
  GoodTillApiClient,
  type GoodTillCredentials,
  type GoodTillEcommerceProduct
} from './goodtillApiClient.js';

export interface EposBarcodeResult {
  generated: number;
  updated: number;
  skipped: number;
  errors: Array<{ productId: string; sku: string; message: string }>;
  products: Array<{
    productId: string;
    productSku: string;
    productName: string;
    barcode: string;
    sellingPrice: string;
  }>;
}

function flattenEposProducts(list: GoodTillEcommerceProduct[]): GoodTillEcommerceProduct[] {
  const out: GoodTillEcommerceProduct[] = [];
  function walk(items: GoodTillEcommerceProduct[]) {
    for (const p of items) {
      if (!p.parent_product_id) out.push(p);
      if (p.variants?.length) walk(p.variants);
    }
  }
  walk(list);
  return out;
}

function hasBarcode(value: string | null | undefined): boolean {
  return Boolean(value && String(value).trim());
}

/** Digits-only EAN/UPC values for SumUp POS scanners (preserves leading zeros). */
function normalizeBarcodeForEpos(value: string): string {
  const trimmed = value.trim();
  const { symbology, encodeValue } = resolveBarcodeSymbology(trimmed);
  if (symbology === 'EAN13' || symbology === 'EAN8' || symbology === 'UPC') {
    return encodeValue;
  }
  return trimmed;
}

/** Build PUT payload from GET details — avoids Good Till wiping fields on partial update. */
function mergeProductForUpdate(
  details: Record<string, unknown>,
  patch: Record<string, unknown>
): Record<string, unknown> {
  const payload: Record<string, unknown> = { ...details, ...patch, id: details.id };
  delete payload.inventory_id;
  delete payload.image;
  return payload;
}

export async function generateEposProductBarcodes(
  creds: GoodTillCredentials,
  opts: {
    productIds?: string[];
    generateAll?: boolean;
    forceRegenerate?: boolean;
  }
): Promise<EposBarcodeResult> {
  const client = new GoodTillApiClient(creds);
  await client.login();

  const allRaw = await client.getEcommerceProducts();
  let targets = flattenEposProducts(allRaw);

  if (!opts.generateAll && opts.productIds?.length) {
    const idSet = new Set(opts.productIds);
    targets = targets.filter((p) => idSet.has(p.product_id));
  }

  const result: EposBarcodeResult = {
    generated: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    products: []
  };

  for (const product of targets) {
    try {
      let barcode = product.barcode?.trim() ?? '';
      let generated = false;

      if (!hasBarcode(barcode) || opts.forceRegenerate) {
        barcode = generateBarcodeFromSku(product.product_sku || product.product_id);
        generated = true;
        result.generated++;
      } else {
        result.skipped++;
      }

      barcode = normalizeBarcodeForEpos(barcode);

      if (generated) {
        const details = await client.getProductDetails(product.product_id);
        await client.updateProduct(
          product.product_id,
          mergeProductForUpdate(details, { barcode })
        );
        result.updated++;
      }

      result.products.push({
        productId: product.product_id,
        productSku: product.product_sku,
        productName: product.product_name,
        barcode,
        sellingPrice: product.selling_price
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Barcode update failed';
      result.errors.push({
        productId: product.product_id,
        sku: product.product_sku,
        message
      });
    }
  }

  return result;
}

export async function renderBarcodePngDataUrl(text: string): Promise<string> {
  const bwipjs = await import('bwip-js');
  const { symbology, encodeValue } = resolveBarcodeSymbology(text);
  const png = await bwipjs.default.toBuffer({
    bcid: toBwipBcid(symbology),
    text: encodeValue,
    scale: 3,
    height: 12,
    includetext: true,
    textxalign: 'center'
  });
  return `data:image/png;base64,${png.toString('base64')}`;
}
