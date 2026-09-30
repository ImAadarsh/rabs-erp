import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { ASN } from '@entities/inventory/ASN.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { PurchaseOrder } from '@entities/inventory/PurchaseOrder.js';

const createASNSchema = z.object({
  organizationId: z.string(),
  purchaseOrderId: z.string().optional(),
  supplierId: z.string(),
  warehouseId: z.string(),
  asnNumber: z.string().min(1),
  reference: z.string().optional(),
  expectedDate: z.string(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  totalPallets: z.coerce.number().optional(),
  totalCartons: z.coerce.number().optional(),
  status: z.enum(['pending', 'in_transit', 'arrived', 'receiving', 'completed', 'cancelled']).optional(),
  notes: z.string().optional()
});

const updateASNSchema = z.object({
  asnNumber: z.string().min(1).optional(),
  reference: z.string().optional(),
  expectedDate: z.string().optional(),
  carrier: z.string().optional(),
  trackingNumber: z.string().optional(),
  totalPallets: z.coerce.number().optional(),
  totalCartons: z.coerce.number().optional(),
  status: z.enum(['pending', 'in_transit', 'arrived', 'receiving', 'completed', 'cancelled']).optional(),
  notes: z.string().optional()
});

export class ASNController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(ASN);
      const { organizationId, purchaseOrderId, supplierId, warehouseId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('asn')
        .leftJoinAndSelect('asn.organization', 'org')
        .leftJoinAndSelect('asn.purchaseOrder', 'po')
        .leftJoinAndSelect('asn.supplier', 'sup')
        .leftJoinAndSelect('asn.warehouse', 'wh')
        .orderBy('asn.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('asn.organization_id = :orgId', { orgId: organizationId });
      }

      if (purchaseOrderId) {
        queryBuilder.andWhere('asn.purchase_order_id = :poId', { poId: purchaseOrderId });
      }

      if (supplierId) {
        queryBuilder.andWhere('asn.supplier_id = :supplierId', { supplierId });
      }

      if (warehouseId) {
        queryBuilder.andWhere('asn.warehouse_id = :warehouseId', { warehouseId });
      }

      if (status) {
        queryBuilder.andWhere('asn.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(asn.asn_number LIKE :search OR asn.reference LIKE :search OR asn.tracking_number LIKE :search)',
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
      const repo = AppDataSource.getRepository(ASN);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'purchaseOrder', 'supplier', 'warehouse']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'ASN not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createASNSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(ASN);
      const orgRepo = AppDataSource.getRepository(Organization);
      const supplierRepo = AppDataSource.getRepository(Supplier);
      const warehouseRepo = AppDataSource.getRepository(Warehouse);

      const org = await orgRepo.findOne({ where: { id: parsed.data.organizationId } });
      if (!org) {
        res.status(400).json({ error: { message: 'Invalid organizationId' } });
        return;
      }

      const supplier = await supplierRepo.findOne({ where: { id: parsed.data.supplierId } });
      if (!supplier) {
        res.status(400).json({ error: { message: 'Invalid supplierId' } });
        return;
      }

      const warehouse = await warehouseRepo.findOne({ where: { id: parsed.data.warehouseId } });
      if (!warehouse) {
        res.status(400).json({ error: { message: 'Invalid warehouseId' } });
        return;
      }

      let purchaseOrder = null;
      if (parsed.data.purchaseOrderId) {
        const poRepo = AppDataSource.getRepository(PurchaseOrder);
        purchaseOrder = await poRepo.findOne({ where: { id: parsed.data.purchaseOrderId } });
        if (!purchaseOrder) {
          res.status(400).json({ error: { message: 'Invalid purchaseOrderId' } });
          return;
        }
      }

      // Check if ASN number already exists
      const existing = await repo.findOne({ where: { asnNumber: parsed.data.asnNumber } });
      if (existing) {
        res.status(400).json({ error: { message: 'ASN number already exists' } });
        return;
      }

      const entity = repo.create({
        organization: org,
        purchaseOrder: purchaseOrder,
        supplier: supplier,
        warehouse: warehouse,
        asnNumber: parsed.data.asnNumber,
        reference: parsed.data.reference || null,
        expectedDate: new Date(parsed.data.expectedDate),
        carrier: parsed.data.carrier || null,
        trackingNumber: parsed.data.trackingNumber || null,
        totalPallets: parsed.data.totalPallets || null,
        totalCartons: parsed.data.totalCartons || null,
        status: parsed.data.status || 'pending',
        notes: parsed.data.notes || null
      });

      const saved = await repo.save(entity);
      
      const result = await repo.findOne({
        where: { id: saved.id },
        relations: ['organization', 'purchaseOrder', 'supplier', 'warehouse']
      });

      res.status(201).json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateASNSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(ASN);
      const item = await repo.findOne({ where: { id: req.params.id } });
      
      if (!item) {
        res.status(404).json({ error: { message: 'ASN not found' } });
        return;
      }

      if (parsed.data.asnNumber && parsed.data.asnNumber !== item.asnNumber) {
        const existing = await repo.findOne({ where: { asnNumber: parsed.data.asnNumber } });
        if (existing) {
          res.status(400).json({ error: { message: 'ASN number already exists' } });
          return;
        }
      }

      if (parsed.data.asnNumber) item.asnNumber = parsed.data.asnNumber;
      if (parsed.data.reference !== undefined) item.reference = parsed.data.reference || null;
      if (parsed.data.expectedDate) item.expectedDate = new Date(parsed.data.expectedDate);
      if (parsed.data.carrier !== undefined) item.carrier = parsed.data.carrier || null;
      if (parsed.data.trackingNumber !== undefined) item.trackingNumber = parsed.data.trackingNumber || null;
      if (parsed.data.totalPallets !== undefined) item.totalPallets = parsed.data.totalPallets || null;
      if (parsed.data.totalCartons !== undefined) item.totalCartons = parsed.data.totalCartons || null;
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes || null;

      await repo.save(item);

      const result = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'purchaseOrder', 'supplier', 'warehouse']
      });

      res.json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(ASN);
      const item = await repo.findOne({ where: { id: req.params.id } });
      
      if (!item) {
        res.status(404).json({ error: { message: 'ASN not found' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}

