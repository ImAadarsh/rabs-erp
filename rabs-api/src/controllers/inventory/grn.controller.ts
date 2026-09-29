import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { GRN } from '@entities/inventory/GRN.js';
import { GRNLine } from '@entities/inventory/GRNLine.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { User } from '@entities/iam/User.js';
import { ASN } from '@entities/inventory/ASN.js';
import { PurchaseOrder } from '@entities/inventory/PurchaseOrder.js';
import { Variant } from '@entities/catalog/Variant.js';

const grnLineSchema = z.object({
  purchaseOrderLineId: z.string().optional(),
  variantId: z.string(),
  quantityExpected: z.number(),
  quantityReceived: z.number(),
  quantityRejected: z.number().optional(),
  lotNumber: z.string().optional(),
  serialNumbers: z.string().optional(),
  expiryDate: z.string().optional(),
  qaStatus: z.enum(['pending', 'passed', 'failed', 'quarantine']).optional(),
  qaNotes: z.string().optional()
});

const createGRNSchema = z.object({
  organizationId: z.string(),
  asnId: z.string().optional(),
  purchaseOrderId: z.string().optional(),
  warehouseId: z.string(),
  grnNumber: z.string().min(1),
  receivedDate: z.string(),
  receivedById: z.string(),
  status: z.enum(['draft', 'qa_pending', 'approved', 'rejected', 'put_away']).optional(),
  notes: z.string().optional(),
  lines: z.array(grnLineSchema).min(1)
});

const updateGRNSchema = z.object({
  grnNumber: z.string().min(1).optional(),
  receivedDate: z.string().optional(),
  status: z.enum(['draft', 'qa_pending', 'approved', 'rejected', 'put_away']).optional(),
  notes: z.string().optional(),
  lines: z.array(grnLineSchema).optional()
});

