/**
 * WordPress / WooCommerce REST API import service.
 *
 * Supports two auth modes:
 *  - appPassword: WordPress Application Password (WP 5.6+), username + app_password
 *  - consumerKey: WooCommerce consumer key + consumer secret (legacy OAuth-style Basic)
 *
 * Both resolve to the same WooCommerce REST API endpoints.
 */

import type { ParsedProduct, ParsedVariant, ParsedMedia } from './types.js';
import { slugPart, parseNum, parseIntQty } from './parserUtils.js';

export type WordPressAuthMode = 'appPassword' | 'consumerKey';

export interface WordPressApiCredentials {
  storeUrl: string;
  authMode: WordPressAuthMode;
  /** App-password auth (WP Application Passwords) */
  username?: string;
  appPassword?: string;
  /** Consumer key auth (WooCommerce REST API keys) */
  consumerKey?: string;
  consumerSecret?: string;
}

interface WcImage { src: string; position?: number }
interface WcVariation {
  id: number;
  sku: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  status: string;
  attributes?: Array<{ name: string; option: string }>;
  image?: { src: string };
}
interface WcProduct {
  id: number;
  name: string;
  slug: string;
  sku: string;
  type: string;
  status: string;
  description: string;
  short_description: string;
  regular_price: string;
  sale_price: string;
  stock_quantity: number | null;
  manage_stock: boolean;
  categories?: Array<{ id: number; name: string }>;
  tags?: Array<{ name: string }>;
  images?: WcImage[];
  attributes?: Array<{ name: string; variation: boolean }>;
}

function normalizeUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function buildAuthHeader(creds: WordPressApiCredentials): string {
  if (creds.authMode === 'appPassword') {
    const user = creds.username ?? '';
    const pass = creds.appPassword ?? '';
    return `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}`;
  }
  const key = creds.consumerKey ?? '';
  const secret = creds.consumerSecret ?? '';
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

async function wcFetch<T>(baseUrl: string, auth: string, path: string): Promise<T> {
  const res = await fetch(`${baseUrl}/wp-json/wc/v3${path}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error (${res.status}): ${text.slice(0, 300)}`);
  }
  return res.json() as Promise<T>;
}

async function wpFetch<T>(baseUrl: string, auth: string, path: string): Promise<{ data: T; headers: Headers }> {
  const res = await fetch(`${baseUrl}/wp-json${path}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error (${res.status}): ${text.slice(0, 300)}`);
  }
  const data = await res.json() as T;
  return { data, headers: res.headers };
}

