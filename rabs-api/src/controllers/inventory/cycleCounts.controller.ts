import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { CycleCount } from '@entities/inventory/CycleCount.js';
import { CycleCountLine } from '@entities/inventory/CycleCountLine.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { User } from '@entities/iam/User.js';
import { StockItem } from '@entities/inventory/StockItem.js';

const cycleCountLineSchema = z.object({
  stockItemId: z.string(),
  expectedQuantity: z.number(),
  countedQuantity: z.number().optional(),
  notes: z.string().optional()
});

const createCycleCountSchema = z.object({
  organizationId: z.string(),
  warehouseId: z.string(),
  countNumber: z.string().min(1),
  countDate: z.string(),
  countType: z.enum(['full', 'partial', 'abc_class_a', 'abc_class_b', 'abc_class_c', 'spot_check']),
  status: z.enum(['planned', 'in_progress', 'completed', 'reconciled', 'cancelled']).optional(),
  assignedToId: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(cycleCountLineSchema).optional()
});

const updateCycleCountSchema = z.object({
  countNumber: z.string().min(1).optional(),
  countDate: z.string().optional(),
  countType: z.enum(['full', 'partial', 'abc_class_a', 'abc_class_b', 'abc_class_c', 'spot_check']).optional(),
  status: z.enum(['planned', 'in_progress', 'completed', 'reconciled', 'cancelled']).optional(),
  assignedToId: z.string().optional(),
  completedById: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(cycleCountLineSchema).optional()
});