export class GRNController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(GRN);
      const { organizationId, asnId, purchaseOrderId, warehouseId, status, search, page = '1', limit = '50' } = req.query;
      
      const queryBuilder = repo.createQueryBuilder('grn')
        .leftJoinAndSelect('grn.organization', 'org')
        .leftJoinAndSelect('grn.asn', 'asn')
        .leftJoinAndSelect('grn.purchaseOrder', 'po')
        .leftJoinAndSelect('grn.warehouse', 'wh')
        .leftJoinAndSelect('grn.receivedBy', 'user')
        .leftJoinAndSelect('grn.lines', 'lines')
        .leftJoinAndSelect('lines.variant', 'variant')
        .orderBy('grn.createdAt', 'DESC');

      if (organizationId) {
        queryBuilder.andWhere('grn.organization_id = :orgId', { orgId: organizationId });
      }

      if (asnId) {
        queryBuilder.andWhere('grn.asn_id = :asnId', { asnId });
      }

      if (purchaseOrderId) {
        queryBuilder.andWhere('grn.purchase_order_id = :poId', { poId: purchaseOrderId });
      }

      if (warehouseId) {
        queryBuilder.andWhere('grn.warehouse_id = :warehouseId', { warehouseId });
      }

      if (status) {
        queryBuilder.andWhere('grn.status = :status', { status });
      }

      if (search) {
        queryBuilder.andWhere(
          '(grn.grn_number LIKE :search OR grn.notes LIKE :search)',
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
      const repo = AppDataSource.getRepository(GRN);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['organization', 'asn', 'purchaseOrder', 'warehouse', 'receivedBy', 'lines', 'lines.variant', 'lines.purchaseOrderLine']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'GRN not found' } });
        return;
      }
      
      res.json({ data: item });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createGRNSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(GRN);
      const orgRepo = AppDataSource.getRepository(Organization);
      const warehouseRepo = AppDataSource.getRepository(Warehouse);
      const userRepo = AppDataSource.getRepository(User);

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

      const receivedBy = await userRepo.findOne({ where: { id: parsed.data.receivedById } });
      if (!receivedBy) {
        res.status(400).json({ error: { message: 'Invalid receivedById' } });
        return;
      }

      let asn = null;
      if (parsed.data.asnId) {
        const asnRepo = AppDataSource.getRepository(ASN);
        asn = await asnRepo.findOne({ where: { id: parsed.data.asnId } });
        if (!asn) {
          res.status(400).json({ error: { message: 'Invalid asnId' } });
          return;
        }
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

      // Check if GRN number already exists
      const existing = await repo.findOne({ where: { grnNumber: parsed.data.grnNumber } });
      if (existing) {
        res.status(400).json({ error: { message: 'GRN number already exists' } });
        return;
      }

      // Validate and create lines
      const variantRepo = AppDataSource.getRepository(Variant);
      const lineRepo = AppDataSource.getRepository(GRNLine);
      const lines: GRNLine[] = [];

      for (const lineData of parsed.data.lines) {
        const variant = await variantRepo.findOne({ where: { id: lineData.variantId } });
        if (!variant) {
          res.status(400).json({ error: { message: `Invalid variantId: ${lineData.variantId}` } });
          return;
        }
        // Note: purchaseOrderLine validation would go here if needed
      }

      const grn = repo.create({
        organization: org,
        asn: asn,
        purchaseOrder: purchaseOrder,
        warehouse: warehouse,
        grnNumber: parsed.data.grnNumber,
        receivedDate: new Date(parsed.data.receivedDate),
        receivedBy: receivedBy,
        status: parsed.data.status || 'draft',
        notes: parsed.data.notes || null
      });

      const saved = await repo.save(grn);

      // Create lines
      for (const lineData of parsed.data.lines) {
        const variant = await variantRepo.findOne({ where: { id: lineData.variantId } });
        if (!variant) continue;

        const line = lineRepo.create({
          grn: saved,
          variant: variant,
          quantityExpected: lineData.quantityExpected,
          quantityReceived: lineData.quantityReceived,
          quantityRejected: lineData.quantityRejected || 0,
          lotNumber: lineData.lotNumber || null,
          serialNumbers: lineData.serialNumbers || null,
          expiryDate: lineData.expiryDate ? new Date(lineData.expiryDate) : null,
          qaStatus: lineData.qaStatus || 'pending',
          qaNotes: lineData.qaNotes || null
        });
        await lineRepo.save(line);
      }

      const result = await repo.findOne({
        where: { id: saved.id },
        relations: ['organization', 'asn', 'purchaseOrder', 'warehouse', 'receivedBy', 'lines', 'lines.variant']
      });

      res.status(201).json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateGRNSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(GRN);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['lines']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'GRN not found' } });
        return;
      }

      if (parsed.data.grnNumber && parsed.data.grnNumber !== item.grnNumber) {
        const existing = await repo.findOne({ where: { grnNumber: parsed.data.grnNumber } });
        if (existing) {
          res.status(400).json({ error: { message: 'GRN number already exists' } });
          return;
        }
      }

      if (parsed.data.grnNumber) item.grnNumber = parsed.data.grnNumber;
      if (parsed.data.receivedDate) item.receivedDate = new Date(parsed.data.receivedDate);
      if (parsed.data.status) item.status = parsed.data.status;
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes || null;

      await repo.save(item);

      // Update lines if provided
      if (parsed.data.lines) {
        const lineRepo = AppDataSource.getRepository(GRNLine);
        const variantRepo = AppDataSource.getRepository(Variant);

        // Remove existing lines
        if (item.lines && item.lines.length > 0) {
          await lineRepo.remove(item.lines);
        }

        // Create new lines
        for (const lineData of parsed.data.lines) {
          const variant = await variantRepo.findOne({ where: { id: lineData.variantId } });
          if (!variant) continue;

          const line = lineRepo.create({
            grn: item,
            variant: variant,
            quantityExpected: lineData.quantityExpected,
            quantityReceived: lineData.quantityReceived,
            quantityRejected: lineData.quantityRejected || 0,
            lotNumber: lineData.lotNumber || null,
            serialNumbers: lineData.serialNumbers || null,
            expiryDate: lineData.expiryDate ? new Date(lineData.expiryDate) : null,
            qaStatus: lineData.qaStatus || 'pending',
            qaNotes: lineData.qaNotes || null
          });
          await lineRepo.save(line);
        }
      }

      const result = await repo.findOne({
        where: { id: item.id },
        relations: ['organization', 'asn', 'purchaseOrder', 'warehouse', 'receivedBy', 'lines', 'lines.variant']
      });

      res.json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(GRN);
      const item = await repo.findOne({
        where: { id: req.params.id },
        relations: ['lines']
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'GRN not found' } });
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

