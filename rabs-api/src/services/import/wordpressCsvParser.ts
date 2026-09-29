import { parseCsv, csvRowsToObjects } from '@utils/csv.js';
import type { ParsedProduct, ParsedVariant, ParsedMedia } from './types.js';
import {
  slugPart,
  parseNum,
  parseIntQty,
  parseImageList,
  mapPublishedFlag,
  rowGet,
  normalizeHeader
} from './parserUtils.js';
import { parseWooCommerceProductsCsv, isWooCommerceExportCsv } from './woocommerceCsvParser.js';

type WpRow = Record<string, string>;

/** Generic WordPress / plugin export (Title, SKU, Price, Stock, Image). */
function parseSimpleWordpressCsv(csvText: string): ParsedProduct[] {
  const rows = parseCsv(csvText);
  const objects = csvRowsToObjects<WpRow>(rows);
  const products: ParsedProduct[] = [];

  for (const row of objects) {
    const name = rowGet(row, 'Title', 'Name', 'Product Name', 'Product');
    if (!name) continue;

    const sku = rowGet(row, 'SKU', 'Sku', 'Product SKU') || slugPart(name);
    const handle = slugPart(sku || name);
    const price =
      parseNum(rowGet(row, 'Price', 'Regular price', 'Regular Price', 'Sale Price')) ??
      parseNum(rowGet(row, 'Cost'));
    const qty = parseIntQty(
      rowGet(row, 'Stock', 'Stock quantity', 'Quantity', 'Qty', 'Inventory')
    );
    const images = parseImageList(
      rowGet(row, 'Images', 'Image', 'Image URL', 'Featured image', 'Picture')
    );
    const category = rowGet(row, 'Categories', 'Category')?.split(',')[0]?.trim();
    const tags = rowGet(row, 'Tags')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const published = rowGet(row, 'Published', 'Status', 'Visibility');
    const variantSku = sku.slice(0, 100);

    const media: ParsedMedia[] = images.map((url, i) => ({
      url,
      position: i + 1,
      variantSku: i === 0 ? variantSku : undefined
    }));

    products.push({
      handle,
      sku: sku.slice(0, 100),
      name,
      description: rowGet(row, 'Description', 'Short description', 'Excerpt') || undefined,
      category,
      tags,
      status: mapPublishedFlag(published),
      variants: [
        {
          variantSku,
          channelVariantId: rowGet(row, 'ID', 'id') || variantSku,
          name: 'Default',
          price,
          inventoryQty: qty,
          imageUrl: images[0],
          status: mapPublishedFlag(published)
        }
      ],
      media
    });
  }

  return products;
}

export function parseWordpressProductsCsv(csvText: string): ParsedProduct[] {
  if (isWooCommerceExportCsv(csvText)) {
    return parseWooCommerceProductsCsv(csvText);
  }
  return parseSimpleWordpressCsv(csvText);
}

export function isWordpressSimpleExportCsv(csvText: string): boolean {
  const headers = (csvText.split(/\r?\n/)[0] ?? '')
    .split(',')
    .map((h) => normalizeHeader(h.replace(/^"|"$/g, '')));
  const hasName = headers.some((h) =>
    ['title', 'name', 'product name', 'product'].includes(h)
  );
  const hasSku = headers.some((h) => h.includes('sku'));
  return hasName && (hasSku || headers.some((h) => h.includes('price')));
}
