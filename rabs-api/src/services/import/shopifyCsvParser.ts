import { parseCsv, csvRowsToObjects } from '@utils/csv.js';
import type { ParsedProduct, ParsedVariant, ParsedMedia } from './types.js';
import { slugPart, parseNum } from './parserUtils.js';

type ShopifyRow = Record<string, string>;

function mapStatus(status: string, published: string): 'active' | 'inactive' | 'discontinued' {
  const s = (status || '').toLowerCase();
  if (s === 'archived' || s === 'draft') return 'inactive';
  if (published?.toUpperCase() === 'FALSE') return 'inactive';
  return 'active';
}

function buildVariantSku(handle: string, o1?: string, o2?: string): string {
  const parts = [handle];
  if (o1 && o1.toLowerCase() !== 'default title') parts.push(slugPart(o1));
  if (o2) parts.push(slugPart(o2));
  return parts.join('-').slice(0, 100);
}

export function parseShopifyProductsCsv(csvText: string): ParsedProduct[] {
  const rows = parseCsv(csvText);
  const objects = csvRowsToObjects<ShopifyRow>(rows);
  const byHandle = new Map<string, ShopifyRow[]>();

  for (const row of objects) {
    const handle = row.Handle?.trim();
    if (!handle) continue;
    if (!byHandle.has(handle)) byHandle.set(handle, []);
    byHandle.get(handle)!.push(row);
  }

  const products: ParsedProduct[] = [];

  for (const [handle, group] of byHandle) {
    const master =
      group.find((r) => r.Title?.trim()) ??
      group[0];

    const name = master.Title?.trim() || handle;
    const tags = master.Tags
      ? master.Tags.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const variants: ParsedVariant[] = [];
    const media: ParsedMedia[] = [];
    const seenMedia = new Set<string>();

    const option1Name = master['Option1 Name']?.trim() || 'Option';
    const option2Name = master['Option2 Name']?.trim() || 'Style';

    for (const row of group) {
      const o1 = row['Option1 Value']?.trim();
      const o2 = row['Option2 Value']?.trim();
      const price = parseNum(row['Variant Price']);
      const qty = parseNum(row['Variant Inventory Qty']);
      const compareAt = parseNum(row['Variant Compare At Price']);
      const imageSrc = row['Image Src']?.trim();
      const imagePos = parseInt(row['Image Position'] || '0', 10) || 0;

      const isVariantRow =
        Boolean(o1 || o2) && (price !== undefined || qty !== undefined);

      if (isVariantRow) {
        const variantSku = buildVariantSku(handle, o1, o2);
        const channelVariantId = [handle, o1, o2].filter(Boolean).join('|');
        const existing = variants.find((v) => v.variantSku === variantSku);
        if (!existing) {
          variants.push({
            option1Name: o1 ? option1Name : undefined,
            option1Value: o1 || undefined,
            option2Name: o2 ? option2Name : undefined,
            option2Value: o2 || undefined,
            variantSku,
            channelVariantId,
            name: o1 && o2 ? `${o1} / ${o2}` : o1 || o2 || name,
            price,
            compareAtPrice: compareAt,
            inventoryQty: qty !== undefined ? Math.floor(qty) : undefined,
            imageUrl: imageSrc || undefined,
            status: mapStatus(row.Status || master.Status, row.Published || master.Published)
          });
        } else if (imageSrc && !existing.imageUrl) {
          existing.imageUrl = imageSrc;
        }
      }

      if (imageSrc && !seenMedia.has(imageSrc)) {
        seenMedia.add(imageSrc);
        media.push({
          url: imageSrc,
          position: imagePos || media.length + 1,
          variantSku: isVariantRow ? buildVariantSku(handle, o1, o2) : undefined
        });
      }
    }

    if (variants.length === 0) {
      const price = parseNum(master['Variant Price']);
      const qty = parseNum(master['Variant Inventory Qty']);
      variants.push({
        variantSku: buildVariantSku(handle, 'default'),
        channelVariantId: handle,
        name: 'Default',
        option1Name: 'Title',
        option1Value: 'Default Title',
        price,
        compareAtPrice: parseNum(master['Variant Compare At Price']),
        inventoryQty: qty !== undefined ? Math.floor(qty) : undefined,
        imageUrl: master['Image Src']?.trim(),
        status: mapStatus(master.Status, master.Published)
      });
    }

    products.push({
      handle,
      sku: handle.slice(0, 100),
      name,
      description: master.Type || undefined,
      category: master['Product Category']?.trim() || undefined,
      brand: master.Vendor?.trim() || undefined,
      productType: master.Type?.trim(),
      tags,
      status: mapStatus(master.Status, master.Published),
      variants,
      media: media.sort((a, b) => a.position - b.position)
    });
  }

  return products;
}
