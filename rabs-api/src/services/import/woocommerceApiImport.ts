import type { ParsedProduct, ParsedVariant, ParsedMedia } from './types.js';
import { slugPart, parseNum, parseIntQty } from './parserUtils.js';

export interface WooCommerceApiCredentials {
  storeUrl: string;
  consumerKey: string;
  consumerSecret: string;
}

interface WcImage {
  src: string;
  position?: number;
}

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
  categories?: Array<{ name: string }>;
  tags?: Array<{ name: string }>;
  images?: WcImage[];
  attributes?: Array<{ name: string; variation: boolean }>;
}

function normalizeStoreUrl(url: string): string {
  return url.trim().replace(/\/$/, '');
}

function wcAuthHeader(key: string, secret: string): string {
  return `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`;
}

async function wcFetch<T>(
  baseUrl: string,
  auth: string,
  path: string
): Promise<T> {
  const res = await fetch(`${baseUrl}/wp-json/wc/v3${path}`, {
    headers: { Authorization: auth, 'Content-Type': 'application/json' }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

async function fetchVariations(
  baseUrl: string,
  auth: string,
  productId: number
): Promise<WcVariation[]> {
  const out: WcVariation[] = [];
  let page = 1;
  for (;;) {
    const batch = await wcFetch<WcVariation[]>(
      baseUrl,
      auth,
      `/products/${productId}/variations?per_page=100&page=${page}`
    );
    if (!Array.isArray(batch) || !batch.length) break;
    out.push(...batch);
    if (batch.length < 100) break;
    page++;
  }
  return out;
}

/** Quick connectivity check without loading full catalog. */
export async function testWooCommerceConnection(
  credentials: WooCommerceApiCredentials
): Promise<{ productCount: number }> {
  const baseUrl = normalizeStoreUrl(credentials.storeUrl);
  const auth = wcAuthHeader(credentials.consumerKey, credentials.consumerSecret);
  const res = await fetch(`${baseUrl}/wp-json/wc/v3/products?per_page=1&page=1`, {
    headers: { Authorization: auth }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WooCommerce API error (${res.status}): ${text.slice(0, 200)}`);
  }
  const total = res.headers.get('x-wp-total');
  const productCount = total ? parseInt(total, 10) : (await res.json() as unknown[]).length;
  return { productCount: Number.isFinite(productCount) ? productCount : 0 };
}

export async function fetchWooCommerceProducts(
  credentials: WooCommerceApiCredentials
): Promise<ParsedProduct[]> {
  const baseUrl = normalizeStoreUrl(credentials.storeUrl);
  const auth = wcAuthHeader(credentials.consumerKey, credentials.consumerSecret);
  const products: ParsedProduct[] = [];
  let page = 1;

  for (;;) {
    const batch = await wcFetch<WcProduct[]>(
      baseUrl,
      auth,
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
    variants = [
      {
        variantSku,
        channelVariantId: String(p.id),
        name: 'Default',
        price: parseNum(p.sale_price || p.regular_price),
        compareAtPrice: p.sale_price ? parseNum(p.regular_price) : undefined,
        inventoryQty:
          p.manage_stock && p.stock_quantity != null
            ? p.stock_quantity
            : parseIntQty(String(p.stock_quantity ?? '')),
        imageUrl: p.images?.[0]?.src,
        status
      }
    ];
  }

  if (!variants.length) {
    variants = [
      {
        variantSku: (p.sku || handle).slice(0, 100),
        channelVariantId: String(p.id),
        status
      }
    ];
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
