import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { StockAdjustment } from '@entities/inventory/StockAdjustment.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';

const createStockAdjustmentSchema = z.object({
  organizationId: z.string(),
  stockItemId: z.string(),
  adjustmentNumber: z.string().min(1),
  adjustmentDate: z.string(),
  adjustmentType: z.enum(['increase', 'decrease', 'correction', 'write_off', 'found', 'damaged']),
  quantityChange: z.number(),
  reason: z.string().min(1),
  costImpact: z.coerce.number().optional(),
  adjustedById: z.string()
});

const updateStockAdjustmentSchema = z.object({
  adjustmentNumber: z.string().min(1).optional(),
  adjustmentDate: z.string().optional(),
  adjustmentType: z.enum(['increase', 'decrease', 'correction', 'write_off', 'found', 'damaged']).optional(),
  quantityChange: z.number().optional(),
  reason: z.string().min(1).optional(),
  costImpact: z.coerce.number().optional(),
  approvedById: z.string().optional()
});

export class StockAdjustmentsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(StockAdjustment);
      const { organizationId, stockItemId, adjustmentType, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('sa')
        .leftJoinAndSelect('sa.organization', 'org')
        .leftJoinAndSelect('sa.stockItem', 'si')
        .leftJoinAndSelect('si.variant', 'variant')
        .leftJoinAndSelect('si.warehouse', 'warehouse')
        .leftJoinAndSelect('sa.adjustedBy', 'adjustedBy')
        .leftJoinAndSelect('sa.approvedBy', 'approvedBy')
        .orderBy('sa.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('sa.organization_id = :orgId', { orgId: organizationId });
      }

      if (stockItemId) {
        queryBuilder.andWhere('sa.stock_item_id = :stockItemId', { stockItemId });
      }

      if (adjustmentType) {
        queryBuilder.andWhere('sa.adjustment_type = :adjustmentType', { adjustmentType });
      }

      if (search) {
        queryBuilder.andWhere(
          '(sa.adjustment_number LIKE :search OR sa.reason LIKE :search)',
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
      const repo = AppDataSource.getRepository(StockAdjustment);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'stockItem', 'stockItem.variant', 'stockItem.warehouse', 'adjustedBy', 'approvedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Stock adjustment not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createStockAdjustmentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(StockAdjustment);
      const orgRepo = AppDataSource.getRepository(Organization);
      const stockItemRepo = AppDataSource.getRepository(StockItem);
      const userRepo = AppDataSource.getRepository(User);

      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const stockItem = await stockItemRepo.findOne({
        where: { id: parsed.data.stockItemId },
        relations: ['variant', 'warehouse']
      });
      if (!stockItem) {
        res.status(400).json({ error: { message: 'Invalid stockItemId' } });
        return;
      }

      const adjustedBy = await userRepo.findOne({ where: { id: parsed.data.adjustedById } });
      if (!adjustedBy) {
        res.status(400).json({ error: { message: 'Invalid adjustedById' } });
        return;
      }

      // Check if adjustment number already exists
      const existing = await repo.findOne({ where: { adjustmentNumber: parsed.data.adjustmentNumber } });
      if (existing) {
        res.status(400).json({ error: { message: 'Adjustment number already exists' } });
        return;
      }

      const entity = repo.create({
        organization: org,
        stockItem: stockItem,
        adjustmentNumber: parsed.data.adjustmentNumber,
        adjustmentDate: new Date(parsed.data.adjustmentDate),
        adjustmentType: parsed.data.adjustmentType,
        quantityChange: parsed.data.quantityChange,
        reason: parsed.data.reason,
        costImpact: parsed.data.costImpact || 0,
        adjustedBy: adjustedBy
      });

      const saved = await repo.save(entity);

      // Update stock item quantity based on adjustment type
      if (parsed.data.adjustmentType === 'increase' || parsed.data.adjustmentType === 'found') {
        stockItem.quantityOnHand = (stockItem.quantityOnHand || 0) + parsed.data.quantityChange;
      } else if (parsed.data.adjustmentType === 'decrease' || parsed.data.adjustmentType === 'write_off' || parsed.data.adjustmentType === 'damaged') {
        stockItem.quantityOnHand = Math.max(0, (stockItem.quantityOnHand || 0) - parsed.data.quantityChange);
      } else if (parsed.data.adjustmentType === 'correction') {
        stockItem.quantityOnHand = parsed.data.quantityChange;
      }
      await stockItemRepo.save(stockItem);

      const result = await repo.findOne({
        where: { id: saved.id },
        relations: ['organization', 'stockItem', 'stockItem.variant', 'stockItem.warehouse', 'adjustedBy']
      });

      res.status(201).json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateStockAdjustmentSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(StockAdjustment);
      const item = await repo.findOne({ where: { id: req.params.id } });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Stock adjustment not found' } });
        return;
      }

      if (parsed.data.adjustmentNumber && parsed.data.adjustmentNumber !== item.adjustmentNumber) {
        const existing = await repo.findOne({ where: { adjustmentNumber: parsed.data.adjustmentNumber } });
        if (existing) {
          res.status(400).json({ error: { message: 'Adjustment number already exists' } });
          return;
        }
      }

      if (parsed.data.adjustmentNumber) item.adjustmentNumber = parsed.data.adjustmentNumber;
      if (parsed.data.adjustmentDate) item.adjustmentDate = new Date(parsed.data.adjustmentDate);
      if (parsed.data.adjustmentType) item.adjustmentType = parsed.data.adjustmentType;
      if (parsed.data.quantityChange !== undefined) item.quantityChange = parsed.data.quantityChange;
      if (parsed.data.reason) item.reason = parsed.data.reason;
      if (parsed.data.costImpact !== undefined) item.costImpact = parsed.data.costImpact;

      if (parsed.data.approvedById) {
        const userRepo = AppDataSource.getRepository(User);
        const approvedBy = await userRepo.findOne({ where: { id: parsed.data.approvedById } });
        if (approvedBy) {
          item.approvedBy = approvedBy;
          item.approvedAt = new Date();
        }
      }

      await repo.save(item);

      const result = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'stockItem', 'stockItem.variant', 'stockItem.warehouse', 'adjustedBy', 'approvedBy']
      });

      res.json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(StockAdjustment);
      const item = await repo.findOne({ where: { id: req.params.id } });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Stock adjustment not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

