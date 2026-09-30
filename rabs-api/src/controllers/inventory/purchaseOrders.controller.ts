import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PurchaseOrder } from '@entities/inventory/PurchaseOrder.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { IsNull } from 'typeorm';

const createPurchaseOrderSchema = z.object({
  organizationId: z.string(),
  supplierId: z.string(),
  warehouseId: z.string(),
  poNumber: z.string().min(1),
  reference: z.string().optional(),
  orderDate: z.string(),
  expectedDeliveryDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  subtotal: z.number().optional(),
  taxAmount: z.number().optional(),
  shippingCost: z.number().optional(),
  otherCosts: z.number().optional(),
  total: z.number().optional(),
  status: z.enum(['draft', 'submitted', 'confirmed', 'partial_received', 'received', 'cancelled']).optional(),
  notes: z.string().optional()
});

const updatePurchaseOrderSchema = z.object({
  poNumber: z.string().min(1).optional(),
  reference: z.string().optional(),
  orderDate: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  subtotal: z.number().optional(),
  taxAmount: z.number().optional(),
  shippingCost: z.number().optional(),
  otherCosts: z.number().optional(),
  total: z.number().optional(),
  status: z.enum(['draft', 'submitted', 'confirmed', 'partial_received', 'received', 'cancelled']).optional(),
  notes: z.string().optional()
});

export class PurchaseOrdersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(PurchaseOrder);
      const { organizationId, supplierId, warehouseId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('po')
        .leftJoinAndSelect('po.organization', 'org')
        .leftJoinAndSelect('po.supplier', 'sup')
        .leftJoinAndSelect('po.warehouse', 'wh')
        .orderBy('po.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('po.organization_id = :orgId', { orgId: organizationId });
      }

      if (supplierId) {
        queryBuilder.andWhere('po.supplier_id = :supplierId', { supplierId });
      }

      if (warehouseId) {
        queryBuilder.andWhere('po.warehouse_id = :warehouseId', { warehouseId });
      }

      if (status) {
        queryBuilder.andWhere('po.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(po.po_number LIKE :search OR po.reference LIKE :search)',
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
      const repo = AppDataSource.getRepository(PurchaseOrder);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'supplier', 'warehouse', 'lines', 'lines.variant', 'createdBy', 'approvedBy']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Purchase order not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createPurchaseOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const orgRepo = AppDataSource.getRepository(Organization);
      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const supRepo = AppDataSource.getRepository(Supplier);
      const supplier = await supRepo.findOne({ where: { id: parsed.data.supplierId, deletedAt: IsNull() } });
      if (!supplier) {
        res.status(400).json({ error: { message: 'Invalid supplierId' } });
        return;
      }

      const whRepo = AppDataSource.getRepository(Warehouse);
      const warehouse = await whRepo.findOne({ where: { id: parsed.data.warehouseId, deletedAt: IsNull() } });
      if (!warehouse) {
        res.status(400).json({ error: { message: 'Invalid warehouseId' } });
        return;
      }

      const repo = AppDataSource.getRepository(PurchaseOrder);
      const existing = await repo.findOne({
        where: { poNumber: parsed.data.poNumber }
      });
      
      if (existing) {
        res.status(400).json({ error: { message: 'PO number already exists' } });
        return;
      }

      const item = repo.create({
        organization: org,
        supplier,
        warehouse,
        poNumber: parsed.data.poNumber,
        reference: parsed.data.reference ?? null,
        orderDate: new Date(parsed.data.orderDate),
        expectedDeliveryDate: parsed.data.expectedDeliveryDate ? new Date(parsed.data.expectedDeliveryDate) : null,
        currency: parsed.data.currency ?? 'GBP',
        subtotal: parsed.data.subtotal ?? 0.00,
        taxAmount: parsed.data.taxAmount ?? 0.00,
        shippingCost: parsed.data.shippingCost ?? 0.00,
        otherCosts: parsed.data.otherCosts ?? 0.00,
        total: parsed.data.total ?? 0.00,
        status: parsed.data.status ?? 'draft',
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'supplier', 'warehouse']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updatePurchaseOrderSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(PurchaseOrder);
      const item = await repo.findOne({
        where: { id },
        relations: ['organization', 'supplier', 'warehouse']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Purchase order not found' } });
        return;
      }

      if (parsed.data.poNumber && parsed.data.poNumber !== item.poNumber) {
        const existing = await repo.findOne({
          where: { poNumber: parsed.data.poNumber }
        });
        
        if (existing) {
          res.status(400).json({ error: { message: 'PO number already exists' } });
          return;
        }
      }

      if (parsed.data.poNumber) item.poNumber = parsed.data.poNumber;
      if (parsed.data.reference !== undefined) item.reference = parsed.data.reference ?? null;
      if (parsed.data.orderDate) item.orderDate = new Date(parsed.data.orderDate);
      if (parsed.data.expectedDeliveryDate !== undefined) item.expectedDeliveryDate = parsed.data.expectedDeliveryDate ? new Date(parsed.data.expectedDeliveryDate) : null;
      if (parsed.data.currency) item.currency = parsed.data.currency;
      if (parsed.data.subtotal !== undefined) item.subtotal = parsed.data.subtotal;
      if (parsed.data.taxAmount !== undefined) item.taxAmount = parsed.data.taxAmount;
      if (parsed.data.shippingCost !== undefined) item.shippingCost = parsed.data.shippingCost;
      if (parsed.data.otherCosts !== undefined) item.otherCosts = parsed.data.otherCosts;
      if (parsed.data.total !== undefined) item.total = parsed.data.total;
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'supplier', 'warehouse']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(PurchaseOrder);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Purchase order not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

