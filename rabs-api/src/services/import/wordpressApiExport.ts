/**
 * WordPress / WooCommerce REST API export service.
 * Pushes ERP catalog items (+ variants, images) to a WooCommerce store.
 */

import type { WordPressApiCredentials } from './wordpressApiImport.js';
import { wooApiError } from './wooApiError.js';

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function buildAuthHeader(creds: WordPressApiCredentials): string {
  if (creds.authMode === 'appPassword') {
    return `Basic ${Buffer.from(`${creds.username ?? ''}:${creds.appPassword ?? ''}`).toString('base64')}`;
  }
  return `Basic ${Buffer.from(`${creds.consumerKey ?? ''}:${creds.consumerSecret ?? ''}`).toString('base64')}`;
}

async function wcFetch<T>(
  baseUrl: string,
  auth: string,
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  const res = await fetch(`${baseUrl}/wp-json/wc/v3${path}`, {
    method,
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body ? JSON.stringify(body) : undefined
  });
  if (!res.ok) {
    const text = await res.text();
    throw wooApiError(`WooCommerce API error ${method} ${path}`, res.status, text);
  }
  return res.json() as Promise<T>;
}

export interface ExportVariant {
  sku: string;
  name?: string;
  price?: number;
  compareAtPrice?: number;
  inventoryQty?: number;
  weight?: number;
  imageUrl?: string;
  option1Name?: string;
  option1Value?: string;
  option2Name?: string;
  option2Value?: string;
  option3Name?: string;
  option3Value?: string;
  status: 'active' | 'inactive' | 'discontinued';
}

/** Objects in the retired S3 bucket return 403, which makes WooCommerce reject the whole product. */
function isReachableImage(src?: string | null): src is string {
  if (!src) return false;
  try {
    return !new URL(src).hostname.endsWith('amazonaws.com');
  } catch {
    return false;
  }
}

export interface ExportItem {
  id: string;
  sku: string;
  name: string;
  description?: string | null;
  category?: string | null;
  brand?: string | null;
  status: 'active' | 'inactive' | 'discontinued';
  weightValue?: number | null;
  weightUnit?: string;
  variants: ExportVariant[];
  imageUrls?: string[];
}

export interface ExportResult {
  created: number;
  updated: number;
  skipped: number;
  errors: Array<{ sku: string; message: string }>;
  channelMappings: Array<{ catalogItemId: string; externalId: string; sku: string }>;
}

interface WcExistingProduct { id: number; sku: string }

/** Look up existing WooCommerce product by SKU. Returns null if not found. */
async function findBySku(
  baseUrl: string,
  auth: string,
  sku: string
): Promise<WcExistingProduct | null> {
  try {
    const results = await wcFetch<WcExistingProduct[]>(
      baseUrl, auth, 'GET', `/products?sku=${encodeURIComponent(sku)}&per_page=1`
    );
    return results[0] ?? null;
  } catch {
    return null;
  }
}

function toWcStatus(status: string): string {
  return status === 'active' ? 'publish' : 'draft';
}

function buildWcProductPayload(item: ExportItem): Record<string, unknown> {
  const isVariable = item.variants.length > 1;

  const images = (item.imageUrls ?? []).filter(isReachableImage).map((src, i) => ({ src, position: i + 1 }));
  if (!images.length && isReachableImage(item.variants[0]?.imageUrl)) {
    images.push({ src: item.variants[0].imageUrl, position: 1 });
  }

  const categories = item.category
    ? [{ name: item.category }]
    : [];

  const payload: Record<string, unknown> = {
    name: item.name,
    sku: item.sku,
    status: toWcStatus(item.status),
    description: item.description ?? '',
    short_description: '',
    categories,
    images,
    type: isVariable ? 'variable' : 'simple',
    tags: item.brand ? [{ name: item.brand }] : []
  };

  if (!isVariable && item.variants[0]) {
    const v = item.variants[0];
    payload.regular_price = String(v.price ?? '');
    payload.sale_price = v.compareAtPrice != null && v.compareAtPrice > (v.price ?? 0)
      ? String(v.price ?? '')
      : '';
    if (v.inventoryQty != null) {
      payload.manage_stock = true;
      payload.stock_quantity = v.inventoryQty;
      payload.stock_status = v.inventoryQty > 0 ? 'instock' : 'outofstock';
    }
    if (item.weightValue != null) {
      payload.weight = String(item.weightValue);
    }
  } else if (isVariable) {
    const attrNames = new Set<string>();
    for (const v of item.variants) {
      if (v.option1Name) attrNames.add(v.option1Name);
      if (v.option2Name) attrNames.add(v.option2Name);
      if (v.option3Name) attrNames.add(v.option3Name);
    }
    payload.attributes = Array.from(attrNames).map((name) => ({
      name,
      variation: true,
      visible: true,
      options: [...new Set(
        item.variants.flatMap((v) => {
          const vals: string[] = [];
          if (v.option1Name === name && v.option1Value) vals.push(v.option1Value);
          if (v.option2Name === name && v.option2Value) vals.push(v.option2Value);
          if (v.option3Name === name && v.option3Value) vals.push(v.option3Value);
          return vals;
        })
      )]
    }));
  }

  return payload;
}

