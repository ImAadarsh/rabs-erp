import type { ImportSourceType } from './types.js';
import type { ParsedProduct } from './types.js';
import { parseShopifyProductsCsv } from './shopifyCsvParser.js';
import { parseWooCommerceProductsCsv, isWooCommerceExportCsv } from './woocommerceCsvParser.js';
import { parseWordpressProductsCsv } from './wordpressCsvParser.js';
import { normalizeHeader } from './parserUtils.js';

export function parseProductsBySource(csvText: string, sourceType: ImportSourceType): ParsedProduct[] {
  switch (sourceType) {
    case 'shopify_csv':
      return parseShopifyProductsCsv(csvText);
    case 'woocommerce_csv':
      return parseWooCommerceProductsCsv(csvText);
    case 'wordpress_csv':
      return parseWordpressProductsCsv(csvText);
    default:
      throw new Error(`CSV source "${sourceType}" is not supported`);
  }
}

/** Guess source from CSV headers when user picks wrong type. */
export function detectCsvSourceType(csvText: string): ImportSourceType | null {
  const firstLine = csvText.split(/\r?\n/)[0] ?? '';
  const headers = firstLine.split(',').map((h) => normalizeHeader(h.replace(/^"|"$/g, '')));

  if (headers.includes('handle') && (headers.includes('variant price') || headers.includes('option1 value'))) {
    return 'shopify_csv';
  }
  if (isWooCommerceExportCsv(csvText)) {
    return 'woocommerce_csv';
  }
  if (
    headers.some((h) => ['title', 'name', 'product name'].includes(h)) &&
    headers.some((h) => h.includes('sku') || h.includes('price'))
  ) {
    return 'wordpress_csv';
  }
  return null;
}
