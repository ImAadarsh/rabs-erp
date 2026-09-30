import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PromotionalPrice } from '@entities/catalog/PromotionalPrice.js';
import { Variant } from '@entities/catalog/Variant.js';
import { PriceList } from '@entities/catalog/PriceList.js';
import { z } from 'zod';

const createPromotionalPriceSchema = z.object({
  variantId: z.string(),
  priceListId: z.string().optional(),
  name: z.string().min(1),
  discountType: z.enum(['percentage', 'fixed_amount']),
  discountValue: z.number().min(0),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
  status: z.enum(['scheduled', 'active', 'expired', 'cancelled']).optional()
});

const updatePromotionalPriceSchema = z.object({
  priceListId: z.string().optional().nullable(),
  name: z.string().min(1).optional(),
  discountType: z.enum(['percentage', 'fixed_amount']).optional(),
  discountValue: z.number().min(0).optional(),
  validFrom: z.string().datetime().optional(),
  validUntil: z.string().datetime().optional(),
  status: z.enum(['scheduled', 'active', 'expired', 'cancelled']).optional()
});

export class PromotionalPricesController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(PromotionalPrice);
    const { variantId, priceListId, status } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('pp')
      .leftJoinAndSelect('pp.variant', 'v')
      .leftJoinAndSelect('pp.priceList', 'pl')
      .orderBy('pp.validFrom', 'DESC');

    if (variantId) {
      queryBuilder.andWhere('pp.variant_id = :variantId', { variantId });
    }

    if (priceListId) {
      queryBuilder.andWhere('pp.price_list_id = :priceListId', { priceListId });
    }

    if (status) {
      queryBuilder.andWhere('pp.status = :status', { status });
    }

    const prices = await queryBuilder.getMany();
    res.json({ data: prices });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(PromotionalPrice);
    const price = await repo.findOne({
      where: { id: req.params.id },
      relations: ['variant', 'variant.catalogItem', 'priceList']
    });
    
    if (!price) {
      res.status(404).json({ error: { message: 'Promotional price not found' } });
      return;
    }
    
    res.json({ data: price });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createPromotionalPriceSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const variantRepo = AppDataSource.getRepository(Variant);
    const variant = await variantRepo.findOne({ where: { id: parsed.data.variantId } });
    
    if (!variant) {
      res.status(400).json({ error: { message: 'Invalid variantId' } });
      return;
    }

    let priceList = null;
    if (parsed.data.priceListId) {
      const priceListRepo = AppDataSource.getRepository(PriceList);
      priceList = await priceListRepo.findOne({ where: { id: parsed.data.priceListId } });
      
      if (!priceList) {
        res.status(400).json({ error: { message: 'Invalid priceListId' } });
        return;
      }
    }

    const repo = AppDataSource.getRepository(PromotionalPrice);
    const price = repo.create({
      variant,
      priceList,
      name: parsed.data.name,
      discountType: parsed.data.discountType,
      discountValue: parsed.data.discountValue,
      validFrom: new Date(parsed.data.validFrom),
      validUntil: new Date(parsed.data.validUntil),
      status: parsed.data.status ?? 'scheduled'
    });

    await repo.save(price);

    const saved = await repo.findOne({
      where: { id: price.id },
      relations: ['variant', 'priceList']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updatePromotionalPriceSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(PromotionalPrice);
    const price = await repo.findOne({ where: { id } });

    if (!price) {
      res.status(404).json({ error: { message: 'Promotional price not found' } });
      return;
    }

    if (parsed.data.priceListId !== undefined) {
      if (parsed.data.priceListId) {
        const priceListRepo = AppDataSource.getRepository(PriceList);
        const priceList = await priceListRepo.findOne({ where: { id: parsed.data.priceListId } });
        
        if (!priceList) {
          res.status(400).json({ error: { message: 'Invalid priceListId' } });
          return;
        }
        price.priceList = priceList;
      } else {
        price.priceList = null;
      }
    }

    if (parsed.data.name) price.name = parsed.data.name;
    if (parsed.data.discountType) price.discountType = parsed.data.discountType;
    if (parsed.data.discountValue !== undefined) price.discountValue = parsed.data.discountValue;
    if (parsed.data.validFrom) price.validFrom = new Date(parsed.data.validFrom);
    if (parsed.data.validUntil) price.validUntil = new Date(parsed.data.validUntil);
    if (parsed.data.status) price.status = parsed.data.status;

    await repo.save(price);

    const updated = await repo.findOne({
      where: { id: price.id },
      relations: ['variant', 'priceList']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(PromotionalPrice);
    const price = await repo.findOne({ where: { id } });

    if (!price) {
      res.status(404).json({ error: { message: 'Promotional price not found' } });
      return;
    }

    await repo.remove(price);
    res.status(204).send();
  }
}

