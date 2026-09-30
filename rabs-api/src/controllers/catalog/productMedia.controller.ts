import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { ProductMedia } from '@entities/catalog/ProductMedia.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { z } from 'zod';
import { uploadFile, deleteFileByUrl } from '@utils/storage.js';
import { IsNull } from 'typeorm';

const createProductMediaSchema = z.object({
  catalogItemId: z.string(),
  variantId: z.string().optional(),
  type: z.enum(['image', 'video', 'document', '3d_model']),
  altText: z.string().optional(),
  position: z.coerce.number().int().optional(),
  isPrimary: z.coerce.boolean().optional()
});

const updateProductMediaSchema = z.object({
  variantId: z.string().optional().nullable(),
  type: z.enum(['image', 'video', 'document', '3d_model']).optional(),
  altText: z.string().optional(),
  position: z.coerce.number().int().optional(),
  isPrimary: z.coerce.boolean().optional()
});

export class ProductMediaController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ProductMedia);
    const { catalogItemId, variantId, type } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('pm')
      .leftJoinAndSelect('pm.catalogItem', 'ci')
      .leftJoinAndSelect('pm.variant', 'v')
      .orderBy('pm.position', 'ASC')
      .addOrderBy('pm.createdAt', 'DESC');

    if (catalogItemId) {
      queryBuilder.andWhere('pm.catalog_item_id = :catalogItemId', { catalogItemId });
    }

    if (variantId) {
      queryBuilder.andWhere('pm.variant_id = :variantId', { variantId });
    }

    if (type) {
      queryBuilder.andWhere('pm.type = :type', { type });
    }

    const items = await queryBuilder.getMany();
    res.json({ data: items });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ProductMedia);
    const item = await repo.findOne({
      where: { id: req.params.id },
      relations: ['catalogItem', 'variant']
    });
    
    if (!item) {
      res.status(404).json({ error: { message: 'Product media not found' } });
      return;
    }
    
    res.json({ data: item });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createProductMediaSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    // Validate catalog item exists
    const catalogItemRepo = AppDataSource.getRepository(CatalogItem);
    const catalogItem = await catalogItemRepo.findOne({ where: { id: parsed.data.catalogItemId } });
    if (!catalogItem) {
      res.status(400).json({ error: { message: 'Invalid catalogItemId' } });
      return;
    }

    // Validate variant if provided
    let variant = null;
    if (parsed.data.variantId) {
      const variantRepo = AppDataSource.getRepository(Variant);
      variant = await variantRepo.findOne({ 
        where: { id: parsed.data.variantId },
        relations: ['catalogItem']
      });
      if (!variant || variant.catalogItem.id !== catalogItem.id) {
        res.status(400).json({ error: { message: 'Invalid variantId or variant does not belong to catalog item' } });
        return;
      }
    }

    // Handle file upload if provided
    let url: string;
    let filename: string | null = null;
    let mimeType: string | null = null;
    let sizeBytes: number | null = null;

    if (req.file) {
      try {
        const allowedMimeTypes: Record<string, string[]> = {
          image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
          document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
          '3d_model': ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
        };

        const folder = `product-media/${parsed.data.catalogItemId}${parsed.data.variantId ? `/${parsed.data.variantId}` : ''}`;
        const uploadResult = await uploadFile({
          file: req.file,
          folder,
          allowedMimeTypes: allowedMimeTypes[parsed.data.type] || ['*/*'],
          maxSizeInMB: parsed.data.type === 'video' ? 100 : parsed.data.type === '3d_model' ? 50 : 10
        });
        
        url = uploadResult.url;
        filename = uploadResult.fileName;
        mimeType = uploadResult.mimeType;
        sizeBytes = uploadResult.size;
      } catch (error: any) {
        res.status(400).json({ error: { message: `File upload failed: ${error.message}` } });
        return;
      }
    } else {
      res.status(400).json({ error: { message: 'File is required' } });
      return;
    }

    // If this is set as primary, unset other primary media for the same catalog item/variant
    if (parsed.data.isPrimary) {
      const repo = AppDataSource.getRepository(ProductMedia);
      const whereCondition: any = {
        catalogItem: { id: catalogItem.id },
        isPrimary: true
      };
      if (variant) {
        whereCondition.variant = { id: variant.id };
      } else {
        whereCondition.variant = IsNull();
      }
      await repo.update(
        whereCondition,
        { isPrimary: false }
      );
    }

    const repo = AppDataSource.getRepository(ProductMedia);
    const item = repo.create({
      catalogItem,
      variant,
      type: parsed.data.type,
      url,
      filename,
      mimeType,
      sizeBytes,
      altText: parsed.data.altText ?? null,
      position: parsed.data.position ?? 0,
      isPrimary: parsed.data.isPrimary ?? false
    });

    await repo.save(item);

    // Fetch with relations
    const saved = await repo.findOne({
      where: { id: item.id },
      relations: ['catalogItem', 'variant']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateProductMediaSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(ProductMedia);
    const item = await repo.findOne({
      where: { id },
      relations: ['catalogItem', 'variant']
    });

    if (!item) {
      res.status(404).json({ error: { message: 'Product media not found' } });
      return;
    }

    // Handle file upload if new file provided
    if (req.file) {
      // Delete old file
      try {
        await deleteFileByUrl(item.url);
      } catch (error) {
        console.error('Failed to delete old file:', error);
      }

      // Upload new file
      try {
        const allowedMimeTypes: Record<string, string[]> = {
          image: ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'],
          video: ['video/mp4', 'video/webm', 'video/ogg', 'video/quicktime'],
          document: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
          '3d_model': ['model/gltf-binary', 'model/gltf+json', 'application/octet-stream']
        };

        const mediaType = parsed.data.type || item.type;
        const folder = `product-media/${item.catalogItem.id}${item.variant ? `/${item.variant.id}` : ''}`;
        const uploadResult = await uploadFile({
          file: req.file,
          folder,
          allowedMimeTypes: allowedMimeTypes[mediaType] || ['*/*'],
          maxSizeInMB: mediaType === 'video' ? 100 : mediaType === '3d_model' ? 50 : 10
        });
        
        item.url = uploadResult.url;
        item.filename = uploadResult.fileName;
        item.mimeType = uploadResult.mimeType;
        item.sizeBytes = uploadResult.size;
      } catch (error: any) {
        res.status(400).json({ error: { message: `File upload failed: ${error.message}` } });
        return;
      }
    }

    // Update variant if provided
    if (parsed.data.variantId !== undefined) {
      if (parsed.data.variantId) {
        const variantRepo = AppDataSource.getRepository(Variant);
        const variant = await variantRepo.findOne({ 
          where: { id: parsed.data.variantId },
          relations: ['catalogItem']
        });
        if (!variant || variant.catalogItem.id !== item.catalogItem.id) {
          res.status(400).json({ error: { message: 'Invalid variantId' } });
          return;
        }
        item.variant = variant;
      } else {
        item.variant = null;
      }
    }

    // Update other fields
    if (parsed.data.type) item.type = parsed.data.type;
    if (parsed.data.altText !== undefined) item.altText = parsed.data.altText ?? null;
    if (parsed.data.position !== undefined) item.position = parsed.data.position;
    
    // Handle primary flag
    if (parsed.data.isPrimary !== undefined) {
      if (parsed.data.isPrimary) {
        // Unset other primary media
        const queryBuilder = repo.createQueryBuilder()
          .update(ProductMedia)
          .set({ isPrimary: false })
          .where('catalog_item_id = :catalogItemId', { catalogItemId: item.catalogItem.id })
          .andWhere('id != :id', { id: item.id });
        
        if (item.variant) {
          queryBuilder.andWhere('variant_id = :variantId', { variantId: item.variant.id });
        } else {
          queryBuilder.andWhere('variant_id IS NULL');
        }
        
        await queryBuilder.execute();
      }
      item.isPrimary = parsed.data.isPrimary;
    }

    await repo.save(item);

    // Fetch with relations
    const updated = await repo.findOne({
      where: { id: item.id },
      relations: ['catalogItem', 'variant']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(ProductMedia);
    const item = await repo.findOne({ where: { id } });

    if (!item) {
      res.status(404).json({ error: { message: 'Product media not found' } });
      return;
    }

    // Delete file from S3
    try {
      await deleteFileByUrl(item.url);
    } catch (error) {
      console.error('Failed to delete file from S3:', error);
    }

    await repo.remove(item);
    res.status(204).send();
  }
}

