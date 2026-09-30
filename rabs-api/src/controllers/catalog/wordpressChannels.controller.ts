import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { ProductMedia } from '@entities/catalog/ProductMedia.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { ProductImportJob } from '@entities/catalog/ProductImportJob.js';
import { encryptJson, decryptJson, maskSecret } from '@utils/credentialCrypto.js';
import {
  testWordPressConnection,
  browseWordPressProducts,
  fetchAllWordPressProducts,
  fetchWordPressProductsByIds,
  type WordPressApiCredentials
} from '@services/import/wordpressApiImport.js';
import {
  exportItemsToWordPress,
  type ExportItem,
  type ExportVariant
} from '@services/import/wordpressApiExport.js';
import { runProductImport } from '@services/import/productImportService.js';
import { summarizeProducts } from '@services/import/parserUtils.js';

// ─── Validation Schemas ───────────────────────────────────────────────────────

const createWordPressSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  storeUrl: z.string().min(1),
  authMode: z.enum(['appPassword', 'consumerKey']),
  // App password fields
  username: z.string().optional(),
  appPassword: z.string().optional(),
  // Consumer key fields
  consumerKey: z.string().optional(),
  consumerSecret: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional()
}).refine((d) => {
  if (d.authMode === 'appPassword') return d.username && d.appPassword;
  return d.consumerKey && d.consumerSecret;
}, { message: 'Credentials are required for the selected auth mode' });

