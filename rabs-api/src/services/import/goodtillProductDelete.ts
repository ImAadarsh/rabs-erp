/**
 * Delete Good Till / SumUp POS (EPOS) products via the official API.
 */

import { AppDataSource } from '@config/data-source.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import {
  GoodTillApiClient,
  type GoodTillCredentials,
  type GoodTillEcommerceProduct
} from './goodtillApiClient.js';

export type DeleteEposProductsOptions = {
  productIds?: string[];
  deleteAll?: boolean;
};

export type DeleteEposProductsResult = {
  deleted: number;
  failed: number;
  skipped: number;
  errors: Array<{ productId: string; message: string }>;
};

function collectDeleteIds(
  products: GoodTillEcommerceProduct[],
  selectedIds?: Set<string>
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();

  function push(id: string) {
    if (!id || seen.has(id)) return;
    seen.add(id);
    ids.push(id);
  }

  for (const p of products) {
    if (p.parent_product_id) continue;
    if (selectedIds && !selectedIds.has(p.product_id)) continue;

    // Delete variants before parent when present
    for (const v of p.variants ?? []) {
      push(v.product_id);
    }
    push(p.product_id);
  }

  return ids;
}

async function cleanupChannelMappings(productIds: string[]): Promise<void> {
  if (!productIds.length) return;
  try {
    const mappingRepo = AppDataSource.getRepository(ChannelMapping);
    await mappingRepo
      .createQueryBuilder()
      .delete()
      .from(ChannelMapping)
      .where('channel = :channel', { channel: 'pos' })
      .andWhere('channel_product_id IN (:...ids)', { ids: productIds })
      .execute();
  } catch {
    // Mapping cleanup is best-effort; EPOS delete already succeeded
  }
}

export async function deleteEposProducts(
  creds: GoodTillCredentials,
  opts: DeleteEposProductsOptions
): Promise<DeleteEposProductsResult> {
  const client = new GoodTillApiClient(creds);
  await client.login();

  const all = await client.getEcommerceProducts();
  const selected =
    opts.deleteAll || !opts.productIds?.length
      ? undefined
      : new Set(opts.productIds);

  if (!opts.deleteAll && (!opts.productIds || opts.productIds.length === 0)) {
    throw new Error('Select at least one product, or set deleteAll');
  }

  const ids = collectDeleteIds(all, selected);
  const result: DeleteEposProductsResult = {
    deleted: 0,
    failed: 0,
    skipped: 0,
    errors: []
  };

  if (!ids.length) {
    result.skipped = opts.productIds?.length ?? 0;
    return result;
  }

  const deletedIds: string[] = [];

  for (const productId of ids) {
    try {
      await client.deleteProduct(productId);
      result.deleted++;
      deletedIds.push(productId);
    } catch (err) {
      result.failed++;
      result.errors.push({
        productId,
        message: err instanceof Error ? err.message : 'Delete failed'
      });
    }
  }

  if (deletedIds.length) {
    await cleanupChannelMappings(deletedIds);
  }

  return result;
}
