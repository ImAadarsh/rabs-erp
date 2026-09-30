import type { ParsedProduct, ParsedVariant, ParsedMedia } from './types.js';
import { slugPart, parseNum } from './parserUtils.js';

export interface ShopifyApiCredentials {
  shopDomain: string;
  accessToken: string;
}

function normalizeShopDomain(domain: string): string {
  let d = domain.trim().replace(/^https?:\/\//, '').replace(/\/$/, '');
  if (!d.includes('.')) d = `${d}.myshopify.com`;
  return d;
}

interface ShopifyVariant {
  id: number;
  sku: string | null;
  title: string;
  price: string;
  compare_at_price: string | null;
  inventory_quantity?: number;
  option1?: string | null;
  option2?: string | null;
  option3?: string | null;
  image_id?: number | null;
}

interface ShopifyImage {
  id: number;
  src: string;
  position: number;
  variant_ids?: number[];
}

interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  tags?: string;
  status: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  options?: Array<{ name: string; position: number }>;
}

async function shopifyFetch<T>(
  domain: string,
  token: string,
  path: string
): Promise<T> {
  const url = `https://${domain}/admin/api/2024-10${path}`;
  const res = await fetch(url, {
    headers: {
      'X-Shopify-Access-Token': token,
      'Content-Type': 'application/json'
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Shopify API error (${res.status}): ${text.slice(0, 200)}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchShopifyProducts(
  credentials: ShopifyApiCredentials
): Promise<ParsedProduct[]> {
  const domain = normalizeShopDomain(credentials.shopDomain);
  const products: ParsedProduct[] = [];
  let pageInfo: string | null = null;
  let page = 1;

  for (;;) {
    const query = pageInfo
      ? `?limit=250&page_info=${encodeURIComponent(pageInfo)}`
      : `?limit=250&page=${page}`;
    const data = await shopifyFetch<{ products: ShopifyProduct[] }>(
      domain,
      credentials.accessToken,
      `/products.json${query}`
    );
    const batch = data.products ?? [];
    if (!batch.length) break;

    for (const p of batch) {
      products.push(mapShopifyProduct(p));
    }

    if (batch.length < 250) break;
    page++;
    if (page > 200) break;
  }

  return products;
}

function mapShopifyProduct(p: ShopifyProduct): ParsedProduct {
  const handle = p.handle || slugPart(p.title);
  const tags = p.tags ? p.tags.split(',').map((t) => t.trim()).filter(Boolean) : [];
  const status =
    p.status === 'active' ? 'active' : p.status === 'archived' ? 'discontinued' : 'inactive';

  const imageByVariant = new Map<number, string>();
  for (const img of p.images ?? []) {
    for (const vid of img.variant_ids ?? []) {
      imageByVariant.set(vid, img.src);
    }
  }

  const variants: ParsedVariant[] = (p.variants ?? []).map((v) => {
    const o1 = v.option1 && v.option1 !== 'Default Title' ? v.option1 : undefined;
    const o2 = v.option2 || undefined;
    const variantSku =
      (v.sku?.trim() || `${handle}-${slugPart(o1 || v.title || String(v.id))}`).slice(0, 100);
    return {
      option1Name: o1 ? p.options?.[0]?.name || 'Option' : undefined,
      option1Value: o1,
      option2Name: o2 ? p.options?.[1]?.name || 'Style' : undefined,
      option2Value: o2,
      variantSku,
      channelVariantId: String(v.id),
      name: v.title !== 'Default Title' ? v.title : undefined,
      price: parseNum(v.price),
      compareAtPrice: v.compare_at_price ? parseNum(v.compare_at_price) : undefined,
      inventoryQty:
        v.inventory_quantity !== undefined ? Math.max(0, v.inventory_quantity) : undefined,
      imageUrl: imageByVariant.get(v.id) || p.images?.[0]?.src,
      status
    };
  });

  const media: ParsedMedia[] = (p.images ?? [])
    .sort((a, b) => a.position - b.position)
    .map((img) => ({
      url: img.src,
      position: img.position,
      variantSku:
        variants.find((v) => imageByVariant.get(Number(v.channelVariantId)) === img.src)
          ?.variantSku
    }));

  return {
    handle,
    sku: (p.variants?.[0]?.sku?.trim() || handle).slice(0, 100),
    name: p.title,
    description: p.product_type,
    brand: p.vendor,
    productType: p.product_type,
    tags,
    status,
    variants: variants.length
      ? variants
      : [
          {
            variantSku: handle,
            channelVariantId: String(p.id),
            status
          }
        ],
    media
  };
}
