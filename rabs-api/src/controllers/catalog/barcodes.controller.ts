import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Barcode } from '@entities/catalog/Barcode.js';
import { Variant } from '@entities/catalog/Variant.js';
import { z } from 'zod';

const createBarcodeSchema = z.object({
  variantId: z.string(),
  barcode: z.string().min(1),
  type: z.enum(['EAN', 'UPC', 'ISBN', 'CODE128', 'QR', 'INTERNAL']).optional(),
  isPrimary: z.boolean().optional()
});

const updateBarcodeSchema = z.object({
  barcode: z.string().min(1).optional(),
  type: z.enum(['EAN', 'UPC', 'ISBN', 'CODE128', 'QR', 'INTERNAL']).optional(),
  isPrimary: z.boolean().optional()
});

export class BarcodesController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(Barcode);
    const { variantId, type, isPrimary } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('b')
      .leftJoinAndSelect('b.variant', 'v')
      .orderBy('b.isPrimary', 'DESC')
      .addOrderBy('b.createdAt', 'ASC');

    if (variantId) {
      queryBuilder.andWhere('b.variant_id = :variantId', { variantId });
    }

    if (type) {
      queryBuilder.andWhere('b.type = :type', { type });
    }

    if (isPrimary !== undefined) {
      queryBuilder.andWhere('b.is_primary = :isPrimary', { isPrimary: isPrimary === 'true' });
    }

    const barcodes = await queryBuilder.getMany();
    res.json({ data: barcodes });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(Barcode);
    const barcode = await repo.findOne({
      where: { id: req.params.id },
      relations: ['variant', 'variant.catalogItem']
    });
    
    if (!barcode) {
      res.status(404).json({ error: { message: 'Barcode not found' } });
      return;
    }
    
    res.json({ data: barcode });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createBarcodeSchema.safeParse(req.body);
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

    // Check for duplicate barcode
    const repo = AppDataSource.getRepository(Barcode);
    const existing = await repo.findOne({ where: { barcode: parsed.data.barcode } });
    
    if (existing) {
      res.status(400).json({ error: { message: 'Barcode already exists' } });
      return;
    }

    // If this is set as primary, unset other primaries for this variant
    if (parsed.data.isPrimary) {
      await repo.update(
        { variant: { id: parsed.data.variantId }, isPrimary: true },
        { isPrimary: false }
      );
    }

    const barcode = repo.create({
      variant,
      barcode: parsed.data.barcode,
      type: parsed.data.type ?? 'EAN',
      isPrimary: parsed.data.isPrimary ?? false
    });

    await repo.save(barcode);

    const saved = await repo.findOne({
      where: { id: barcode.id },
      relations: ['variant']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateBarcodeSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(Barcode);
    const barcode = await repo.findOne({
      where: { id },
      relations: ['variant']
    });

    if (!barcode) {
      res.status(404).json({ error: { message: 'Barcode not found' } });
      return;
    }

    // Check for duplicate barcode if barcode is being updated
    if (parsed.data.barcode && parsed.data.barcode !== barcode.barcode) {
      const existing = await repo.findOne({ where: { barcode: parsed.data.barcode } });
      if (existing) {
        res.status(400).json({ error: { message: 'Barcode already exists' } });
        return;
      }
    }

    // If setting as primary, unset other primaries for this variant
    if (parsed.data.isPrimary === true) {
      await repo.update(
        { variant: { id: barcode.variant.id }, isPrimary: true },
        { isPrimary: false }
      );
    }

    // Update fields
    if (parsed.data.barcode) barcode.barcode = parsed.data.barcode;
    if (parsed.data.type) barcode.type = parsed.data.type;
    if (parsed.data.isPrimary !== undefined) barcode.isPrimary = parsed.data.isPrimary;

    await repo.save(barcode);

    const updated = await repo.findOne({
      where: { id: barcode.id },
      relations: ['variant']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(Barcode);
    const barcode = await repo.findOne({ where: { id } });

    if (!barcode) {
      res.status(404).json({ error: { message: 'Barcode not found' } });
      return;
    }

    await repo.remove(barcode);
    res.status(204).send();
  }
}

