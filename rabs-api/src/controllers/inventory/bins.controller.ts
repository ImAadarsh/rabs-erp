import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Bin } from '@entities/inventory/Bin.js';
import { z } from 'zod';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { IsNull } from 'typeorm';

const createBinSchema = z.object({
  warehouseId: z.string(),
  code: z.string().min(1),
  name: z.string().optional(),
  zone: z.string().optional(),
  aisle: z.string().optional(),
  rack: z.string().optional(),
  shelf: z.string().optional(),
  binType: z.enum(['standard', 'bulk', 'cold_storage', 'hazmat', 'quarantine', 'staging', 'returns']).optional(),
  capacityCubicMeters: z.coerce.number().optional(),
  maxWeightKg: z.coerce.number().optional(),
  barcode: z.string().optional(),
  status: z.enum(['active', 'inactive', 'full', 'maintenance']).optional()
});

const updateBinSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().optional(),
  zone: z.string().optional(),
  aisle: z.string().optional(),
  rack: z.string().optional(),
  shelf: z.string().optional(),
  binType: z.enum(['standard', 'bulk', 'cold_storage', 'hazmat', 'quarantine', 'staging', 'returns']).optional(),
  capacityCubicMeters: z.coerce.number().optional(),
  maxWeightKg: z.coerce.number().optional(),
  barcode: z.string().optional(),
  status: z.enum(['active', 'inactive', 'full', 'maintenance']).optional()
});

export class BinsController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Bin);
      const { warehouseId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('b')
        .leftJoinAndSelect('b.warehouse', 'w')
        .orderBy('b.createdAt', 'DESC');

      if (warehouseId) {
        queryBuilder.andWhere('b.warehouse_id = :warehouseId', { warehouseId });
      }

      if (status) {
        queryBuilder.andWhere('b.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(b.code LIKE :search OR b.name LIKE :search)',
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
      const repo = AppDataSource.getRepository(Bin);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['warehouse']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Bin not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createBinSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const whRepo = AppDataSource.getRepository(Warehouse);
      const warehouse = await whRepo.findOne({ where: { id: parsed.data.warehouseId, deletedAt: IsNull() } });
      if (!warehouse) {
        res.status(400).json({ error: { message: 'Invalid warehouseId' } });
        return;
      }

      const repo = AppDataSource.getRepository(Bin);
      const existing = await repo.findOne({
        where: { warehouse: { id: parsed.data.warehouseId }, code: parsed.data.code }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Bin code already exists in this warehouse' } });
        return;
      }

      const item = repo.create({
        warehouse,
        code: parsed.data.code,
        name: parsed.data.name ?? null,
        zone: parsed.data.zone ?? null,
        aisle: parsed.data.aisle ?? null,
        rack: parsed.data.rack ?? null,
        shelf: parsed.data.shelf ?? null,
        binType: parsed.data.binType ?? 'standard',
        capacityCubicMeters: parsed.data.capacityCubicMeters ?? null,
        maxWeightKg: parsed.data.maxWeightKg ?? null,
        barcode: parsed.data.barcode ?? null,
        status: parsed.data.status ?? 'active'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['warehouse']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateBinSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Bin);
      const item = await repo.findOne({
        where: { id },
        relations: ['warehouse']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Bin not found' } });
        return;
      }

      if (parsed.data.code && parsed.data.code !== item.code) {
        const existing = await repo.findOne({
          where: { warehouse: { id: item.warehouse.id }, code: parsed.data.code }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Bin code already exists in this warehouse' } });
          return;
        }
      }

      if (parsed.data.code) item.code = parsed.data.code;
      if (parsed.data.name !== undefined) item.name = parsed.data.name ?? null;
      if (parsed.data.zone !== undefined) item.zone = parsed.data.zone ?? null;
      if (parsed.data.aisle !== undefined) item.aisle = parsed.data.aisle ?? null;
      if (parsed.data.rack !== undefined) item.rack = parsed.data.rack ?? null;
      if (parsed.data.shelf !== undefined) item.shelf = parsed.data.shelf ?? null;
      if (parsed.data.binType) item.binType = parsed.data.binType;
      if (parsed.data.capacityCubicMeters !== undefined) item.capacityCubicMeters = parsed.data.capacityCubicMeters ?? null;
      if (parsed.data.maxWeightKg !== undefined) item.maxWeightKg = parsed.data.maxWeightKg ?? null;
      if (parsed.data.barcode !== undefined) item.barcode = parsed.data.barcode ?? null;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['warehouse']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Bin);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Bin not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