function buildWcVariationPayload(v: ExportVariant): Record<string, unknown> {
  const attrs: Array<{ name: string; option: string }> = [];
  if (v.option1Name && v.option1Value) attrs.push({ name: v.option1Name, option: v.option1Value });
  if (v.option2Name && v.option2Value) attrs.push({ name: v.option2Name, option: v.option2Value });
  if (v.option3Name && v.option3Value) attrs.push({ name: v.option3Name, option: v.option3Value });

  const payload: Record<string, unknown> = {
    sku: v.sku,
    status: toWcStatus(v.status),
    regular_price: String(v.price ?? ''),
    attributes: attrs
  };

  if (isReachableImage(v.imageUrl)) payload.image = { src: v.imageUrl };
  if (v.inventoryQty != null) {
    payload.manage_stock = true;
    payload.stock_quantity = v.inventoryQty;
  }

  return payload;
}

/**
 * Export ERP catalog items to WooCommerce.
 * - Creates new products if they don't exist (by SKU lookup).
 * - Updates existing products when duplicateMode = 'update'.
 */
export async function exportItemsToWordPress(
  creds: WordPressApiCredentials,
  items: ExportItem[],
  opts: { duplicateMode: 'skip' | 'update' } = { duplicateMode: 'skip' }
): Promise<ExportResult> {
  const baseUrl = normalizeUrl(creds.storeUrl);
  const auth = buildAuthHeader(creds);

  const result: ExportResult = {
    created: 0,
    updated: 0,
    skipped: 0,
    errors: [],
    channelMappings: []
  };

  for (const item of items) {
    try {
      const existing = await findBySku(baseUrl, auth, item.sku);
      const isVariable = item.variants.length > 1;
      let wcProductId: number;

      if (existing) {
        if (opts.duplicateMode === 'skip') {
          result.skipped++;
          result.channelMappings.push({ catalogItemId: item.id, externalId: String(existing.id), sku: item.sku });
          continue;
        }
        const payload = buildWcProductPayload(item);
        const updated = await wcFetch<{ id: number }>(
          baseUrl, auth, 'PUT', `/products/${existing.id}`, payload
        );
        wcProductId = updated.id;
        result.updated++;
      } else {
        const payload = buildWcProductPayload(item);
        const created = await wcFetch<{ id: number }>(
          baseUrl, auth, 'POST', '/products', payload
        );
        wcProductId = created.id;
        result.created++;
      }

      result.channelMappings.push({ catalogItemId: item.id, externalId: String(wcProductId), sku: item.sku });

      if (isVariable) {
        for (const v of item.variants) {
          const variationPayload = buildWcVariationPayload(v);
          try {
            await wcFetch<{ id: number }>(
              baseUrl, auth, 'POST', `/products/${wcProductId}/variations`, variationPayload
            );
          } catch (e) {
            result.errors.push({ sku: v.sku, message: e instanceof Error ? e.message : 'Variation export failed' });
          }
        }
      }
    } catch (e) {
      result.errors.push({ sku: item.sku, message: e instanceof Error ? e.message : 'Export failed' });
    }
  }

  return result;
}
