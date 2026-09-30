import { Request, Response } from 'express';
import { z } from 'zod';
import { AppDataSource } from '@config/data-source.js';
import { ProductImportJob } from '@entities/catalog/ProductImportJob.js';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { parseProductsBySource, detectCsvSourceType } from '@services/import/productCsvRouter.js';
import { summarizeProducts } from '@services/import/parserUtils.js';
import { runProductImport } from '@services/import/productImportService.js';
import { fetchShopifyProducts } from '@services/import/shopifyApiImport.js';
import { fetchWooCommerceProducts } from '@services/import/woocommerceApiImport.js';
import { fetchAllWordPressProducts } from '@services/import/wordpressApiImport.js';
import { ChannelConnectionsController } from '@controllers/catalog/channelConnections.controller.js';
import type { ImportChannel, ImportOptions, ImportSourceType } from '@services/import/types.js';

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

const shopifyCredentialsSchema = z.object({
  shopDomain: z.string().min(1),
  accessToken: z.string().min(1)
});

const wooCredentialsSchema = z.object({
  storeUrl: z.string().min(1),
  consumerKey: z.string().min(1),
  consumerSecret: z.string().min(1)
});

const wordpressCredentialsSchema = z.object({
  storeUrl: z.string().min(1),
  authMode: z.enum(['appPassword', 'consumerKey']),
  username: z.string().optional(),
  appPassword: z.string().optional(),
  consumerKey: z.string().optional(),
  consumerSecret: z.string().optional()
});

const SOURCE_MAP: Record<
  ImportSourceType,
  {
    channel: ImportChannel;
    label: string;
    format: 'csv' | 'api';
    available: boolean;
    hint?: string;
  }
> = {
  shopify_csv: {
    channel: 'shopify',
    label: 'Shopify (CSV export)',
    format: 'csv',
    available: true,
    hint: 'Products → Export → CSV (same as your products_export file)'
  },
  woocommerce_csv: {
    channel: 'woocommerce',
    label: 'WooCommerce (CSV)',
    format: 'csv',
    available: true,
    hint: 'Products → Export → WooCommerce product CSV'
  },
  wordpress_csv: {
    channel: 'wordpress',
    label: 'WordPress (CSV)',
    format: 'csv',
    available: true,
    hint: 'WooCommerce export or simple Title/SKU/Price/Stock columns'
  },
  shopify_api: {
    channel: 'shopify',
    label: 'Shopify (API)',
    format: 'api',
    available: true,
    hint: 'Custom app access token + shop domain'
  },
  woocommerce_api: {
    channel: 'woocommerce',
    label: 'WooCommerce (API)',
    format: 'api',
    available: true,
    hint: 'REST API keys from WooCommerce → Settings → Advanced'
  },
  wordpress_api: {
    channel: 'wordpress',
    label: 'WordPress (API)',
    format: 'api',
    available: true,
    hint: 'WordPress Application Password (username + app password) or WooCommerce consumer key/secret'
  },
  custom_csv: {
    channel: 'custom',
    label: 'Custom CSV',
    format: 'csv',
    available: false
  }
};

function parseCsvBySource(sourceType: ImportSourceType, buffer: Buffer) {
  const text = buffer.toString('utf8');
  const detected = detectCsvSourceType(text);
  const products = parseProductsBySource(text, sourceType);
  return { products, detected };
}

async function resolveApiCredentials(
  sourceType: ImportSourceType,
  body: Record<string, unknown>,
  organizationId: string
): Promise<unknown> {
  const connectionId = body.connectionId as string | undefined;
  if (connectionId) {
    if (sourceType === 'woocommerce_api') {
      return ChannelConnectionsController.loadWooCredentials(connectionId, organizationId);
    }
    if (sourceType === 'shopify_api') {
      return ChannelConnectionsController.loadShopifyCredentials(connectionId, organizationId);
    }
  }
  return body.credentials;
}

