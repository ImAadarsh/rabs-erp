import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Variant } from '@entities/catalog/Variant.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { z } from 'zod';
import { uploadFile, deleteFileByUrl } from '@utils/storage.js';

const createVariantSchema = z.object({
  catalogItemId: z.string(),
  variantSku: z.string().min(1),
  name: z.string().optional(),
  option1Name: z.string().optional(),
  option1Value: z.string().optional(),
  option2Name: z.string().optional(),
  option2Value: z.string().optional(),
  option3Name: z.string().optional(),
  option3Value: z.string().optional(),
  weightValue: z.coerce.number().optional(),
  weightUnit: z.enum(['g', 'kg', 'lb', 'oz']).optional(),
  lengthValue: z.coerce.number().optional(),
  widthValue: z.coerce.number().optional(),
  heightValue: z.coerce.number().optional(),
  dimensionUnit: z.enum(['cm', 'm', 'in', 'ft']).optional(),
  costPrice: z.coerce.number().optional(),
  costCurrency: z.string().length(3).optional(),
  imageUrl: z.string().url().optional(),
  position: z.coerce.number().optional(),
  status: z.enum(['active', 'inactive', 'discontinued']).optional()
});

const updateVariantSchema = z.object({
  variantSku: z.string().min(1).optional(),
  name: z.string().optional(),
  option1Name: z.string().optional(),
  option1Value: z.string().optional(),
  option2Name: z.string().optional(),
  option2Value: z.string().optional(),
  option3Name: z.string().optional(),
  option3Value: z.string().optional(),
  weightValue: z.coerce.number().optional(),
  weightUnit: z.enum(['g', 'kg', 'lb', 'oz']).optional(),
  lengthValue: z.coerce.number().optional(),
  widthValue: z.coerce.number().optional(),
  heightValue: z.coerce.number().optional(),
  dimensionUnit: z.enum(['cm', 'm', 'in', 'ft']).optional(),
  costPrice: z.coerce.number().optional(),
  costCurrency: z.string().length(3).optional(),
  imageUrl: z.string().url().optional(),
  position: z.coerce.number().optional(),
  status: z.enum(['active', 'inactive', 'discontinued']).optional()
});

