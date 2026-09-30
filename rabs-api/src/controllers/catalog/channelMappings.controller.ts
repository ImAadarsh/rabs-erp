import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { ChannelMapping } from '@entities/catalog/ChannelMapping.js';
import { CatalogItem } from '@entities/catalog/CatalogItem.js';
import { Variant } from '@entities/catalog/Variant.js';
import { z } from 'zod';
import { IsNull } from 'typeorm';

const createChannelMappingSchema = z.object({
  catalogItemId: z.string(),
  variantId: z.string().optional(),
  channel: z.enum(['amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'wix', 'b2b_portal', 'pos']),
  channelProductId: z.string().optional(),
  channelVariantId: z.string().optional(),
  channelUrl: z.string().url().optional(),
  attributes: z.record(z.any()).optional(),
  syncEnabled: z.boolean().optional(),
  syncStatus: z.enum(['pending', 'synced', 'failed', 'disabled']).optional()
});

const updateChannelMappingSchema = z.object({
  variantId: z.string().optional().nullable(),
  channelProductId: z.string().optional(),
  channelVariantId: z.string().optional(),
  channelUrl: z.string().url().optional(),
  attributes: z.record(z.any()).optional(),
  syncEnabled: z.boolean().optional(),
  syncStatus: z.enum(['pending', 'synced', 'failed', 'disabled']).optional(),
  syncError: z.string().optional()
});

export class ChannelMappingsController {
  static async list(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ChannelMapping);
    const { catalogItemId, variantId, channel, syncStatus } = req.query;
    
    const queryBuilder = repo.createQueryBuilder('cm')
      .leftJoinAndSelect('cm.catalogItem', 'ci')
      .leftJoinAndSelect('cm.variant', 'v')
      .orderBy('cm.createdAt', 'DESC');

    if (catalogItemId) {
      queryBuilder.andWhere('cm.catalog_item_id = :catalogItemId', { catalogItemId });
    }

    if (variantId) {
      queryBuilder.andWhere('cm.variant_id = :variantId', { variantId });
    }

    if (channel) {
      queryBuilder.andWhere('cm.channel = :channel', { channel });
    }

    if (syncStatus) {
      queryBuilder.andWhere('cm.sync_status = :syncStatus', { syncStatus });
    }

    const mappings = await queryBuilder.getMany();
    res.json({ data: mappings });
  }

  static async get(req: Request, res: Response): Promise<void> {
    const repo = AppDataSource.getRepository(ChannelMapping);
    const mapping = await repo.findOne({
      where: { id: req.params.id },
      relations: ['catalogItem', 'variant']
    });
    
    if (!mapping) {
      res.status(404).json({ error: { message: 'Channel mapping not found' } });
      return;
    }
    
    res.json({ data: mapping });
  }

  static async create(req: Request, res: Response): Promise<void> {
    const parsed = createChannelMappingSchema.safeParse(req.body);
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

    // Check for duplicate channel mapping
    const repo = AppDataSource.getRepository(ChannelMapping);
    const whereCondition: any = {
      channel: parsed.data.channel,
      catalogItem: { id: catalogItem.id }
    };
    if (variant) {
      whereCondition.variant = { id: variant.id };
    } else {
      whereCondition.variant = IsNull();
    }
    const existing = await repo.findOne({
      where: whereCondition
    });

    if (existing) {
      res.status(400).json({ error: { message: 'Channel mapping already exists for this catalog item/variant combination' } });
      return;
    }

    const mapping = repo.create({
      catalogItem,
      variant,
      channel: parsed.data.channel,
      channelProductId: parsed.data.channelProductId ?? null,
      channelVariantId: parsed.data.channelVariantId ?? null,
      channelUrl: parsed.data.channelUrl ?? null,
      attributes: parsed.data.attributes ?? null,
      syncEnabled: parsed.data.syncEnabled ?? true,
      syncStatus: parsed.data.syncStatus ?? 'pending'
    });

    await repo.save(mapping);

    const saved = await repo.findOne({
      where: { id: mapping.id },
      relations: ['catalogItem', 'variant']
    });

    res.status(201).json({ data: saved });
  }

  static async update(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const parsed = updateChannelMappingSchema.safeParse(req.body);
    
    if (!parsed.success) {
      res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
      return;
    }

    const repo = AppDataSource.getRepository(ChannelMapping);
    const mapping = await repo.findOne({
      where: { id },
      relations: ['catalogItem', 'variant']
    });

    if (!mapping) {
      res.status(404).json({ error: { message: 'Channel mapping not found' } });
      return;
    }

    if (parsed.data.variantId !== undefined) {
      if (parsed.data.variantId) {
        const variantRepo = AppDataSource.getRepository(Variant);
        const variant = await variantRepo.findOne({ 
          where: { id: parsed.data.variantId },
          relations: ['catalogItem']
        });
        
        if (!variant || variant.catalogItem.id !== mapping.catalogItem.id) {
          res.status(400).json({ error: { message: 'Invalid variantId' } });
          return;
        }
        mapping.variant = variant;
      } else {
        mapping.variant = null;
      }
    }

    if (parsed.data.channelProductId !== undefined) mapping.channelProductId = parsed.data.channelProductId ?? null;
    if (parsed.data.channelVariantId !== undefined) mapping.channelVariantId = parsed.data.channelVariantId ?? null;
    if (parsed.data.channelUrl !== undefined) mapping.channelUrl = parsed.data.channelUrl ?? null;
    if (parsed.data.attributes !== undefined) mapping.attributes = parsed.data.attributes ?? null;
    if (parsed.data.syncEnabled !== undefined) mapping.syncEnabled = parsed.data.syncEnabled;
    if (parsed.data.syncStatus !== undefined) mapping.syncStatus = parsed.data.syncStatus;
    if (parsed.data.syncError !== undefined) mapping.syncError = parsed.data.syncError ?? null;

    await repo.save(mapping);

    const updated = await repo.findOne({
      where: { id: mapping.id },
      relations: ['catalogItem', 'variant']
    });

    res.json({ data: updated });
  }

  static async remove(req: Request, res: Response): Promise<void> {
    const { id } = req.params;
    const repo = AppDataSource.getRepository(ChannelMapping);
    const mapping = await repo.findOne({ where: { id } });

    if (!mapping) {
      res.status(404).json({ error: { message: 'Channel mapping not found' } });
      return;
    }

    await repo.remove(mapping);
    res.status(204).send();
  }
}

