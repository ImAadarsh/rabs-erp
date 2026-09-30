import { parseCsv, csvRowsToObjects } from '@utils/csv.js';
import type { ParsedProduct, ParsedVariant, ParsedMedia } from './types.js';
import {
  slugPart,
  parseNum,
  parseIntQty,
  parseImageList,
  mapPublishedFlag,
  rowGet
} from './parserUtils.js';

type WcRow = Record<string, string>;

function productHandle(row: WcRow, id: string): string {
  const sku = rowGet(row, 'SKU');
  if (sku) return slugPart(sku);
  const name = rowGet(row, 'Name');
  if (name) return slugPart(name);
  return `wc-${id}`;
}

function buildVariantSku(parentHandle: string, suffix: string): string {
  return `${parentHandle}-${slugPart(suffix)}`.slice(0, 100);
}

function rowToVariant(
  row: WcRow,
  parentHandle: string,
  parentName: string,
  option1Name?: string,
  option2Name?: string
): ParsedVariant {
  const sku = rowGet(row, 'SKU') || buildVariantSku(parentHandle, rowGet(row, 'ID') || 'default');
  const o1 = rowGet(row, 'Attribute 1 value(s)', 'Attribute 1 values');
  const o2 = rowGet(row, 'Attribute 2 value(s)', 'Attribute 2 values');
  const price = parseNum(rowGet(row, 'Regular price')) ?? parseNum(rowGet(row, 'Sale price'));
  const compareAt = rowGet(row, 'Sale price') ? parseNum(rowGet(row, 'Regular price')) : undefined;
  const stockRaw = rowGet(row, 'Stock', 'Stock quantity');
  let inventoryQty = parseIntQty(stockRaw);
  if (inventoryQty === undefined && rowGet(row, 'In stock?').toLowerCase() === '1') {
    inventoryQty = 0;
  }
  const images = parseImageList(rowGet(row, 'Images'));
  const channelVariantId = rowGet(row, 'ID') || sku;

  return {
    option1Name: o1 ? option1Name || rowGet(row, 'Attribute 1 name') || 'Option' : undefined,
    option1Value: o1 || undefined,
    option2Name: o2 ? option2Name || rowGet(row, 'Attribute 2 name') || 'Option 2' : undefined,
    option2Value: o2 || undefined,
    variantSku: sku.slice(0, 100),
    channelVariantId,
    name: o1 && o2 ? `${o1} / ${o2}` : o1 || parentName,
    price,
    compareAtPrice: compareAt,
    inventoryQty,
    imageUrl: images[0],
    status: mapPublishedFlag(rowGet(row, 'Published'))
  };
}

function mediaFromRow(row: WcRow, parentHandle: string, variantSku?: string): ParsedMedia[] {
  const urls = parseImageList(rowGet(row, 'Images'));
  return urls.map((url, i) => ({
    url,
    position: i + 1,
    variantSku
  }));
}

export function parseWooCommerceProductsCsv(csvText: string): ParsedProduct[] {
  const rows = parseCsv(csvText);
  const objects = csvRowsToObjects<WcRow>(rows);
  if (!objects.length) return [];

  const byId = new Map<string, WcRow>();
  for (const row of objects) {
    const id = rowGet(row, 'ID');
    if (id) byId.set(id, row);
  }

  const variationRows: WcRow[] = [];
  const parentRows: WcRow[] = [];

  for (const row of objects) {
    const type = rowGet(row, 'Type').toLowerCase();
    const parent = rowGet(row, 'Parent');
    if (type === 'variation' || parent) {
      variationRows.push(row);
    } else if (type === 'simple' || type === 'variable' || type === '' || type === 'grouped') {
      if (type !== 'grouped') parentRows.push(row);
    } else if (type !== 'external' && type !== 'bundle') {
      parentRows.push(row);
    }
  }

  const products: ParsedProduct[] = [];

  for (const parent of parentRows) {
    const id = rowGet(parent, 'ID');
    const type = rowGet(parent, 'Type').toLowerCase();
    const handle = productHandle(parent, id);
    const name = rowGet(parent, 'Name') || handle;
    const tags = rowGet(parent, 'Tags')
      .split(',')
      .map((t) => t.trim())
      .filter(Boolean);
    const category = rowGet(parent, 'Categories').split(',')[0]?.trim();
    const opt1Name = rowGet(parent, 'Attribute 1 name') || 'Option';
    const opt2Name = rowGet(parent, 'Attribute 2 name') || 'Style';

    const variants: ParsedVariant[] = [];
    const media: ParsedMedia[] = [];
    const seenMedia = new Set<string>();

    const childVariations = variationRows.filter((v) => {
      const p = rowGet(v, 'Parent');
      return p === id || p === rowGet(parent, 'SKU');
    });

    if (type === 'variable' && childVariations.length > 0) {
      for (const child of childVariations) {
        const variant = rowToVariant(child, handle, name, opt1Name, opt2Name);
        variants.push(variant);
        for (const m of mediaFromRow(child, handle, variant.variantSku)) {
          if (!seenMedia.has(m.url)) {
            seenMedia.add(m.url);
            media.push(m);
          }
        }
      }
    } else {
      const variant = rowToVariant(parent, handle, name, opt1Name, opt2Name);
      variants.push(variant);
      for (const m of mediaFromRow(parent, handle, variant.variantSku)) {
        if (!seenMedia.has(m.url)) {
          seenMedia.add(m.url);
          media.push(m);
        }
      }
    }

    if (variants.length === 0) {
      variants.push({
        variantSku: (rowGet(parent, 'SKU') || `${handle}-default`).slice(0, 100),
        channelVariantId: id || handle,
        name: 'Default',
        price: parseNum(rowGet(parent, 'Regular price')),
        inventoryQty: parseIntQty(rowGet(parent, 'Stock')),
        status: mapPublishedFlag(rowGet(parent, 'Published'))
      });
    }

    const parentSku = (rowGet(parent, 'SKU') || handle).slice(0, 100);
    products.push({
      handle,
      sku: parentSku,
      name,
      description: rowGet(parent, 'Short description') || undefined,
      category: category || undefined,
      brand: undefined,
      productType: type || 'simple',
      tags,
      status: mapPublishedFlag(rowGet(parent, 'Published')),
      variants,
      media: media.sort((a, b) => a.position - b.position)
    });
  }

  return products;
}

/** Detect WooCommerce product export from header row. */
export function isWooCommerceExportCsv(csvText: string): boolean {
  const firstLine = csvText.split(/\r?\n/)[0]?.toLowerCase() ?? '';
  return (
    firstLine.includes('regular price') &&
    (firstLine.includes('type') || firstLine.includes('sku')) &&
    firstLine.includes('name')
  );
}
