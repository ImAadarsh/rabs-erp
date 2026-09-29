import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PriceListItem } from '@entities/catalog/PriceListItem.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { Variant } from '@entities/catalog/Variant.js';
import { z } from 'zod';

const createPriceListItemSchema = z.object({
  priceListId: z.string(),
  variantId: z.string(),
  price: z.number().min(0),
  compareAtPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  minMarginPercent: z.number().optional(),
  minQuantity: z.number().int().min(1).optional(),
  maxQuantity: z.number().int().min(1).optional()
});

const updatePriceListItemSchema = z.object({
  price: z.number().min(0).optional(),
  compareAtPrice: z.number().min(0).optional(),
  costPrice: z.number().min(0).optional(),
  minMarginPercent: z.number().optional(),
  minQuantity: z.number().int().min(1).optional(),
  maxQuantity: z.number().int().min(1).optional()
});

export class PriceListItemsController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(PriceListItem);
    const { priceListId, variantId } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('pli')
      .leftJoinAndSelect('pli.priceList', 'pl')
      .leftJoinAndSelect('pli.variant', 'v')
      .leftJoinAndSelect('v.catalogItem', 'ci')
      .orderBy('pli.createdAt', 'DESC');

    if (priceListId) {
      queryBuilder.andWhere('pli.price_list_id = :priceListId', { priceListId });
    }

    if (variantId) {
      queryBuilder.andWhere('pli.variant_id = :variantId', { variantId });
    }

    const items = await queryBuilder.getMany();
    res.json({ data: items });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(PriceListItem);
    const item = await repo.findOne({
      where: { id: req.params.id },
      relations: ['priceList', 'variant', 'variant.catalogItem']
    });
    
    if (!item) {
      res.status(404).json({ error: { message: 'Price list item not found' } });
      return;
    }
    
    res.json({ data: item });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createPriceListItemSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const priceListRepo = AppDataSource.getRepository(PriceList);
    const priceList = await priceListRepo.findOne({ where: { id: parsed.data.priceListId } });
    
    if (!priceList) {
      res.status(400).json({ error: { message: 'Invalid priceListId' } });
      return;
    }

    const variantRepo = AppDataSource.getRepository(Variant);
    const variant = await variantRepo.findOne({ where: { id: parsed.data.variantId } });
    
    if (!variant) {
      res.status(400).json({ error: { message: 'Invalid variantId' } });
      return;
    }

    // Check for duplicate variant in price list
    const repo = AppDataSource.getRepository(PriceListItem);
    const existing = await repo.findOne({
      where: { 
        priceList: { id: parsed.data.priceListId },
        variant: { id: parsed.data.variantId }
      }
    });
    
    if (existing) {
      res.status(400).json({ error: { message: 'Variant already exists in this price list' } });
      return;
    }

    const item = repo.create({
      priceList,
      variant,
      price: parsed.data.price,
      compareAtPrice: parsed.data.compareAtPrice ?? null,
      costPrice: parsed.data.costPrice ?? null,
      minMarginPercent: parsed.data.minMarginPercent ?? null,
      minQuantity: parsed.data.minQuantity ?? 1,
      maxQuantity: parsed.data.maxQuantity ?? null
    });

    await repo.save(item);

    const saved = await repo.findOne({
      where: { id: item.id },
      relations: ['priceList', 'variant']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updatePriceListItemSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(PriceListItem);
    const item = await repo.findOne({
      where: { id },
      relations: ['priceList', 'variant']
    });

    if (!item) {
      res.status(404).json({ error: { message: 'Price list item not found' } });
      return;
    }

    // Update fields
    if (parsed.data.price !== undefined) item.price = parsed.data.price;
    if (parsed.data.compareAtPrice !== undefined) item.compareAtPrice = parsed.data.compareAtPrice ?? null;
    if (parsed.data.costPrice !== undefined) item.costPrice = parsed.data.costPrice ?? null;
    if (parsed.data.minMarginPercent !== undefined) item.minMarginPercent = parsed.data.minMarginPercent ?? null;
    if (parsed.data.minQuantity !== undefined) item.minQuantity = parsed.data.minQuantity;
    if (parsed.data.maxQuantity !== undefined) item.maxQuantity = parsed.data.maxQuantity ?? null;

    await repo.save(item);

    const updated = await repo.findOne({
      where: { id: item.id },
      relations: ['priceList', 'variant']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(PriceListItem);
    const item = await repo.findOne({ where: { id } });

    if (!item) {
      res.status(404).json({ error: { message: 'Price list item not found' } });
      return;
    }

    await repo.remove(item);
    res.status(204).send();
  }
}

