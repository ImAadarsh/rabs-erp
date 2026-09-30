import type { ParsedProduct } from './types.js';

export function slugPart(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80) || 'default';
}

export function parseNum(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = parseFloat(value.replace(/,/g, '').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : undefined;
}

export function parseIntQty(value: string | undefined): number | undefined {
  if (!value?.trim()) return undefined;
  const n = parseInt(value.replace(/,/g, ''), 10);
  return Number.isFinite(n) ? n : undefined;
}

/** Pipe- or comma-separated image URLs (WooCommerce uses comma between URLs). */
export function parseImageList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,|]/)
    .map((u) => u.trim())
    .filter((u) => u.startsWith('http'));
}

export function mapPublishedFlag(published: string | undefined): 'active' | 'inactive' | 'discontinued' {
  const p = (published ?? '').toLowerCase().trim();
  if (p === '0' || p === 'no' || p === 'false' || p === 'draft' || p === 'private') return 'inactive';
  return 'active';
}

export function summarizeProducts(products: ParsedProduct[], sampleSize = 10) {
  const variantCount = products.reduce((n, p) => n + p.variants.length, 0);
  const mediaCount = products.reduce((n, p) => n + p.media.length, 0);
  return {
    productCount: products.length,
    variantCount,
    mediaCount,
    sampleProducts: products.slice(0, sampleSize)
  };
}

export function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, ' ');
}

export function rowGet(row: Record<string, string>, ...keys: string[]): string {
  for (const key of keys) {
    const v = row[key];
    if (v?.trim()) return v.trim();
  }
  const lower = Object.fromEntries(
    Object.entries(row).map(([k, v]) => [normalizeHeader(k), v])
  );
  for (const key of keys) {
    const v = lower[normalizeHeader(key)];
    if (v?.trim()) return v.trim();
  }
  return '';
}
