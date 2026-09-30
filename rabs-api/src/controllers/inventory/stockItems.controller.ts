import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { z } from 'zod';
import { Variant } from '@entities/catalog/Variant.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { Bin } from '@entities/inventory/Bin.js';
import { IsNull } from 'typeorm';

const createStockItemSchema = z.object({
  variantId: z.string(),
  warehouseId: z.string(),
  binId: z.string().optional(),
  lotNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  manufactureDate: z.string().optional(),
  quantityOnHand: z.number().optional(),
  quantityReserved: z.number().optional(),
  safetyStockLevel: z.number().optional(),
  reorderPoint: z.number().optional(),
  reorderQuantity: z.number().optional(),
  status: z.enum(['available', 'reserved', 'quarantine', 'damaged', 'expired']).optional(),
  costPrice: z.number().optional()
});

const updateStockItemSchema = z.object({
  binId: z.string().optional(),
  lotNumber: z.string().optional(),
  serialNumber: z.string().optional(),
  expiryDate: z.string().optional(),
  manufactureDate: z.string().optional(),
  quantityOnHand: z.number().optional(),
  quantityReserved: z.number().optional(),
  safetyStockLevel: z.number().optional(),
  reorderPoint: z.number().optional(),
  reorderQuantity: z.number().optional(),
  status: z.enum(['available', 'reserved', 'quarantine', 'damaged', 'expired']).optional(),
  costPrice: z.number().optional()
});

export class StockItemsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(StockItem);
      const { variantId, warehouseId, binId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('si')
        .leftJoinAndSelect('si.variant', 'v')
        .leftJoinAndSelect('si.warehouse', 'w')
        .leftJoinAndSelect('si.bin', 'b')
        .orderBy('si.createdAt', 'DESC');

      if (variantId) {
        queryBuilder.andWhere('si.variant_id = :variantId', { variantId });
      }

      if (warehouseId) {
        queryBuilder.andWhere('si.warehouse_id = :warehouseId', { warehouseId });
      }

      if (binId) {
        queryBuilder.andWhere('si.bin_id = :binId', { binId });
      }

      if (status) {
        queryBuilder.andWhere('si.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(si.lot_number LIKE :search OR si.serial_number LIKE :search)',
          { search: `%${search}%` }
        );
      }

      const skip = (parseInt(page as string) - 1) * parseInt(limit as string);
      queryBuilder.skip(skip).take(parseInt(limit as string));

      const [items, total] = await queryBuilder.getManyAndCount();
      
      res.json({ 
        data: items, 
        pagination: {
          page: parseInt(page as string),
          limit: parseInt(limit as string),
          total,
          totalPages: Math.ceil(total / parseInt(limit as string))
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(StockItem);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['variant', 'warehouse', 'bin']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Stock item not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createStockItemSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const varRepo = AppDataSource.getRepository(Variant);
      const variant = await varRepo.findOne({ where: { id: parsed.data.variantId } });
      if (!variant) {
        res.status(400).json({ error: { message: 'Invalid variantId' } });
        return;
      }

      const whRepo = AppDataSource.getRepository(Warehouse);
      const warehouse = await whRepo.findOne({ where: { id: parsed.data.warehouseId, deletedAt: IsNull() } });
      if (!warehouse) {
        res.status(400).json({ error: { message: 'Invalid warehouseId' } });
        return;
      }

      let bin = null;
      if (parsed.data.binId) {
        const binRepo = AppDataSource.getRepository(Bin);
        bin = await binRepo.findOne({ where: { id: parsed.data.binId, warehouse: { id: parsed.data.warehouseId } } });
        if (!bin) {
          res.status(400).json({ error: { message: 'Invalid binId or bin does not belong to warehouse' } });
          return;
        }
      }

      const repo = AppDataSource.getRepository(StockItem);
      const whereCondition: any = {
        variant: { id: parsed.data.variantId },
        warehouse: { id: parsed.data.warehouseId },
        lotNumber: parsed.data.lotNumber ?? null,
        serialNumber: parsed.data.serialNumber ?? null
      };
      if (bin) {
        whereCondition.bin = { id: bin.id };
      } else {
        whereCondition.bin = IsNull();
      }
      const existing = await repo.findOne({ where: whereCondition });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Stock item already exists with these attributes' } });
        return;
      }

      const item = repo.create({
        variant,
        warehouse,
        bin,
        lotNumber: parsed.data.lotNumber ?? null,
        serialNumber: parsed.data.serialNumber ?? null,
        expiryDate: parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null,
        manufactureDate: parsed.data.manufactureDate ? new Date(parsed.data.manufactureDate) : null,
        quantityOnHand: parsed.data.quantityOnHand ?? 0,
        quantityReserved: parsed.data.quantityReserved ?? 0,
        safetyStockLevel: parsed.data.safetyStockLevel ?? 0,
        reorderPoint: parsed.data.reorderPoint ?? 0,
        reorderQuantity: parsed.data.reorderQuantity ?? 0,
        status: parsed.data.status ?? 'available',
        costPrice: parsed.data.costPrice ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['variant', 'warehouse', 'bin']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateStockItemSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(StockItem);
      const item = await repo.findOne({
        where: { id },
        relations: ['variant', 'warehouse', 'bin']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Stock item not found' } });
        return;
      }

      if (parsed.data.binId !== undefined) {
        if (parsed.data.binId) {
          const binRepo = AppDataSource.getRepository(Bin);
          const bin = await binRepo.findOne({ where: { id: parsed.data.binId, warehouse: { id: item.warehouse.id } } });
          if (!bin) {
            res.status(400).json({ error: { message: 'Invalid binId or bin does not belong to warehouse' } });
            return;
          }
          item.bin = bin;
        } else {
          item.bin = null;
        }
      }

      if (parsed.data.lotNumber !== undefined) item.lotNumber = parsed.data.lotNumber ?? null;
      if (parsed.data.serialNumber !== undefined) item.serialNumber = parsed.data.serialNumber ?? null;
      if (parsed.data.expiryDate !== undefined) item.expiryDate = parsed.data.expiryDate ? new Date(parsed.data.expiryDate) : null;
      if (parsed.data.manufactureDate !== undefined) item.manufactureDate = parsed.data.manufactureDate ? new Date(parsed.data.manufactureDate) : null;
      if (parsed.data.quantityOnHand !== undefined) item.quantityOnHand = parsed.data.quantityOnHand;
      if (parsed.data.quantityReserved !== undefined) item.quantityReserved = parsed.data.quantityReserved;
      if (parsed.data.safetyStockLevel !== undefined) item.safetyStockLevel = parsed.data.safetyStockLevel;
      if (parsed.data.reorderPoint !== undefined) item.reorderPoint = parsed.data.reorderPoint;
      if (parsed.data.reorderQuantity !== undefined) item.reorderQuantity = parsed.data.reorderQuantity;
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.costPrice !== undefined) item.costPrice = parsed.data.costPrice ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['variant', 'warehouse', 'bin']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(StockItem);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Stock item not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

