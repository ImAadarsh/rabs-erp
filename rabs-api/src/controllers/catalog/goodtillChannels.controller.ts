import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { ChannelConnection } from '@entities/catalog/ChannelConnection.js';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Barcode } from '@entities/catalog/Barcode.js';
import { PriceListItem } from '@entities/catalog/PriceListItem.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { ProductImportJob } from '@entities/catalog/ProductImportJob.js';
import { In } from 'typeorm';
import { encryptJson, decryptJson, maskSecret } from '@utils/credentialCrypto.js';
import { generateBarcodeFromSku } from '@utils/barcodeGenerator.js';
import {
  generateEposProductBarcodes,
  renderBarcodePngDataUrl
} from '@services/import/goodtillBarcodeService.js';
import {
  browseGoodTillProducts,
  fetchAllGoodTillProducts,
  fetchGoodTillProductsByIds,
  type GoodTillCredentials
} from '@services/import/goodtillApiImport.js';
import {
  exportItemsToGoodTill,
  type GoodTillExportItem,
  type GoodTillExportVariant
} from '@services/import/goodtillApiExport.js';
import { GoodTillApiClient } from '@services/import/goodtillApiClient.js';
import { deleteEposProducts } from '@services/import/goodtillProductDelete.js';
import { runProductImport } from '@services/import/productImportService.js';
import { summarizeProducts } from '@services/import/parserUtils.js';

const createGoodTillSchema = z.object({
  organizationId: z.string().min(1),
  name: z.string().min(1),
  subdomain: z.string().min(1),
  username: z.string().min(1),
  password: z.string().min(1),
  outletId: z.string().optional(),
  defaultVatCodeId: z.string().optional(),
  status: z.enum(['active', 'inactive']).optional()
});

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
  importMedia: z.coerce.boolean().default(false),
  importChannelMappings: z.coerce.boolean().default(true)
});

async function loadGoodTillCredentials(
  connectionId: string,
  organizationId: string
): Promise<GoodTillCredentials> {
  const conn = await AppDataSource.getRepository(ChannelConnection).findOne({
    where: { id: connectionId, organization: { id: organizationId }, status: 'active' },
    relations: ['organization']
  });
  if (!conn || conn.channel !== 'goodtill') {
    throw new Error('Good Till connection not found or inactive');
  }
  const raw = decryptJson<Omit<GoodTillCredentials, never>>(conn.credentialsEncrypted);
  return raw;
}

function serialiseConnection(c: ChannelConnection & { organization: Organization }) {
  const creds = decryptJson<{ subdomain?: string; outletId?: string; defaultVatCodeId?: string }>(
    c.credentialsEncrypted
  );
  return {
    id: c.id,
    name: c.name,
    channel: c.channel,
    subdomain: creds.subdomain ?? c.shopDomain,
    outletId: creds.outletId ?? null,
    defaultVatCodeId: creds.defaultVatCodeId ?? null,
    keyHint: c.keyHint,
    status: c.status,
    lastTestedAt: c.lastTestedAt,
    lastTestOk: c.lastTestOk,
    lastTestMessage: c.lastTestMessage,
    organizationId: c.organization.id,
    createdAt: c.createdAt
  };
}

export class GoodTillChannelsController {
  /** POST /catalog/channel-connections/goodtill */
  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createGoodTillSchema.safeParse(req.body);
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

    const credsPayload: GoodTillCredentials = {
      subdomain: parsed.data.subdomain.trim(),
      username: parsed.data.username.trim(),
      password: parsed.data.password,
      outletId: parsed.data.outletId,
      defaultVatCodeId: parsed.data.defaultVatCodeId
    };

    const repo = AppDataSource.getRepository(ChannelConnection);
    const conn = repo.create({
      organization: org,
      name: parsed.data.name,
      channel: 'goodtill',
      storeUrl: `https://${parsed.data.subdomain.trim().toLowerCase()}.thegoodtill.com`,
      shopDomain: parsed.data.subdomain.trim(),
      credentialsEncrypted: encryptJson({ ...credsPayload }),
      keyHint: maskSecret(parsed.data.username),
      status: parsed.data.status ?? 'active',
      createdBy: user
    });
    await repo.save(conn);

