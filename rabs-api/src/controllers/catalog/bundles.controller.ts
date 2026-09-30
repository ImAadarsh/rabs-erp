import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Bundle } from '@entities/catalog/Bundle.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { z } from 'zod';

const createBundleSchema = z.object({
  catalogItemId: z.string(),
  name: z.string().min(1),
  description: z.string().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  fixedPrice: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(['active', 'inactive']).optional()
});

const updateBundleSchema = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  discountPercent: z.number().min(0).max(100).optional(),
  fixedPrice: z.number().min(0).optional(),
  currency: z.string().length(3).optional(),
  status: z.enum(['active', 'inactive']).optional()
});

export class BundlesController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(Bundle);
    const { catalogItemId, status } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('b')
      .leftJoinAndSelect('b.catalogItem', 'ci')
      .leftJoinAndSelect('b.items', 'bi')
      .leftJoinAndSelect('bi.variant', 'v')
      .orderBy('b.createdAt', 'DESC');

    if (catalogItemId) {
      queryBuilder.andWhere('b.catalog_item_id = :catalogItemId', { catalogItemId });
    }

    if (status) {
      queryBuilder.andWhere('b.status = :status', { status });
    }

    const bundles = await queryBuilder.getMany();
    res.json({ data: bundles });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(Bundle);
    const bundle = await repo.findOne({
      where: { id: req.params.id },
      relations: ['catalogItem', 'items', 'items.variant', 'items.variant.catalogItem']
    });
    
    if (!bundle) {
      res.status(404).json({ error: { message: 'Bundle not found' } });
      return;
    }
    
    res.json({ data: bundle });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createBundleSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const catalogItemRepo = AppDataSource.getRepository(CatalogItem);
    const catalogItem = await catalogItemRepo.findOne({ where: { id: parsed.data.catalogItemId } });
    
    if (!catalogItem) {
      res.status(400).json({ error: { message: 'Invalid catalogItemId' } });
      return;
    }

    const repo = AppDataSource.getRepository(Bundle);
    const bundle = repo.create({
      catalogItem,
      name: parsed.data.name,
      description: parsed.data.description ?? null,
      discountPercent: parsed.data.discountPercent ?? null,
      fixedPrice: parsed.data.fixedPrice ?? null,
      currency: parsed.data.currency ?? 'GBP',
      status: parsed.data.status ?? 'active'
    });

    await repo.save(bundle);

    const saved = await repo.findOne({
      where: { id: bundle.id },
      relations: ['catalogItem', 'items']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateBundleSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(Bundle);
    const bundle = await repo.findOne({ where: { id } });

    if (!bundle) {
      res.status(404).json({ error: { message: 'Bundle not found' } });
      return;
    }

    if (parsed.data.name) bundle.name = parsed.data.name;
    if (parsed.data.description !== undefined) bundle.description = parsed.data.description ?? null;
    if (parsed.data.discountPercent !== undefined) bundle.discountPercent = parsed.data.discountPercent ?? null;
    if (parsed.data.fixedPrice !== undefined) bundle.fixedPrice = parsed.data.fixedPrice ?? null;
    if (parsed.data.currency) bundle.currency = parsed.data.currency;
    if (parsed.data.status) bundle.status = parsed.data.status;

    await repo.save(bundle);

    const updated = await repo.findOne({
      where: { id: bundle.id },
      relations: ['catalogItem', 'items']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(Bundle);
    const bundle = await repo.findOne({ where: { id } });

    if (!bundle) {
      res.status(404).json({ error: { message: 'Bundle not found' } });
      return;
    }

    await repo.remove(bundle);
    res.status(204).send();
  }
}