async function fetchVariations(baseUrl: string, auth: string, productId: number): Promise<WcVariation[]> {
  const out: WcVariation[] = [];
  let page = 1;
  for (;;) {
    const batch = await wcFetch<WcVariation[]>(
      baseUrl, auth,
      `/products/${productId}/variations?per_page=100&page=${page}`
    );
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return out;
}

/** Test WordPress/WooCommerce connection and return product count. */
export async function testWordPressConnection(
  creds: WordPressApiCredentials
): Promise<{ productCount: number; storeName: string }> {
  const baseUrl = normalizeUrl(creds.storeUrl);
  const auth = buildAuthHeader(creds);

  const res = await fetch(`${baseUrl}/wp-json/wc/v3/products?per_page=1&page=1`, {
    headers: { Authorization: auth }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error (${res.status}): ${text.slice(0, 300)}`);
  }
  const total = res.headers.get('x-wp-total');
  const productCount = total
    ? parseInt(total, 10)
    : (await res.json() as unknown[]).length;

  let storeName = baseUrl;
  try {
    const siteRes = await fetch(`${baseUrl}/wp-json`, { headers: { Authorization: auth } });
    if (siteRes.ok) {
      const site = await siteRes.json() as { name?: string };
      if (site.name) storeName = site.name;
    }
  } catch { /* non-fatal */ }

  return {
    productCount: Number.isFinite(productCount) ? productCount : 0,
    storeName
  };
}

/** Browse paginated product list from WordPress/WooCommerce. Returns raw WC products for UI display. */
export async function browseWordPressProducts(
  creds: WordPressApiCredentials,
  opts: {
    page?: number;
    perPage?: number;
    search?: string;
    status?: string;
    ids?: number[];
    type?: string;
    stockStatus?: string;
    minPrice?: string;
    maxPrice?: string;
    orderby?: string;
    order?: string;
    category?: string;
  }
): Promise<{ products: WcProduct[]; total: number; totalPages: number }> {
  const baseUrl = normalizeUrl(creds.storeUrl);
  const auth = buildAuthHeader(creds);
  const perPage = opts.perPage ?? 50;
  const page = opts.page ?? 1;

  const params = new URLSearchParams({
    per_page: String(perPage),
    page: String(page),
    status: opts.status ?? 'any'
  });
  if (opts.search) params.set('search', opts.search);
  if (opts.ids?.length) params.set('include', opts.ids.join(','));
  if (opts.type) params.set('type', opts.type);
  if (opts.stockStatus) params.set('stock_status', opts.stockStatus);
  if (opts.minPrice) params.set('min_price', opts.minPrice);
  if (opts.maxPrice) params.set('max_price', opts.maxPrice);
  if (opts.orderby) params.set('orderby', opts.orderby);
  if (opts.order) params.set('order', opts.order);
  if (opts.category) params.set('category', opts.category);

  const res = await fetch(`${baseUrl}/wp-json/wc/v3/products?${params}`, {
    headers: { Authorization: auth }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WordPress API error (${res.status}): ${text.slice(0, 300)}`);
  }
  const products = await res.json() as WcProduct[];
  const total = parseInt(res.headers.get('x-wp-total') ?? '0', 10);
  const totalPages = parseInt(res.headers.get('x-wp-totalpages') ?? '1', 10);
  return { products, total, totalPages };
}

/** Fetch all WordPress/WooCommerce products (for full import). */
export async function fetchAllWordPressProducts(
  creds: WordPressApiCredentials
): Promise<ParsedProduct[]> {
  const baseUrl = normalizeUrl(creds.storeUrl);
  const auth = buildAuthHeader(creds);
  const products: ParsedProduct[] = [];
  let page = 1;

  for (;;) {
    const batch = await wcFetch<WcProduct[]>(
      baseUrl, auth,
      `/products?per_page=100&page=${page}&status=any`
    );
    if (!Array.isArray(batch) || !batch.length) break;
    for (const p of batch) {
      if (p.type === 'variation') continue;
      products.push(await mapWcProduct(baseUrl, auth, p));
    }
    if (batch.length < 100) break;
    page++;
    if (page > 500) break;
  }
  return products;
}

/** Fetch specific WordPress/WooCommerce products by ID list (for selective import). */
export async function fetchWordPressProductsByIds(
  creds: WordPressApiCredentials,
  productIds: number[]
): Promise<ParsedProduct[]> {
  const baseUrl = normalizeUrl(creds.storeUrl);
  const auth = buildAuthHeader(creds);
  const products: ParsedProduct[] = [];

  // WC API supports ?include= for up to 100 IDs per request
  const chunks = chunkArray(productIds, 100);
  for (const chunk of chunks) {
    const batch = await wcFetch<WcProduct[]>(
      baseUrl, auth,
      `/products?include=${chunk.join(',')}&per_page=100&status=any`
    );
    if (!Array.isArray(batch)) continue;
    for (const p of batch) {
      if (p.type === 'variation') continue;
      products.push(await mapWcProduct(baseUrl, auth, p));
    }
  }
  return products;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

async function mapWcProduct(
  baseUrl: string,
  auth: string,
  p: WcProduct
): Promise<ParsedProduct> {
  const handle = p.slug || slugPart(p.sku || p.name);
  const status = p.status === 'publish' ? 'active' : 'inactive';
  const tags = (p.tags ?? []).map((t) => t.name);
  const category = p.categories?.[0]?.name;

  const media: ParsedMedia[] = (p.images ?? []).map((img, i) => ({
    url: img.src,
    position: img.position ?? i + 1
  }));

  let variants: ParsedVariant[] = [];

  if (p.type === 'variable') {
    const variations = await fetchVariations(baseUrl, auth, p.id);
    variants = variations.map((v) => {
      const attrs = v.attributes ?? [];
      const variantSku = (v.sku || `${handle}-${v.id}`).slice(0, 100);
      return {
        option1Name: attrs[0]?.name,
        option1Value: attrs[0]?.option,
        option2Name: attrs[1]?.name,
        option2Value: attrs[1]?.option,
        variantSku,
        channelVariantId: String(v.id),
        name: attrs.map((a) => a.option).filter(Boolean).join(' / ') || undefined,
        price: parseNum(v.sale_price || v.regular_price),
        compareAtPrice: v.sale_price ? parseNum(v.regular_price) : undefined,
        inventoryQty: v.manage_stock && v.stock_quantity != null ? v.stock_quantity : undefined,
        imageUrl: v.image?.src,
        status: v.status === 'publish' ? 'active' : 'inactive'
      };
    });
    for (const v of variations) {
      if (v.image?.src) {
        media.push({
          url: v.image.src,
          position: media.length + 1,
          variantSku: (v.sku || `${handle}-${v.id}`).slice(0, 100)
        });
      }
    }
  } else {
    const variantSku = (p.sku || `${handle}-default`).slice(0, 100);
    variants = [{
      variantSku,
      channelVariantId: String(p.id),
      name: 'Default',
      price: parseNum(p.sale_price || p.regular_price),
      compareAtPrice: p.sale_price ? parseNum(p.regular_price) : undefined,
      inventoryQty: p.manage_stock && p.stock_quantity != null
        ? p.stock_quantity
        : parseIntQty(String(p.stock_quantity ?? '')),
      imageUrl: p.images?.[0]?.src,
      status
    }];
  }

  if (!variants.length) {
    variants = [{
      variantSku: (p.sku || handle).slice(0, 100),
      channelVariantId: String(p.id),
      status
    }];
  }

  return {
    handle,
    sku: (p.sku || handle).slice(0, 100),
    name: p.name,
    description: p.short_description?.replace(/<[^>]+>/g, '') || undefined,
    category,
    tags,
    productType: p.type,
    status,
    variants,
    media
  };
}