async function fetchProductsByApi(
  sourceType: ImportSourceType,
  credentials: unknown
) {
  switch (sourceType) {
    case 'shopify_api':
      return fetchShopifyProducts(shopifyCredentialsSchema.parse(credentials));
    case 'woocommerce_api':
      return fetchWooCommerceProducts(wooCredentialsSchema.parse(credentials));
    case 'wordpress_api':
      return fetchAllWordPressProducts(wordpressCredentialsSchema.parse(credentials));
    default:
      throw new Error(`API source "${sourceType}" is not supported`);
  }
}

export class ProductImportController {
  static async listSources(_req: Request, res: Response): Promise<void> {
    res.json({
      data: Object.entries(SOURCE_MAP).map(([id, meta]) => ({
        id,
        ...meta
      }))
    });
  }

  static async preview(req: Request, res: Response): Promise<void> {
    const file = req.file;
    const sourceType = (req.body?.sourceType || 'shopify_csv') as ImportSourceType;
    const meta = SOURCE_MAP[sourceType];

    if (!meta?.available || meta.format !== 'csv') {
      res.status(400).json({ error: { message: 'This CSV import source is not available' } });
      return;
    }
    if (!file?.buffer) {
      res.status(400).json({ error: { message: 'CSV file is required (field: file)' } });
      return;
    }

    try {
      const { products, detected } = parseCsvBySource(sourceType, file.buffer);
      const summary = summarizeProducts(products, 15);
      res.json({
        data: {
          sourceType,
          channel: meta.channel,
          fileName: file.originalname,
          detectedSourceType: detected !== sourceType ? detected : null,
          ...summary
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to parse CSV';
      res.status(400).json({ error: { message } });
    }
  }

  static async previewApi(req: Request, res: Response): Promise<void> {
    const sourceType = req.body?.sourceType as ImportSourceType;
    const meta = SOURCE_MAP[sourceType];

    if (!meta?.available || meta.format !== 'api') {
      res.status(400).json({ error: { message: 'This API import source is not available' } });
      return;
    }

    const organizationId = req.body?.organizationId as string | undefined;
    if (!organizationId && req.body?.connectionId) {
      res.status(400).json({ error: { message: 'organizationId is required when using a saved connection' } });
      return;
    }

    try {
      const credentials = organizationId
        ? await resolveApiCredentials(sourceType, req.body as Record<string, unknown>, organizationId)
        : req.body?.credentials;
      const products = await fetchProductsByApi(sourceType, credentials);
      const summary = summarizeProducts(products, 15);
      res.json({
        data: {
          sourceType,
          channel: meta.channel,
          connectionId: req.body?.connectionId ?? null,
          ...summary
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to fetch from API';
      res.status(400).json({ error: { message } });
    }
  }

  static async execute(req: Request, res: Response): Promise<void> {
    const file = req.file;
    const sourceType = (req.body?.sourceType || 'shopify_csv') as ImportSourceType;
    const meta = SOURCE_MAP[sourceType];

    if (!meta?.available || meta.format !== 'csv') {
      res.status(400).json({ error: { message: 'This CSV import source is not available' } });
      return;
    }
    if (!file?.buffer) {
      res.status(400).json({ error: { message: 'CSV file is required (field: file)' } });
      return;
    }

    const optionsPayload = await ProductImportController.parseOptions(req);
    if (!optionsPayload.ok) {
      res.status(400).json({ error: optionsPayload.error });
      return;
    }

    await ProductImportController.runImportJob(
      req,
      res,
      sourceType,
      meta,
      optionsPayload.data,
      async () => parseCsvBySource(sourceType, file.buffer!).products,
      file.originalname
    );
  }

  static async executeApi(req: Request, res: Response): Promise<void> {
    const sourceType = req.body?.sourceType as ImportSourceType;
    const meta = SOURCE_MAP[sourceType];

    if (!meta?.available || meta.format !== 'api') {
      res.status(400).json({ error: { message: 'This API import source is not available' } });
      return;
    }

    const optionsPayload = await ProductImportController.parseOptionsFromBody(req.body);
    if (!optionsPayload.ok) {
      res.status(400).json({ error: optionsPayload.error });
      return;
    }

    await ProductImportController.runImportJob(
      req,
      res,
      sourceType,
      meta,
      optionsPayload.data,
      async () => {
        const credentials = await resolveApiCredentials(
          sourceType,
          req.body as Record<string, unknown>,
          optionsPayload.data.organizationId
        );
        return fetchProductsByApi(sourceType, credentials);
      },
      'API sync'
    );
  }

  private static async parseOptions(req: Request) {
    const rawOptions = req.body?.options;
    if (typeof rawOptions === 'string') {
      try {
        const parsed = importOptionsSchema.safeParse(JSON.parse(rawOptions));
        if (!parsed.success) {
          return { ok: false as const, error: { message: 'Invalid options', details: parsed.error.issues } };
        }
        return { ok: true as const, data: parsed.data };
      } catch {
        return { ok: false as const, error: { message: 'Invalid options JSON' } };
      }
    }
    const parsed = importOptionsSchema.safeParse(req.body);
    if (!parsed.success) {
      return { ok: false as const, error: { message: 'Invalid options', details: parsed.error.issues } };
    }
    return { ok: true as const, data: parsed.data };
  }

  private static async parseOptionsFromBody(body: Record<string, unknown>) {
    const raw = body?.options ?? body;
    const parsed = importOptionsSchema.safeParse(typeof raw === 'string' ? JSON.parse(raw) : raw);
    if (!parsed.success) {
      return { ok: false as const, error: { message: 'Invalid options', details: parsed.error.issues } };
    }
    return { ok: true as const, data: parsed.data };
  }

  private static async runImportJob(
    req: Request,
    res: Response,
    sourceType: ImportSourceType,
    meta: (typeof SOURCE_MAP)[ImportSourceType],
    options: z.infer<typeof importOptionsSchema>,
    loadProducts: () => Promise<ReturnType<typeof parseCsvBySource>['products']>,
    fileName: string | null
  ): Promise<void> {
    const org = await AppDataSource.getRepository(Organization).findOne({
      where: { id: options.organizationId }
    });
    if (!org) {
      res.status(400).json({ error: { message: 'Invalid organizationId' } });
      return;
    }

    const jobRepo = AppDataSource.getRepository(ProductImportJob);
    let user = null;
    const userId = (req as Request & { auth?: { sub?: string } }).auth?.sub;
    if (userId) {
      user = await AppDataSource.getRepository(User).findOne({ where: { id: userId } });
    }

    const job = jobRepo.create({
      organization: org,
      createdBy: user,
      sourceType,
      channel: meta.channel,
      fileName,
      status: 'processing',
      options: options as unknown as Record<string, unknown>
    });
    await jobRepo.save(job);

    try {
      const products = await loadProducts();
      const summary = await runProductImport(products, options, meta.channel);

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

  static async listJobs(req: Request, res: Response): Promise<void> {
    try {
      const { organizationId, page = '1', limit = '20' } = req.query;
      const repo = AppDataSource.getRepository(ProductImportJob);
      const qb = repo
        .createQueryBuilder('j')
        .leftJoinAndSelect('j.organization', 'org')
        .leftJoinAndSelect('j.createdBy', 'user')
        .orderBy('j.createdAt', 'DESC');

      if (organizationId) {
        qb.andWhere('j.organization_id = :orgId', { orgId: organizationId });
      }

      const skip = (parseInt(page as string, 10) - 1) * parseInt(limit as string, 10);
      qb.skip(skip).take(parseInt(limit as string, 10));
      const [jobs, total] = await qb.getManyAndCount();

      res.json({
        data: jobs,
        pagination: {
          page: parseInt(page as string, 10),
          limit: parseInt(limit as string, 10),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string, 10))
        }
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to list import jobs';
      if (message.includes("doesn't exist") || message.includes('product_import_jobs')) {
        res.json({ data: [], pagination: { page: 1, limit: 20, total: 0, totalPages: 0 } });
        return;
      }
      res.status(500).json({ error: { message } });
    }
  }

  static async getJob(req: Request, res: Response): Promise<void> {
    const job = await AppDataSource.getRepository(ProductImportJob).findOne({
      where: { id: req.params.id },
      relations: ['organization', 'createdBy']
    });
    if (!job) {
      res.status(404).json({ error: { message: 'Import job not found' } });
      return;
    }
    res.json({ data: job });
  }
}