const importOptionsSchema = z.object({
  organizationId: z.string(),
  businessUnitId: z.string().optional(),
  warehouseId: z.string().optional(),
  priceListId: z.string().optional(),
  duplicateMode: z.enum(['skip', 'update']).default('skip'),
  importProducts: z.coerce.boolean().default(true),
  importVariants: z.coerce.boolean().default(true),
  importInventory: z.coerce.boolean().default(true),
  importPrices: z.coerce.boolean().default(false),
  importMedia: z.coerce.boolean().default(true),
  importChannelMappings: z.coerce.boolean().default(true)
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sanitizeUrl(url: string): string {
  let u = url.trim();
  if (!u.startsWith('http')) u = `https://${u}`;
  return u.replace(/\/$/, '');
}

async function loadWordPressCredentials(
  connectionId: string,
  organizationId: string
): Promise<WordPressApiCredentials> {
  const conn = await AppDataSource.getRepository(ChannelConnection).findOne({
    where: { id: connectionId, organization: { id: organizationId }, status: 'active' },
    relations: ['organization']
  });
  if (!conn || conn.channel !== 'wordpress') {
    throw new Error('WordPress connection not found or inactive');
  }
  const raw = decryptJson<Omit<WordPressApiCredentials, 'storeUrl'>>(conn.credentialsEncrypted);
  return { storeUrl: conn.storeUrl!, ...raw };
}

function serialiseConnection(c: ChannelConnection & { organization: Organization }) {
  return {
    id: c.id,
    name: c.name,
    channel: c.channel,
    storeUrl: c.storeUrl,
    keyHint: c.keyHint,
    status: c.status,
    lastTestedAt: c.lastTestedAt,
    lastTestOk: c.lastTestOk,
    lastTestMessage: c.lastTestMessage,
    organizationId: c.organization.id,
    createdAt: c.createdAt
  };
}

// ─── Controller ───────────────────────────────────────────────────────────────

export class WordPressChannelsController {

  /** POST /catalog/channel-connections/wordpress */
  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createWordPressSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: parsed.data.organizationId }
    });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    const userId = (req as Request & { auth?: { sub?: string } }).auth?.sub;
    const user = userId
      ? await AppDataSource.getRepository(User).findOne({ where: { id: userId } })
      : null;

    const storeUrl = sanitizeUrl(parsed.data.storeUrl);
    const credsPayload: Record<string, unknown> = parsed.data.authMode === 'appPassword'
      ? { authMode: 'appPassword', username: parsed.data.username ?? '', appPassword: parsed.data.appPassword ?? '' }
      : { authMode: 'consumerKey', consumerKey: parsed.data.consumerKey ?? '', consumerSecret: parsed.data.consumerSecret ?? '' };

    const keyHint = parsed.data.authMode === 'appPassword'
      ? maskSecret(parsed.data.username ?? '')
      : maskSecret(parsed.data.consumerKey ?? '');

    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = repo.create({
      organization: org,
      name: parsed.data.name,
      channel: 'wordpress',
      storeUrl,
      shopDomain: null,
      credentialsEncrypted: encryptJson(credsPayload),
      keyHint,
      status: parsed.data.status ?? 'active',
      createdBy: user
    });
    await repo.save(conn);

    res.status(201).json({
      data: {
        id: conn.id,
        name: conn.name,
        channel: conn.channel,
        storeUrl: conn.storeUrl,
        keyHint: conn.keyHint,
        status: conn.status
      }
    });
  }

  /** POST /catalog/channel-connections/:id/test (extended to handle wordpress) */
  static async test(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = await repo.findOne({
      where: { id: req.params.id },
      relations: ['organization']
    });
    if (!conn || conn.channel !== 'wordpress') {
      res.status(404).json({ error: { message: 'WordPress connection not found' } });
      return;
    }

    try {
      const creds = await loadWordPressCredentials(conn.id, conn.organization.id);
      const { productCount, storeName } = await testWordPressConnection(creds);

      conn.lastTestedAt = new Date();
      conn.lastTestOk = true;
      conn.lastTestMessage = `Connected to "${storeName}" — ${productCount} products`;
      await repo.save(conn);

      res.json({ data: { ok: true, productCount, storeName, message: conn.lastTestMessage } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Connection test failed';
      conn.lastTestedAt = new Date();
      conn.lastTestOk = false;
      conn.lastTestMessage = message.slice(0, 500);
      await repo.save(conn);
      res.status(400).json({ error: { message } });
    }
  }

  /** GET /catalog/wordpress-channels/:connectionId/products */
  static async browseProducts(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const orgId = (req.query.organizationId as string) ?? '';
    const page = parseInt(req.query.page as string ?? '1', 10);
    const perPage = Math.min(parseInt(req.query.perPage as string ?? '50', 10), 100);
    const search = req.query.search as string | undefined;
    const status = req.query.status as string | undefined;
    const type = req.query.type as string | undefined;
    const stockStatus = req.query.stockStatus as string | undefined;
    const minPrice = req.query.minPrice as string | undefined;
    const maxPrice = req.query.maxPrice as string | undefined;
    const orderby = (req.query.orderby as string | undefined) ?? 'date';
    const order = (req.query.order as string | undefined) ?? 'desc';
    const category = req.query.category as string | undefined;

    try {
      const creds = await loadWordPressCredentials(connectionId, orgId);
      const { products, total, totalPages } = await browseWordPressProducts(creds, {
        page, perPage, search, status, type, stockStatus, minPrice, maxPrice, orderby, order, category
      });
      res.json({
        data: products,
        pagination: { page, perPage, total, totalPages }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch WordPress products';
      res.status(400).json({ error: { message } });
    }
  }

  /** POST /catalog/wordpress-channels/:connectionId/import */
  static async importProducts(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const body = req.body as {
      organizationId: string;
      productIds?: number[];
      importAll?: boolean;
      options?: Record<string, unknown>;
    };

    const optionsParsed = importOptionsSchema.safeParse({ ...body, ...(body.options ?? {}) });
    if (!optionsParsed.success) {
      res.status(400).json({ error: { message: 'Invalid options', details: optionsParsed.error.issues } });
      return;
    }

    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: body.organizationId }
    });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    const userId = (req as Request & { auth?: { sub?: string } }).auth?.sub;
    const user = userId
      ? await AppDataSource.getRepository(User).findOne({ where: { id: userId } })
      : null;

    const jobRepo = AppDataSource.getRepository(ProductImportJob);
    const job = jobRepo.create({
      organization: org,
      createdBy: user,
      sourceType: 'wordpress_api' as any,
      channel: 'wordpress',
      fileName: `WP import – ${new Date().toISOString().slice(0, 10)}`,
      status: 'processing',
      options: optionsParsed.data as unknown as Record<string, unknown>
    });
    await jobRepo.save(job);

    try {
      const creds = await loadWordPressCredentials(connectionId, body.organizationId);
      const products = body.importAll || !body.productIds?.length
        ? await fetchAllWordPressProducts(creds)
        : await fetchWordPressProductsByIds(creds, body.productIds!);

      const summary = await runProductImport(products, optionsParsed.data, 'wordpress');

      job.status = 'completed';
      job.summary = { ...summary, productCount: products.length };
      await jobRepo.save(job);

      res.json({ data: { jobId: job.id, status: job.status, summary } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Import failed';
      job.status = 'failed';
      job.errorMessage = message;
      await jobRepo.save(job);
      res.status(500).json({ error: { message, jobId: job.id } });
    }
  }

  /** POST /catalog/wordpress-channels/:connectionId/export */
  static async exportProducts(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const body = req.body as {
      organizationId: string;
      catalogItemIds?: string[];
      exportAll?: boolean;
      duplicateMode?: 'skip' | 'update';
    };

    if (!body.organizationId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    try {
      const creds = await loadWordPressCredentials(connectionId, body.organizationId);

      const itemRepo = AppDataSource.getRepository(CatalogItem);
      const qb = itemRepo
        .createQueryBuilder('ci')
        .leftJoinAndSelect('ci.variants', 'v', 'v.deleted_at IS NULL')
        .leftJoinAndSelect('ci.media', 'm')
        .where('ci.organization_id = :orgId', { orgId: body.organizationId })
        .andWhere('ci.deleted_at IS NULL');

      if (!body.exportAll && body.catalogItemIds?.length) {
        qb.andWhere('ci.id IN (:...ids)', { ids: body.catalogItemIds });
      }

      const items = await qb.getMany();

      const exportItems: ExportItem[] = items.map((ci) => ({
        id: ci.id,
        sku: ci.sku,
        name: ci.name,
        description: ci.description,
        category: ci.category,
        brand: ci.brand,
        status: ci.status,
        weightValue: ci.weightValue != null ? Number(ci.weightValue) : null,
        weightUnit: ci.weightUnit,
        imageUrls: ci.media.map((m: ProductMedia) => m.url).filter(Boolean),
        variants: ci.variants.map((v: Variant): ExportVariant => ({
          sku: v.variantSku,
          name: v.name ?? undefined,
          price: v.costPrice != null ? Number(v.costPrice) : undefined,
          option1Name: v.option1Name ?? undefined,
          option1Value: v.option1Value ?? undefined,
          option2Name: v.option2Name ?? undefined,
          option2Value: v.option2Value ?? undefined,
          imageUrl: v.imageUrl ?? undefined,
          status: v.status
        }))
      }));

      const result = await exportItemsToWordPress(
        creds,
        exportItems,
        { duplicateMode: body.duplicateMode ?? 'skip' }
      );

      // Save channel mappings for newly created WC products
      if (result.channelMappings.length > 0) {
        const mappingRepo = AppDataSource.getRepository(ChannelMapping);
        for (const m of result.channelMappings) {
          const existing = await mappingRepo.findOne({
            where: {
              catalogItem: { id: m.catalogItemId },
              channel: 'wordpress',
              channelProductId: m.externalId
            }
          });
          if (!existing) {
            await mappingRepo.save(mappingRepo.create({
              catalogItem: { id: m.catalogItemId } as CatalogItem,
              variant: null,
              channel: 'wordpress',
              channelProductId: m.externalId,
              channelVariantId: null,
              syncEnabled: true,
              syncStatus: 'synced'
            }));
          }
        }
      }

      res.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      res.status(500).json({ error: { message } });
    }
  }

  /** GET /catalog/wordpress-channels/:connectionId/preview-export */
  static async previewExport(req: Request, res: Response): Promise<void> {
    const orgId = req.query.organizationId as string;
    const ids = req.query.catalogItemIds as string | undefined;

    if (!orgId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    const itemRepo = AppDataSource.getRepository(CatalogItem);
    const qb = itemRepo
      .createQueryBuilder('ci')
      .select(['ci.id', 'ci.sku', 'ci.name', 'ci.status', 'ci.category'])
      .where('ci.organization_id = :orgId', { orgId })
      .andWhere('ci.deleted_at IS NULL');

    if (ids) {
      const idList = ids.split(',').map((s) => s.trim()).filter(Boolean);
      if (idList.length) {
        qb.andWhere('ci.id IN (:...ids)', { ids: idList });
      }
    }

    const items = await qb.getMany();
    res.json({
      data: {
        totalItems: items.length,
        items: items.map((ci) => ({ id: ci.id, sku: ci.sku, name: ci.name, status: ci.status, category: ci.category }))
      }
    });
  }

  /**
   * POST /catalog/wordpress-channels/:connectionId/sync-status
   * Body: { organizationId, wcProductIds: number[] }
   * Returns map of wcProductId → { inErp, catalogItemId?, lastSynced? }
   */
  static async syncStatus(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const { organizationId, wcProductIds } = req.body as {
      organizationId: string;
      wcProductIds: number[];
    };

    if (!organizationId || !Array.isArray(wcProductIds) || !wcProductIds.length) {
      res.status(400).json({ error: { message: 'organizationId and wcProductIds[] are required' } });
      return;
    }

    const mapRepo = AppDataSource.getRepository(ChannelMapping);
    const mappings = await mapRepo
      .createQueryBuilder('cm')
      .leftJoin('cm.catalogItem', 'ci')
      .select(['cm.channelProductId', 'cm.channelVariantId', 'cm.lastSyncedAt', 'ci.id', 'ci.sku', 'ci.name'])
      .where('cm.channel = :ch', { ch: 'wordpress' })
      .andWhere('ci.organization_id = :orgId', { orgId: organizationId })
      .andWhere('cm.channelVariantId IS NOT NULL')
      .getMany();

    const result: Record<number, { inErp: boolean; catalogItemId?: string; sku?: string; name?: string; lastSynced?: string }> = {};
    for (const id of wcProductIds) {
      const match = mappings.find((m) => m.channelVariantId === String(id) || m.channelProductId === String(id));
      result[id] = match
        ? {
            inErp: true,
            catalogItemId: (match as any).ci_id ?? undefined,
            sku: (match as any).ci_sku ?? undefined,
            name: (match as any).ci_name ?? undefined,
            lastSynced: match.lastSyncedAt?.toISOString()
          }
        : { inErp: false };
    }

    res.json({ data: result });
  }

  /**
   * GET /catalog/wordpress-channels/:connectionId/sync-health
   * Returns dashboard stats: wpTotal, erpMapped, lastSync, jobHistory
   */
  static async syncHealth(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const orgId = req.query.organizationId as string;

    if (!orgId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    try {
      // Count mappings for this connection's channel
      const mapRepo = AppDataSource.getRepository(ChannelMapping);
      const erpMapped = await mapRepo
        .createQueryBuilder('cm')
        .leftJoin('cm.catalogItem', 'ci')
        .where('cm.channel = :ch', { ch: 'wordpress' })
        .andWhere('ci.organization_id = :orgId', { orgId })
        .getCount();

      // Last sync time
      const lastMapping = await mapRepo
        .createQueryBuilder('cm')
        .leftJoin('cm.catalogItem', 'ci')
        .where('cm.channel = :ch', { ch: 'wordpress' })
        .andWhere('ci.organization_id = :orgId', { orgId })
        .orderBy('cm.lastSyncedAt', 'DESC')
        .getOne();

      // Recent import jobs
      const jobRepo = AppDataSource.getRepository(ProductImportJob);
      const recentJobs = await jobRepo.find({
        where: { organization: { id: orgId }, sourceType: 'wordpress_api' },
        order: { createdAt: 'DESC' },
        take: 5
      });

      // Get WP product count from connection test
      const creds = await loadWordPressCredentials(connectionId, orgId);
      const { productCount } = await testWordPressConnection(creds);

      res.json({
        data: {
          wpTotal: productCount,
          erpMapped,
          lastSync: lastMapping?.lastSyncedAt ?? null,
          recentJobs: recentJobs.map((j) => ({
            id: j.id,
            status: j.status,
            summary: j.summary ? JSON.parse(j.summary as unknown as string) : null,
            createdAt: j.createdAt
          }))
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch sync health';
      res.status(400).json({ error: { message } });
    }
  }

  /**
   * POST /catalog/wordpress-channels/:connectionId/push-prices
   * Body: { organizationId, catalogItemIds?: string[], pushAll?: boolean }
   * Reads ERP cost prices and stock, pushes to WooCommerce.
   */
  static async pushPrices(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const { organizationId, catalogItemIds, pushAll } = req.body as {
      organizationId: string;
      catalogItemIds?: string[];
      pushAll?: boolean;
    };

    if (!organizationId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    try {
      const creds = await loadWordPressCredentials(connectionId, organizationId);
      const baseUrl = (creds.storeUrl.endsWith('/') ? creds.storeUrl.slice(0, -1) : creds.storeUrl) + '/wp-json/wc/v3';
      const auth = Buffer.from(
        creds.authMode === 'appPassword'
          ? `${creds.username}:${creds.appPassword}`
          : `${creds.consumerKey}:${creds.consumerSecret}`
      ).toString('base64');
      const headers = { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' };

      const mapRepo = AppDataSource.getRepository(ChannelMapping);
      const varRepo = AppDataSource.getRepository(Variant);

      const qb = mapRepo
        .createQueryBuilder('cm')
        .leftJoinAndSelect('cm.catalogItem', 'ci')
        .leftJoinAndSelect('cm.variant', 'v')
        .where('cm.channel = :ch', { ch: 'wordpress' })
        .andWhere('ci.organization_id = :orgId', { orgId: organizationId });

      if (!pushAll && catalogItemIds?.length) {
        qb.andWhere('ci.id IN (:...ids)', { ids: catalogItemIds });
      }

      const mappings = await qb.getMany();

      let pushed = 0;
      let errors = 0;
      const errs: string[] = [];

      for (const mapping of mappings) {
        const variant = mapping.variant;
        if (!variant?.costPrice) continue;
        const wcVariantId = mapping.channelVariantId;
        const wcProductId = mapping.channelProductId;
        if (!wcVariantId || !wcProductId) continue;

        try {
          // Try as variation first, then as simple product
          const isVariation = wcVariantId !== wcProductId;
          const url = isVariation
            ? `${baseUrl}/products/${wcProductId}/variations/${wcVariantId}`
            : `${baseUrl}/products/${wcProductId}`;

          const resp = await fetch(url, {
            method: 'PUT',
            headers,
            body: JSON.stringify({ regular_price: String(variant.costPrice) })
          });
          if (resp.ok) pushed++;
          else { errors++; errs.push(`WC ${wcVariantId}: ${resp.status}`); }
        } catch (e) {
          errors++;
          errs.push(String(e));
        }
      }

      res.json({ data: { pushed, errors, errorDetails: errs.slice(0, 10) } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Push failed';
      res.status(400).json({ error: { message } });
    }
  }
}
