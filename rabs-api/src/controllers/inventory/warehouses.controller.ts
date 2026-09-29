import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { z } from 'zod';
import { Location } from '@entities/iam/Location.js';
import { IsNull } from 'typeorm';

const createWarehouseSchema = z.object({
  locationId: z.string(),
  code: z.string().min(1),
  name: z.string().min(1),
  type: z.enum(['main_hub', 'distribution_center', 'store', 'third_party', 'other']),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2),
  capacityCubicMeters: z.coerce.number().optional(),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).optional()
});

const updateWarehouseSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  type: z.enum(['main_hub', 'distribution_center', 'store', 'third_party', 'other']).optional(),
  addressLine1: z.string().optional(),
  addressLine2: z.string().optional(),
  city: z.string().optional(),
  stateProvince: z.string().optional(),
  postalCode: z.string().optional(),
  countryCode: z.string().length(2).optional(),
  capacityCubicMeters: z.coerce.number().optional(),
  isDefault: z.coerce.boolean().optional(),
  status: z.enum(['active', 'inactive', 'maintenance']).optional()
});

export class WarehousesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(Warehouse);
      const { locationId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('w')
        .leftJoinAndSelect('w.location', 'loc')
        .orderBy('w.createdAt', 'DESC');

      if (locationId) {
        queryBuilder.andWhere('w.location_id = :locId', { locId: locationId });
      }

      if (status) {
        queryBuilder.andWhere('w.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(w.code LIKE :search OR w.name LIKE :search)',
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
      const repo = AppDataSource.getRepository(Warehouse);
      const item = await repo.findOne({
        where: { id: req.params.id, deletedAt: IsNull() },
        relations: ['location']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Warehouse not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createWarehouseSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const locRepo = AppDataSource.getRepository(Location);
      const location = await locRepo.findOne({ where: { id: parsed.data.locationId } });
      if (!location) {
        res.status(400).json({ error: { message: 'Invalid locationId' } });
        return;
      }

      const repo = AppDataSource.getRepository(Warehouse);
      const existing = await repo.findOne({
        where: { code: parsed.data.code, deletedAt: IsNull() }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'Warehouse code already exists' } });
        return;
      }

      const item = repo.create({
        location,
        code: parsed.data.code,
        name: parsed.data.name,
        type: parsed.data.type,
        addressLine1: parsed.data.addressLine1 ?? null,
        addressLine2: parsed.data.addressLine2 ?? null,
        city: parsed.data.city ?? null,
        stateProvince: parsed.data.stateProvince ?? null,
        postalCode: parsed.data.postalCode ?? null,
        countryCode: parsed.data.countryCode,
        capacityCubicMeters: parsed.data.capacityCubicMeters ?? null,
        isDefault: parsed.data.isDefault ?? false,
        status: parsed.data.status ?? 'active'
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['location']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateWarehouseSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(Warehouse);
      const item = await repo.findOne({
        where: { id, deletedAt: IsNull() },
        relations: ['location']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Warehouse not found' } });
        return;
      }

      if (parsed.data.code && parsed.data.code !== item.code) {
        const existing = await repo.findOne({
          where: { code: parsed.data.code, deletedAt: IsNull() }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'Warehouse code already exists' } });
          return;
        }
      }

      if (parsed.data.code) item.code = parsed.data.code;
      if (parsed.data.name) item.name = parsed.data.name;
      if (parsed.data.type) item.type = parsed.data.type;
      if (parsed.data.addressLine1 !== undefined) item.addressLine1 = parsed.data.addressLine1 ?? null;
      if (parsed.data.addressLine2 !== undefined) item.addressLine2 = parsed.data.addressLine2 ?? null;
      if (parsed.data.city !== undefined) item.city = parsed.data.city ?? null;
      if (parsed.data.stateProvince !== undefined) item.stateProvince = parsed.data.stateProvince ?? null;
      if (parsed.data.postalCode !== undefined) item.postalCode = parsed.data.postalCode ?? null;
      if (parsed.data.countryCode) item.countryCode = parsed.data.countryCode;
      if (parsed.data.capacityCubicMeters !== undefined) item.capacityCubicMeters = parsed.data.capacityCubicMeters ?? null;
      if (parsed.data.isDefault !== undefined) item.isDefault = parsed.data.isDefault;
      if (parsed.data.status) item.status = parsed.data.status;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['location']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(Warehouse);
      const item = await repo.findOne({ where: { id, deletedAt: IsNull() } });

      if (!item) {
        res.status(404).json({ error: { message: 'Warehouse not found' } });
        return;
      }

      await repo.softRemove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

