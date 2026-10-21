import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { BundleItem } from '@entities/catalog/BundleItem.js';
import { Bundle } from '@entities/catalog/Bundle.js';
import { Variant } from '@entities/catalog/Variant.js';
import { z } from 'zod';
import { zodMessage } from '@services/catalog/zodMessage.js';

const createBundleItemSchema = z.object({
  bundleId: z.string(),
  variantId: z.string(),
  quantity: z.number().int().min(1).optional(),
  position: z.number().int().optional()
});

const updateBundleItemSchema = z.object({
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).optional(),
  position: z.number().int().optional()
});

function sameOrganization(variant: Variant, bundle: Bundle): boolean {
  const a = variant.catalogItem?.organization?.id;
  const b = bundle.catalogItem?.organization?.id;
  return !a || !b || String(a) === String(b);
}

export class BundleItemsController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(BundleItem);
    const { bundleId, variantId } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('bi')
      .leftJoinAndSelect('bi.bundle', 'b')
      .leftJoinAndSelect('bi.variant', 'v')
      .leftJoinAndSelect('v.catalogItem', 'ci')
      .orderBy('bi.position', 'ASC')
      .addOrderBy('bi.createdAt', 'DESC');

    if (bundleId) {
      queryBuilder.andWhere('bi.bundle_id = :bundleId', { bundleId });
    }

    if (variantId) {
      queryBuilder.andWhere('bi.variant_id = :variantId', { variantId });
    }

    const items = await queryBuilder.getMany();
    res.json({ data: items });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(BundleItem);
    const item = await repo.findOne({
      where: { id: req.params.id },
      relations: ['bundle', 'variant', 'variant.catalogItem']
    });
    
    if (!item) {
      res.status(404).json({ error: { message: 'Bundle item not found' } });
      return;
    }
    
    res.json({ data: item });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createBundleItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: zodMessage(parsed.error), details: parsed.error.issues } });
      return;
    }

    const bundleRepo = AppDataSource.getRepository(Bundle);
    const bundle = await bundleRepo.findOne({
      where: { id: parsed.data.bundleId },
      relations: ['catalogItem', 'catalogItem.organization']
    });
    
    if (!bundle) {
      res.status(400).json({ error: { message: 'Invalid bundleId' } });
      return;
    }

    const variantRepo = AppDataSource.getRepository(Variant);
    const variant = await variantRepo.findOne({ 
      where: { id: parsed.data.variantId },
      relations: ['catalogItem', 'catalogItem.organization']
    });
    
    if (!variant) {
      res.status(400).json({ error: { message: 'Invalid variantId' } });
      return;
    }

    // A bundle groups variants of other products, so only the organisation has to match.
    if (!sameOrganization(variant, bundle)) {
      res.status(400).json({ error: { message: 'Variant belongs to a different organisation than the bundle' } });
      return;
    }

    const repo = AppDataSource.getRepository(BundleItem);
    const duplicate = await repo.findOne({
      where: { bundle: { id: bundle.id }, variant: { id: variant.id } }
    });
    if (duplicate) {
      res.status(409).json({ error: { message: 'This variant is already in the bundle — change its quantity instead' } });
      return;
    }

    const item = repo.create({
      bundle,
      variant,
      quantity: parsed.data.quantity ?? 1,
      position: parsed.data.position ?? 0
    });

    await repo.save(item);

    const saved = await repo.findOne({
      where: { id: item.id },
      relations: ['bundle', 'variant']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateBundleItemSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: zodMessage(parsed.error), details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(BundleItem);
    const item = await repo.findOne({
      where: { id },
      relations: ['bundle', 'bundle.catalogItem', 'bundle.catalogItem.organization', 'variant']
    });

    if (!item) {
      res.status(404).json({ error: { message: 'Bundle item not found' } });
      return;
    }

    if (parsed.data.variantId) {
      const variantRepo = AppDataSource.getRepository(Variant);
      const variant = await variantRepo.findOne({ 
        where: { id: parsed.data.variantId },
        relations: ['catalogItem', 'catalogItem.organization']
      });
      
      if (!variant) {
        res.status(400).json({ error: { message: 'Invalid variantId' } });
        return;
      }

      if (!sameOrganization(variant, item.bundle)) {
        res.status(400).json({ error: { message: 'Variant belongs to a different organisation than the bundle' } });
        return;
      }

      item.variant = variant;
    }

    if (parsed.data.quantity !== undefined) item.quantity = parsed.data.quantity;
    if (parsed.data.position !== undefined) item.position = parsed.data.position;

    await repo.save(item);

    const updated = await repo.findOne({
      where: { id: item.id },
      relations: ['bundle', 'variant']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(BundleItem);
    const item = await repo.findOne({ where: { id } });

    if (!item) {
      res.status(404).json({ error: { message: 'Bundle item not found' } });
      return;
    }

    await repo.remove(item);
    res.status(204).send();
  }
}

