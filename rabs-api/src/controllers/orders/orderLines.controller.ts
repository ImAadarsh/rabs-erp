import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { OrderLine } from '@entities/orders/OrderLine.js';
import { z } from 'zod';
import { Order } from '@entities/orders/Order.js';
import { Variant } from '@entities/catalog/Variant.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { IsNull } from 'typeorm';

const createOrderLineSchema = z.object({
  orderId: z.string(),
  variantId: z.string(),
  sku: z.string().min(1),
  name: z.string().min(1),
  quantity: z.number().int().positive(),
  unitPrice: z.number(),
  discountAmount: z.number().optional(),
  taxRate: z.number().optional(),
  taxAmount: z.number().optional(),
  lineTotal: z.number(),
  costPrice: z.number().optional(),
  warehouseId: z.string().optional(),
  fulfillmentStatus: z.enum(['pending', 'allocated', 'picked', 'packed', 'shipped', 'cancelled']).optional(),
  notes: z.string().optional()
});

const updateOrderLineSchema = z.object({
  sku: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  quantity: z.number().int().positive().optional(),
  unitPrice: z.number().optional(),
  discountAmount: z.number().optional(),
  taxRate: z.number().optional(),
  taxAmount: z.number().optional(),
  lineTotal: z.number().optional(),
  costPrice: z.number().optional(),
  quantityFulfilled: z.number().int().optional(),
  warehouseId: z.string().optional(),
  fulfillmentStatus: z.enum(['pending', 'allocated', 'picked', 'packed', 'shipped', 'cancelled']).optional(),
  notes: z.string().optional()
});

export class OrderLinesController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(OrderLine);
      const { orderId, variantId, fulfillmentStatus } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('ol')
        .leftJoinAndSelect('ol.order', 'ord')
        .leftJoinAndSelect('ol.variant', 'var')
        .leftJoinAndSelect('ol.warehouse', 'wh')
        .orderBy('ol.createdAt', 'ASC');

      if (orderId) {
        queryBuilder.andWhere('ol.order_id = :orderId', { orderId });
      }

      if (variantId) {
        queryBuilder.andWhere('ol.variant_id = :variantId', { variantId });
      }

      if (fulfillmentStatus) {
        queryBuilder.andWhere('ol.fulfillment_status = :fulfillmentStatus', { fulfillmentStatus });
      }

      const items = await queryBuilder.getMany();
      res.json({ data: items });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async get(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(OrderLine);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['order', 'variant', 'warehouse', 'backorders']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Order line not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createOrderLineSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const orderRepo = AppDataSource.getRepository(Order);
      const order = await orderRepo.findOne({ where: { id: parsed.data.orderId } });
      if (!order) {
        res.status(400).json({ error: { message: 'Invalid orderId' } });
        return;
      }

      const variantRepo = AppDataSource.getRepository(Variant);
      const variant = await variantRepo.findOne({ where: { id: parsed.data.variantId, deletedAt: IsNull() } });
      if (!variant) {
        res.status(400).json({ error: { message: 'Invalid variantId' } });
        return;
      }

      let warehouse = null;
      if (parsed.data.warehouseId) {
        const whRepo = AppDataSource.getRepository(Warehouse);
        warehouse = await whRepo.findOne({ where: { id: parsed.data.warehouseId, deletedAt: IsNull() } });
        if (!warehouse) {
          res.status(400).json({ error: { message: 'Invalid warehouseId' } });
          return;
        }
      }

      const repo = AppDataSource.getRepository(OrderLine);
      const item = repo.create({
        order,
        variant,
        sku: parsed.data.sku,
        name: parsed.data.name,
        quantity: parsed.data.quantity,
        unitPrice: parsed.data.unitPrice,
        discountAmount: parsed.data.discountAmount ?? 0.00,
        taxRate: parsed.data.taxRate ?? 0.00,
        taxAmount: parsed.data.taxAmount ?? 0.00,
        lineTotal: parsed.data.lineTotal,
        costPrice: parsed.data.costPrice ?? null,
        warehouse: warehouse,
        fulfillmentStatus: parsed.data.fulfillmentStatus ?? 'pending',
        notes: parsed.data.notes ?? null
      });

      await repo.save(item);

      const saved = await repo.findOne({
        where: { id: item.id },
        relations: ['order', 'variant', 'warehouse']
      });

      res.status(201).json({ data: saved });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updateOrderLineSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(OrderLine);
      const item = await repo.findOne({
        where: { id },
        relations: ['order', 'variant', 'warehouse']
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Order line not found' } });
        return;
      }

      if (parsed.data.warehouseId) {
        const whRepo = AppDataSource.getRepository(Warehouse);
        const warehouse = await whRepo.findOne({ where: { id: parsed.data.warehouseId, deletedAt: IsNull() } });
        if (!warehouse) {
          res.status(400).json({ error: { message: 'Invalid warehouseId' } });
          return;
        }
        item.warehouse = warehouse;
      }

      if (parsed.data.sku) item.sku = parsed.data.sku;
      if (parsed.data.name) item.name = parsed.data.name;
      if (parsed.data.quantity !== undefined) item.quantity = parsed.data.quantity;
      if (parsed.data.unitPrice !== undefined) item.unitPrice = parsed.data.unitPrice;
      if (parsed.data.discountAmount !== undefined) item.discountAmount = parsed.data.discountAmount;
      if (parsed.data.taxRate !== undefined) item.taxRate = parsed.data.taxRate;
      if (parsed.data.taxAmount !== undefined) item.taxAmount = parsed.data.taxAmount;
      if (parsed.data.lineTotal !== undefined) item.lineTotal = parsed.data.lineTotal;
      if (parsed.data.costPrice !== undefined) item.costPrice = parsed.data.costPrice ?? null;
      if (parsed.data.quantityFulfilled !== undefined) item.quantityFulfilled = parsed.data.quantityFulfilled;
      if (parsed.data.fulfillmentStatus) item.fulfillmentStatus = parsed.data.fulfillmentStatus;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes ?? null;

      await repo.save(item);

      const updated = await repo.findOne({
        where: { id: item.id },
        relations: ['order', 'variant', 'warehouse']
      });

      res.json({ data: updated });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const repo = AppDataSource.getRepository(OrderLine);
      const item = await repo.findOne({ where: { id } });

      if (!item) {
        res.status(404).json({ error: { message: 'Order line not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