export class VariantsController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(Variant);
    const { catalogItemId, status, search } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('v')
      .leftJoinAndSelect('v.catalogItem', 'ci')
      .orderBy('v.position', 'ASC')
      .addOrderBy('v.createdAt', 'DESC');

    if (catalogItemId) {
      queryBuilder.andWhere('v.catalog_item_id = :catalogItemId', { catalogItemId });
    }

    if (status) {
      queryBuilder.andWhere('v.status = :status', { status });
    }

    if (search) {
      queryBuilder.andWhere(
        '(v.variant_sku LIKE :search OR v.name LIKE :search)',
        { search: `%${search}%` }
      );
    }

    const variants = await queryBuilder.getMany();
    res.json({ data: variants });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(Variant);
    const variant = await repo.findOne({
      where: { id: req.params.id },
      relations: ['catalogItem', 'catalogItem.organization', 'barcodes', 'media']
    });
    
    if (!variant) {
      res.status(404).json({ error: { message: 'Variant not found' } });
      return;
    }
    
    res.json({ data: variant });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createVariantSchema.safeParse(req.body);
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

    // Check for duplicate variant SKU
    const repo = AppDataSource.getRepository(Variant);
    const existing = await repo.findOne({ where: { variantSku: parsed.data.variantSku } });
    
    if (existing) {
      res.status(400).json({ error: { message: 'Variant SKU already exists' } });
      return;
    }

    let imageUrl = parsed.data.imageUrl ?? null;

    // Handle image file upload if provided
    if (req.file) {
      try {
        const uploadResult = await uploadFile({
          file: req.file,
          folder: 'variants',
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          maxSizeInMB: 5
        });
        imageUrl = uploadResult.url;
      } catch (error: any) {
        res.status(400).json({ error: { message: `Image upload failed: ${error.message}` } });
        return;
      }
    }

    const variant = repo.create({
      catalogItem,
      variantSku: parsed.data.variantSku,
      name: parsed.data.name ?? null,
      option1Name: parsed.data.option1Name ?? null,
      option1Value: parsed.data.option1Value ?? null,
      option2Name: parsed.data.option2Name ?? null,
      option2Value: parsed.data.option2Value ?? null,
      option3Name: parsed.data.option3Name ?? null,
      option3Value: parsed.data.option3Value ?? null,
      weightValue: parsed.data.weightValue ?? null,
      weightUnit: parsed.data.weightUnit ?? 'kg',
      lengthValue: parsed.data.lengthValue ?? null,
      widthValue: parsed.data.widthValue ?? null,
      heightValue: parsed.data.heightValue ?? null,
      dimensionUnit: parsed.data.dimensionUnit ?? 'cm',
      costPrice: parsed.data.costPrice ?? null,
      costCurrency: parsed.data.costCurrency ?? 'GBP',
      imageUrl,
      position: parsed.data.position ?? 0,
      status: parsed.data.status ?? 'active'
    });

    await repo.save(variant);

    const saved = await repo.findOne({
      where: { id: variant.id },
      relations: ['catalogItem']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateVariantSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(Variant);
    const variant = await repo.findOne({ where: { id } });

    if (!variant) {
      res.status(404).json({ error: { message: 'Variant not found' } });
      return;
    }

    // Check for duplicate variant SKU if SKU is being updated
    if (parsed.data.variantSku && parsed.data.variantSku !== variant.variantSku) {
      const existing = await repo.findOne({ where: { variantSku: parsed.data.variantSku } });
      if (existing) {
        res.status(400).json({ error: { message: 'Variant SKU already exists' } });
        return;
      }
    }

    // Handle image file upload if new file provided
    if (req.file) {
      // Delete old image if exists
      if (variant.imageUrl) {
        try {
          await deleteFileByUrl(variant.imageUrl);
        } catch (error) {
          console.error('Failed to delete old image:', error);
        }
      }

      // Upload new image
      try {
        const uploadResult = await uploadFile({
          file: req.file,
          folder: 'variants',
          allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          maxSizeInMB: 5
        });
        variant.imageUrl = uploadResult.url;
      } catch (error: any) {
        res.status(400).json({ error: { message: `Image upload failed: ${error.message}` } });
        return;
      }
    } else if (parsed.data.imageUrl !== undefined) {
      // If imageUrl is explicitly set (including null to remove)
      if (parsed.data.imageUrl === null && variant.imageUrl) {
        // Delete old image if setting to null
        try {
          await deleteFileByUrl(variant.imageUrl);
        } catch (error) {
          console.error('Failed to delete old image:', error);
        }
      }
      variant.imageUrl = parsed.data.imageUrl;
    }

    // Update fields
    if (parsed.data.variantSku) variant.variantSku = parsed.data.variantSku;
    if (parsed.data.name !== undefined) variant.name = parsed.data.name ?? null;
    if (parsed.data.option1Name !== undefined) variant.option1Name = parsed.data.option1Name ?? null;
    if (parsed.data.option1Value !== undefined) variant.option1Value = parsed.data.option1Value ?? null;
    if (parsed.data.option2Name !== undefined) variant.option2Name = parsed.data.option2Name ?? null;
    if (parsed.data.option2Value !== undefined) variant.option2Value = parsed.data.option2Value ?? null;
    if (parsed.data.option3Name !== undefined) variant.option3Name = parsed.data.option3Name ?? null;
    if (parsed.data.option3Value !== undefined) variant.option3Value = parsed.data.option3Value ?? null;
    if (parsed.data.weightValue !== undefined) variant.weightValue = parsed.data.weightValue ?? null;
    if (parsed.data.weightUnit) variant.weightUnit = parsed.data.weightUnit;
    if (parsed.data.lengthValue !== undefined) variant.lengthValue = parsed.data.lengthValue ?? null;
    if (parsed.data.widthValue !== undefined) variant.widthValue = parsed.data.widthValue ?? null;
    if (parsed.data.heightValue !== undefined) variant.heightValue = parsed.data.heightValue ?? null;
    if (parsed.data.dimensionUnit) variant.dimensionUnit = parsed.data.dimensionUnit;
    if (parsed.data.costPrice !== undefined) variant.costPrice = parsed.data.costPrice ?? null;
    if (parsed.data.costCurrency) variant.costCurrency = parsed.data.costCurrency;
    if (parsed.data.position !== undefined) variant.position = parsed.data.position;
    if (parsed.data.status) variant.status = parsed.data.status;

    await repo.save(variant);

    const updated = await repo.findOne({
      where: { id: variant.id },
      relations: ['catalogItem']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(Variant);
    const variant = await repo.findOne({ where: { id } });

    if (!variant) {
      res.status(404).json({ error: { message: 'Variant not found' } });
      return;
    }

    await repo.softRemove(variant);
    res.status(204).send();
  }
}