    res.status(201).json({
      data: {
        id: conn.id,
        name: conn.name,
        channel: conn.channel,
        subdomain: parsed.data.subdomain,
        keyHint: conn.keyHint,
        status: conn.status
      }
    });
  }

  /** GET /catalog/epos-channels/:connectionId/vat-rates */
  static async listVatRates(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const orgId = req.query.organizationId as string;
    if (!orgId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    try {
      const creds = await loadGoodTillCredentials(connectionId, orgId);
      const client = new GoodTillApiClient(creds);
      await client.login();
      const rates = await client.getVatRates();
      res.json({ data: rates.filter((r) => r.active === 1) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch VAT rates';
      res.status(400).json({ error: { message } });
    }
  }

  /** GET /catalog/epos-channels/:connectionId/products */
  static async browseProducts(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const orgId = req.query.organizationId as string;
    if (!orgId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    const page = parseInt(String(req.query.page ?? '1'), 10) || 1;
    const perPage = parseInt(String(req.query.perPage ?? '25'), 10) || 25;
    const search = req.query.search as string | undefined;

    try {
      const creds = await loadGoodTillCredentials(connectionId, orgId);
      const { products, total, totalPages } = await browseGoodTillProducts(creds, {
        page,
        perPage,
        search
      });
      res.json({
        data: products,
        pagination: { page, perPage, total, totalPages }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch EPOS products';
      res.status(400).json({ error: { message } });
    }
  }

  /** POST /catalog/epos-channels/:connectionId/import */
  static async importProducts(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const body = req.body as {
      organizationId: string;
      productIds?: string[];
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
      sourceType: 'goodtill_api',
      channel: 'goodtill',
      fileName: `EPOS import – ${new Date().toISOString().slice(0, 10)}`,
      status: 'processing',
      options: optionsParsed.data as unknown as Record<string, unknown>
    });
    await jobRepo.save(job);

    try {
      const creds = await loadGoodTillCredentials(connectionId, body.organizationId);
      const products =
        body.importAll || !body.productIds?.length
          ? await fetchAllGoodTillProducts(creds)
          : await fetchGoodTillProductsByIds(creds, body.productIds!);

      const summary = await runProductImport(products, optionsParsed.data, 'goodtill');

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

  /** POST /catalog/epos-channels/:connectionId/export */
  static async exportProducts(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const body = req.body as {
      organizationId: string;
      catalogItemIds?: string[];
      exportAll?: boolean;
      mode?: 'push' | 'sync';
      duplicateMode?: 'skip' | 'update';
      vatCodeId?: string;
      priceListId?: string;
      warehouseId?: string;
      generateBarcodes?: boolean;
    };

    if (!body.organizationId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    try {
      const creds = await loadGoodTillCredentials(connectionId, body.organizationId);
      const vatCodeId = body.vatCodeId ?? creds.defaultVatCodeId;
      if (!vatCodeId) {
        res.status(400).json({
          error: {
            message:
              'vatCodeId is required (select a VAT rate or set a default on the connection)'
          }
        });
        return;
      }

      const mode: 'push' | 'sync' =
        body.mode === 'push' || body.mode === 'sync'
          ? body.mode
          : body.duplicateMode === 'update'
            ? 'sync'
            : 'push';

      const itemRepo = AppDataSource.getRepository(CatalogItem);
      const qb = itemRepo
        .createQueryBuilder('ci')
        .leftJoinAndSelect('ci.variants', 'v', 'v.deleted_at IS NULL')
        .where('ci.organization_id = :orgId', { orgId: body.organizationId })
        .andWhere('ci.deleted_at IS NULL')
        .andWhere('ci.status = :status', { status: 'active' });

      if (!body.exportAll && body.catalogItemIds?.length) {
        qb.andWhere('ci.id IN (:...ids)', { ids: body.catalogItemIds });
      }

      const items = await qb.getMany();
      const variantIds = items.flatMap((ci) => ci.variants.map((v) => v.id));

      const barcodeRepo = AppDataSource.getRepository(Barcode);
      const barcodes = variantIds.length
        ? await barcodeRepo.find({
            where: { variant: { id: In(variantIds) } },
            relations: ['variant']
          })
        : [];
      const barcodeByVariant = new Map<string, string>();
      for (const b of barcodes) {
        if (b.isPrimary || !barcodeByVariant.has(b.variant.id)) {
          barcodeByVariant.set(b.variant.id, b.barcode);
        }
      }

      const priceByVariant = new Map<string, number>();
      if (body.priceListId) {
        const pliRepo = AppDataSource.getRepository(PriceListItem);
        const prices = await pliRepo.find({
          where: { priceList: { id: body.priceListId } },
          relations: ['variant']
        });
        for (const p of prices) {
          priceByVariant.set(p.variant.id, Number(p.price));
        }
      }

      // Always load stock so quantity syncs to EPOS (sum all warehouses unless one is selected)
      const stockByVariant = new Map<string, number>();
      if (variantIds.length) {
        const stockRepo = AppDataSource.getRepository(StockItem);
        const stockQb = stockRepo
          .createQueryBuilder('si')
          .leftJoinAndSelect('si.variant', 'v')
          .where('si.variant_id IN (:...ids)', { ids: variantIds });
        if (body.warehouseId) {
          stockQb.andWhere('si.warehouse_id = :whId', { whId: body.warehouseId });
        }
        const stocks = await stockQb.getMany();
        for (const s of stocks) {
          const vid = s.variant?.id;
          if (!vid) continue;
          stockByVariant.set(vid, (stockByVariant.get(vid) ?? 0) + Number(s.quantityOnHand ?? 0));
        }
      }

      const exportItems: GoodTillExportItem[] = items
        .filter((ci) => ci.variants.length > 0)
        .map((ci) => ({
          id: ci.id,
          sku: ci.sku,
          name: ci.name,
          description: ci.description ?? ci.longDescription,
          category: ci.category,
          status: ci.status,
          variants: ci.variants.map((v): GoodTillExportVariant => {
            const selling =
              priceByVariant.get(v.id) ??
              (ci.sellingPrice != null ? Number(ci.sellingPrice) : undefined) ??
              (v.costPrice != null ? Number(v.costPrice) : undefined) ??
              (ci.costPrice != null ? Number(ci.costPrice) : undefined);

            return {
              id: v.id,
              sku: v.variantSku,
              name: v.name ?? ci.name,
              price: selling,
              inventoryQty: stockByVariant.get(v.id) ?? 0,
              barcode: barcodeByVariant.get(v.id),
              weightGrams:
                v.weightUnit === 'g'
                  ? Number(v.weightValue ?? 0)
                  : v.weightValue != null
                    ? Number(v.weightValue) * 1000
                    : undefined,
              option1Name: v.option1Name ?? undefined,
              option1Value: v.option1Value ?? undefined,
              status: v.status
            };
          })
        }));

      const result = await exportItemsToGoodTill(creds, exportItems, {
        mode,
        duplicateMode: mode === 'sync' ? 'update' : 'skip',
        vatCodeId,
        generateBarcodes: body.generateBarcodes !== false
      });

      if (result.channelMappings.length > 0) {
        const mappingRepo = AppDataSource.getRepository(ChannelMapping);
        for (const m of result.channelMappings) {
          const existing = await mappingRepo.findOne({
            where: {
              catalogItem: { id: m.catalogItemId },
              channel: 'pos',
              channelProductId: m.externalId
            }
          });
          if (!existing) {
            await mappingRepo.save(
              mappingRepo.create({
                catalogItem: { id: m.catalogItemId } as CatalogItem,
                variant: null,
                channel: 'pos',
                channelProductId: m.externalId,
                channelVariantId: null,
                syncEnabled: true,
                syncStatus: 'synced',
                lastSyncedAt: new Date()
              })
            );
          } else {
            existing.syncStatus = 'synced';
            existing.lastSyncedAt = new Date();
            await mappingRepo.save(existing);
          }
        }
      }

      res.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Export failed';
      res.status(500).json({ error: { message } });
    }
  }

  /** GET /catalog/epos-channels/:connectionId/preview-export */
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
      if (idList.length) qb.andWhere('ci.id IN (:...ids)', { ids: idList });
    }

    const items = await qb.getMany();
    res.json({
      data: {
        totalItems: items.length,
        items: items.map((ci) => ({
          id: ci.id,
          sku: ci.sku,
          name: ci.name,
          status: ci.status,
          category: ci.category
        }))
      }
    });
  }

  /** POST /catalog/epos-channels/:connectionId/epos-products/barcodes */
  static async generateEposBarcodes(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const body = req.body as {
      organizationId: string;
      productIds?: string[];
      generateAll?: boolean;
      forceRegenerate?: boolean;
    };

    if (!body.organizationId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    try {
      const creds = await loadGoodTillCredentials(connectionId, body.organizationId);
      const result = await generateEposProductBarcodes(creds, {
        productIds: body.productIds,
        generateAll: body.generateAll,
        forceRegenerate: body.forceRegenerate ?? false
      });
      res.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'EPOS barcode generation failed';
      res.status(500).json({ error: { message } });
    }
  }

  /** GET /catalog/epos-channels/:connectionId/barcode-image/:code */
  static async barcodeImage(req: Request, res: Response): Promise<void> {
    const code = decodeURIComponent(req.params.code ?? '').trim();
    if (!code) {
      res.status(400).json({ error: { message: 'barcode code is required' } });
      return;
    }
    try {
      const dataUrl = await renderBarcodePngDataUrl(code);
      res.json({ data: { barcode: code, imageDataUrl: dataUrl } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Barcode image failed';
      res.status(500).json({ error: { message } });
    }
  }

  /** GET /catalog/epos-channels/:connectionId/epos-products/:productId */
  static async getEposProduct(req: Request, res: Response): Promise<void> {
    const { connectionId, productId } = req.params;
    const orgId = req.query.organizationId as string;
    if (!orgId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }
    try {
      const creds = await loadGoodTillCredentials(connectionId, orgId);
      const client = new GoodTillApiClient(creds);
      await client.login();
      const all = await client.getEcommerceProducts();
      const flat = all.filter((p) => !p.parent_product_id);
      const found = flat.find((p) => p.product_id === productId);
      if (!found) {
        res.status(404).json({ error: { message: 'EPOS product not found' } });
        return;
      }
      res.json({ data: found });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to load EPOS product';
      res.status(400).json({ error: { message } });
    }
  }

  /** DELETE /catalog/epos-channels/:connectionId/epos-products/:productId */
  static async deleteEposProduct(req: Request, res: Response): Promise<void> {
    const { connectionId, productId } = req.params;
    const orgId = (req.query.organizationId as string) || (req.body?.organizationId as string);
    if (!orgId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }
    if (!productId) {
      res.status(400).json({ error: { message: 'productId is required' } });
      return;
    }
    try {
      const creds = await loadGoodTillCredentials(connectionId, orgId);
      const result = await deleteEposProducts(creds, { productIds: [productId] });
      if (result.deleted === 0 && result.failed > 0) {
        res.status(400).json({
          error: {
            message: result.errors[0]?.message ?? 'Failed to delete EPOS product',
            details: result
          }
        });
        return;
      }
      res.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete EPOS product';
      res.status(500).json({ error: { message } });
    }
  }

  /** POST /catalog/epos-channels/:connectionId/epos-products/delete */
  static async deleteEposProductsBulk(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const body = req.body as {
      organizationId: string;
      productIds?: string[];
      deleteAll?: boolean;
    };

    if (!body.organizationId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }
    if (!body.deleteAll && (!body.productIds || body.productIds.length === 0)) {
      res.status(400).json({ error: { message: 'productIds or deleteAll is required' } });
      return;
    }

    try {
      const creds = await loadGoodTillCredentials(connectionId, body.organizationId);
      const result = await deleteEposProducts(creds, {
        productIds: body.productIds,
        deleteAll: body.deleteAll === true
      });
      res.json({ data: result });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to delete EPOS products';
      res.status(500).json({ error: { message } });
    }
  }

  /** POST /catalog/epos-channels/:connectionId/generate-barcodes */
  static async generateBarcodes(req: Request, res: Response): Promise<void> {
    const body = req.body as {
      organizationId: string;
      catalogItemIds?: string[];
      exportAll?: boolean;
    };

    if (!body.organizationId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    const itemRepo = AppDataSource.getRepository(CatalogItem);
    const qb = itemRepo
      .createQueryBuilder('ci')
      .leftJoinAndSelect('ci.variants', 'v', 'v.deleted_at IS NULL')
      .where('ci.organization_id = :orgId', { orgId: body.organizationId })
      .andWhere('ci.deleted_at IS NULL');

    if (!body.exportAll && body.catalogItemIds?.length) {
      qb.andWhere('ci.id IN (:...ids)', { ids: body.catalogItemIds });
    }

    const items = await qb.getMany();
    const barcodeRepo = AppDataSource.getRepository(Barcode);
    const variantIds = items.flatMap((ci) => ci.variants.map((v) => v.id));

    const existingBarcodes = variantIds.length
      ? await barcodeRepo.find({
          where: { variant: { id: In(variantIds) } },
          relations: ['variant']
        })
      : [];
    const hasBarcode = new Set(existingBarcodes.map((b) => b.variant.id));

    let generated = 0;
    let skipped = 0;
    const results: Array<{ variantSku: string; barcode: string }> = [];
    const toSave: Barcode[] = [];

    for (const ci of items) {
      for (const v of ci.variants) {
        if (hasBarcode.has(v.id)) {
          skipped++;
          continue;
        }
        const value = generateBarcodeFromSku(v.variantSku);
        toSave.push(
          barcodeRepo.create({
            variant: v,
            barcode: value,
            type: 'EAN',
            isPrimary: true
          })
        );
        results.push({ variantSku: v.variantSku, barcode: value });
      }
    }

    if (toSave.length) {
      await barcodeRepo.save(toSave);
      generated = toSave.length;
    }

    res.json({ data: { generated, skipped, barcodes: results } });
  }

  /** GET /catalog/epos-channels/:connectionId/qr/:barcode */
  static async qrCode(req: Request, res: Response): Promise<void> {
    const barcode = decodeURIComponent(req.params.barcode ?? '');
    if (!barcode) {
      res.status(400).json({ error: { message: 'barcode is required' } });
      return;
    }

    try {
      const QRCode = await import('qrcode');
      const png = await QRCode.toDataURL(barcode, { width: 256, margin: 1 });
      res.json({ data: { barcode, qrDataUrl: png } });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'QR generation failed';
      res.status(500).json({ error: { message } });
    }
  }

  /** GET /catalog/epos-channels/connections — list goodtill connections with metadata */
  static async listConnections(req: Request, res: Response): Promise<void> {
    const orgId = req.query.organizationId as string | undefined;
    const repo = AppDataSource.getRepository(ChannelConnection);
    const where: Record<string, unknown> = { channel: 'goodtill' };
    if (orgId) where.organization = { id: orgId };

    const rows = await repo.find({
      where,
      relations: ['organization'],
      order: { createdAt: 'DESC' }
    });

    res.json({
      data: rows.map((c) => serialiseConnection(c as ChannelConnection & { organization: Organization }))
    });
  }

  /** POST /catalog/epos-channels/:connectionId/preview-import */
  static async previewImport(req: Request, res: Response): Promise<void> {
    const { connectionId } = req.params;
    const orgId = req.query.organizationId as string;
    if (!orgId) {
      res.status(400).json({ error: { message: 'organizationId is required' } });
      return;
    }

    try {
      const creds = await loadGoodTillCredentials(connectionId, orgId);
      const products = await fetchAllGoodTillProducts(creds);
      res.json({ data: summarizeProducts(products) });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Preview failed';
      res.status(400).json({ error: { message } });
    }
  }
}
