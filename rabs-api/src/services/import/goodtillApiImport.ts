/**
 * Good Till → Rabs Interiors catalog import mappers.
 */

import type { ParsedProduct, ParsedVariant } from './types.js';
import {
  GoodTillApiClient,
  type GoodTillCredentials,
  type GoodTillEcommerceProduct
} from './goodtillApiClient.js';
import { slugPart, parseNum } from './parserUtils.js';

function slugFromSku(sku: string, id: string): string {
  const base = slugPart(sku || id);
  return base || id.replace(/-/g, '').slice(0, 50);
}

function mapVariant(p: GoodTillEcommerceProduct, parentSku: string): ParsedVariant {
  const sku = (p.product_sku || `${parentSku}-${p.product_id.slice(0, 8)}`).slice(0, 100);
  const attrs = p.attributes ?? [];
  return {
    variantSku: sku,
    channelVariantId: p.product_id,
    name: p.product_name,
    price: parseNum(p.selling_price),
    inventoryQty: p.track_inventory ? parseNum(p.inventory) : undefined,
    option1Name: attrs[0]?.name,
    option1Value: attrs[0]?.value || undefined,
    option2Name: attrs[1]?.name,
    option2Value: attrs[1]?.value || undefined,
    barcode: p.barcode ?? undefined,
    status: 'active'
  };
}

function mapProduct(p: GoodTillEcommerceProduct): ParsedProduct | null {
  if (p.import_issue) return null;
  if (p.parent_product_id) return null;

  const handle = p.product_id;
  const sku = (p.product_sku || handle).slice(0, 100);
  const childVariants = (p.variants ?? []).filter((v) => v.parent_product_id === p.product_id);

  let variants: ParsedVariant[];
  if (p.has_variant && childVariants.length) {
    variants = childVariants.map((v) => mapVariant(v, sku));
  } else {
    variants = [mapVariant(p, sku)];
  }

  return {
    handle,
    sku,
    name: p.product_name,
    description: p.product_desc ?? undefined,
    category: p.category ?? undefined,
    brand: p.brand ?? undefined,
    tags: p.tags?.length ? p.tags : undefined,
    status: 'active',
    variants,
    media: []
  };
}

export async function fetchAllGoodTillProducts(creds: GoodTillCredentials): Promise<ParsedProduct[]> {
  const client = new GoodTillApiClient(creds);
  await client.login();
  const raw = await client.getEcommerceProducts();
  return raw.map(mapProduct).filter((p): p is ParsedProduct => p != null);
}

export async function fetchGoodTillProductsByIds(
  creds: GoodTillCredentials,
  productIds: string[]
): Promise<ParsedProduct[]> {
  const all = await fetchAllGoodTillProducts(creds);
  const idSet = new Set(productIds);
  return all.filter((p) => idSet.has(p.handle));
}

export interface BrowseGoodTillOptions {
  search?: string;
  page?: number;
  perPage?: number;
}

export interface BrowseGoodTillResult {
  products: GoodTillEcommerceProduct[];
  total: number;
  totalPages: number;
}

/** Client-side filter/paginate ecommerce products for browse UI. */
export async function browseGoodTillProducts(
  creds: GoodTillCredentials,
  opts: BrowseGoodTillOptions = {}
): Promise<BrowseGoodTillResult> {
  const client = new GoodTillApiClient(creds);
  await client.login();
  let products = await client.getEcommerceProducts();
  products = products.filter((p) => !p.parent_product_id);

  const q = opts.search?.trim().toLowerCase();
  if (q) {
    products = products.filter(
      (p) =>
        p.product_name.toLowerCase().includes(q) ||
        p.product_sku.toLowerCase().includes(q) ||
        (p.barcode ?? '').includes(q)
    );
  }

  const perPage = opts.perPage ?? 25;
  const page = opts.page ?? 1;
  const total = products.length;
  const totalPages = Math.max(1, Math.ceil(total / perPage));
  const start = (page - 1) * perPage;

  return {
    products: products.slice(start, start + perPage),
    total,
    totalPages
  };
}

export { GoodTillApiClient, type GoodTillCredentials, type GoodTillEcommerceProduct };