export class CycleCountsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CycleCount);
      const { organizationId, warehouseId, status, countType, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('cc')
        .leftJoinAndSelect('cc.organization', 'org')
        .leftJoinAndSelect('cc.warehouse', 'wh')
        .leftJoinAndSelect('cc.assignedTo', 'assigned')
        .leftJoinAndSelect('cc.completedBy', 'completed')
        .leftJoinAndSelect('cc.lines', 'lines')
        .leftJoinAndSelect('lines.stockItem', 'stockItem')
        .leftJoinAndSelect('stockItem.variant', 'variant')
        .orderBy('cc.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('cc.organization_id = :orgId', { orgId: organizationId });
      }

      if (warehouseId) {
        queryBuilder.andWhere('cc.warehouse_id = :warehouseId', { warehouseId });
      }

      if (status) {
        queryBuilder.andWhere('cc.status = :status', { status });
      }

      if (countType) {
        queryBuilder.andWhere('cc.count_type = :countType', { countType });
      }

      if (search) {
        queryBuilder.andWhere(
          '(cc.count_number LIKE :search OR cc.notes LIKE :search)',
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
      const repo = AppDataSource.getRepository(CycleCount);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'warehouse', 'assignedTo', 'completedBy', 'lines', 'lines.stockItem', 'lines.stockItem.variant', 'lines.stockItem.warehouse']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Cycle count not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createCycleCountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(CycleCount);
      const orgRepo = AppDataSource.getRepository(Organization);
      const warehouseRepo = AppDataSource.getRepository(Warehouse);
      const userRepo = AppDataSource.getRepository(User);
      const stockItemRepo = AppDataSource.getRepository(StockItem);

      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const warehouse = await warehouseRepo.findOne({ where: { id: parsed.data.warehouseId } });
      if (!warehouse) {
        res.status(400).json({ error: { message: 'Invalid warehouseId' } });
        return;
      }

      let assignedTo = null;
      if (parsed.data.assignedToId) {
        assignedTo = await userRepo.findOne({ where: { id: parsed.data.assignedToId } });
        if (!assignedTo) {
          res.status(400).json({ error: { message: 'Invalid assignedToId' } });
          return;
        }
      }

      // Check if count number already exists
      const existing = await repo.findOne({ where: { countNumber: parsed.data.countNumber } });
      if (existing) {
        res.status(400).json({ error: { message: 'Count number already exists' } });
        return;
      }

      const cycleCount = repo.create({
        organization: org,
        warehouse: warehouse,
        countNumber: parsed.data.countNumber,
        countDate: new Date(parsed.data.countDate),
        countType: parsed.data.countType,
        status: parsed.data.status || 'planned',
        assignedTo: assignedTo,
        notes: parsed.data.notes || null,
        totalSkus: parsed.data.lines?.length || 0,
        countedSkus: 0,
        discrepancies: 0
      });

      const saved = await repo.save(cycleCount);

      // Create lines if provided
      if (parsed.data.lines && parsed.data.lines.length > 0) {
        const lineRepo = AppDataSource.getRepository(CycleCountLine);
        
        for (const lineData of parsed.data.lines) {
          const stockItem = await stockItemRepo.findOne({
            where: { id: lineData.stockItemId },
            relations: ['variant', 'warehouse']
          });
          if (!stockItem) continue;

          // Verify stock item belongs to the warehouse
          if (stockItem.warehouse.id !== warehouse.id) {
            continue;
          }

          const line = lineRepo.create({
            cycleCount: saved,
            stockItem: stockItem,
            expectedQuantity: lineData.expectedQuantity,
            countedQuantity: lineData.countedQuantity || null,
            notes: lineData.notes || null
          });
          await lineRepo.save(line);
        }

        // Update counts
        saved.totalSkus = parsed.data.lines.length;
        await repo.save(saved);
      }

      const result = await repo.findOne({
        where: { id: saved.id },
        relations: ['organization', 'warehouse', 'assignedTo', 'lines', 'lines.stockItem', 'lines.stockItem.variant']
      });

      res.status(201).json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateCycleCountSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(CycleCount);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['lines']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Cycle count not found' } });
        return;
      }

      if (parsed.data.countNumber && parsed.data.countNumber !== item.countNumber) {
        const existing = await repo.findOne({ where: { countNumber: parsed.data.countNumber } });
        if (existing) {
          res.status(400).json({ error: { message: 'Count number already exists' } });
          return;
        }
      }

      if (parsed.data.countNumber) item.countNumber = parsed.data.countNumber;
      if (parsed.data.countDate) item.countDate = new Date(parsed.data.countDate);
      if (parsed.data.countType) item.countType = parsed.data.countType;
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes || null;

      if (parsed.data.assignedToId) {
        const userRepo = AppDataSource.getRepository(User);
        const assignedTo = await userRepo.findOne({ where: { id: parsed.data.assignedToId } });
        if (assignedTo) {
          item.assignedTo = assignedTo;
        }
      }

      if (parsed.data.completedById) {
        const userRepo = AppDataSource.getRepository(User);
        const completedBy = await userRepo.findOne({ where: { id: parsed.data.completedById } });
        if (completedBy) {
          item.completedBy = completedBy;
          item.completedAt = new Date();
          if (item.status === 'in_progress') {
            item.status = 'completed';
          }
        }
      }

      // Update lines if provided
      if (parsed.data.lines) {
        const lineRepo = AppDataSource.getRepository(CycleCountLine);
        const stockItemRepo = AppDataSource.getRepository(StockItem);

        // Update existing lines or create new ones
        for (const lineData of parsed.data.lines) {
          const stockItem = await stockItemRepo.findOne({ where: { id: lineData.stockItemId } });
          if (!stockItem) continue;

          const existingLine = item.lines?.find(l => l.stockItem.id === stockItem.id);
          
          if (existingLine) {
            existingLine.countedQuantity = lineData.countedQuantity || null;
            existingLine.notes = lineData.notes || null;
            existingLine.countedAt = lineData.countedQuantity ? new Date() : null;
            await lineRepo.save(existingLine);
          } else {
            const line = lineRepo.create({
              cycleCount: item,
              stockItem: stockItem,
              expectedQuantity: lineData.expectedQuantity,
              countedQuantity: lineData.countedQuantity || null,
              notes: lineData.notes || null,
              countedAt: lineData.countedQuantity ? new Date() : null
            });
            await lineRepo.save(line);
          }
        }

        // Recalculate counts
        const updatedLines = await lineRepo.find({
          where: { cycleCount: { id: item.id } }
        });
        
        item.totalSkus = updatedLines.length;
        item.countedSkus = updatedLines.filter(l => l.countedQuantity !== null).length;
        item.discrepancies = updatedLines.filter(l => {
          if (l.countedQuantity === null) return false;
          return l.countedQuantity !== l.expectedQuantity;
        }).length;
      }

      await repo.save(item);

      const result = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'warehouse', 'assignedTo', 'completedBy', 'lines', 'lines.stockItem', 'lines.stockItem.variant']
      });

      res.json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(CycleCount);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['lines']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Cycle count not found' } });
        return;
      }

      // Lines will be deleted via CASCADE
      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

