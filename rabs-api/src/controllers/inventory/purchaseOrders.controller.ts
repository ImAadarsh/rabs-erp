import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { PurchaseOrder } from '@entities/inventory/PurchaseOrder.js';
import { PurchaseOrderLine } from '@entities/inventory/PurchaseOrderLine.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Supplier } from '@entities/inventory/Supplier.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { Variant } from '@entities/catalog/Variant.js';
import { ASN } from '@entities/inventory/ASN.js';
import { GRN } from '@entities/inventory/GRN.js';
import { EntityManager, In, IsNull } from 'typeorm';
import { inactiveWarehouseError } from '@services/inventory/locationStatus.js';

type PoStatus = PurchaseOrder['status'];

/**
 * Allowed status moves. Stock is booked in through ASN/GRN; the received states here only
 * record the outcome on the order.
 */
const PO_TRANSITIONS: Record<PoStatus, PoStatus[]> = {
  draft: ['submitted', 'cancelled'],
  submitted: ['confirmed', 'draft', 'cancelled'],
  confirmed: ['partial_received', 'received', 'cancelled'],
  partial_received: ['received', 'cancelled'],
  received: [],
  cancelled: []
};

const poLineSchema = z.object({
  variantId: z.string().min(1),
  quantity: z.number().int().min(1, 'Quantity must be at least 1'),
  unitPrice: z.number().min(0, 'Unit cost cannot be negative'),
  /** Fraction, e.g. 0.2 for 20% VAT (column is DECIMAL(5,4)). */
  taxRate: z.number().min(0).max(1).optional(),
  notes: z.string().max(500).optional()
});

const createPurchaseOrderSchema = z.object({
  organizationId: z.string(),
  supplierId: z.string(),
  warehouseId: z.string(),
  poNumber: z.string().min(1).optional(),
  reference: z.string().optional(),
  orderDate: z.string(),
  expectedDeliveryDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  subtotal: z.number().optional(),
  taxAmount: z.number().optional(),
  shippingCost: z.number().min(0).optional(),
  otherCosts: z.number().min(0).optional(),
  total: z.number().optional(),
  status: z.enum(['draft', 'submitted']).optional(),
  notes: z.string().optional(),
  lines: z.array(poLineSchema).optional()
});

const updatePurchaseOrderSchema = z.object({
  supplierId: z.string().optional(),
  warehouseId: z.string().optional(),
  poNumber: z.string().min(1).optional(),
  reference: z.string().optional(),
  orderDate: z.string().optional(),
  expectedDeliveryDate: z.string().optional(),
  currency: z.string().length(3).optional(),
  subtotal: z.number().optional(),
  taxAmount: z.number().optional(),
  shippingCost: z.number().min(0).optional(),
  otherCosts: z.number().min(0).optional(),
  total: z.number().optional(),
  status: z.enum(['draft', 'submitted', 'confirmed', 'partial_received', 'received', 'cancelled']).optional(),
  notes: z.string().optional(),
  lines: z.array(poLineSchema).optional()
});

const DETAIL_RELATIONS = ['organization', 'supplier', 'warehouse', 'lines', 'lines.variant', 'lines.variant.catalogItem', 'createdBy', 'approvedBy'];

class PurchaseOrderError extends Error {}

const round4 = (n: number) => Math.round(n * 10000) / 10000;

/** Sequential per-year PO number, e.g. `PO-2026-00007`. */
async function nextPoNumber(manager: EntityManager, date = new Date()) {
  const prefix = `PO-${date.getFullYear()}-`;
  const rows = await manager.getRepository(PurchaseOrder)
    .createQueryBuilder('po')
    .select('po.po_number', 'poNumber')
    .where('po.po_number LIKE :prefix', { prefix: `${prefix}%` })
    .getRawMany<{ poNumber: string }>();
  let max = 0;
  for (const r of rows) {
    const seq = parseInt(r.poNumber.slice(prefix.length), 10);
    if (Number.isFinite(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

async function loadActiveWarehouse(manager: EntityManager, warehouseId: string) {
  const warehouse = await manager.getRepository(Warehouse).findOne({ where: { id: warehouseId, deletedAt: IsNull() } });
  if (!warehouse) throw new PurchaseOrderError('Invalid warehouseId');
  const warehouseError = inactiveWarehouseError(warehouse, 'Delivery warehouse');
  if (warehouseError) throw new PurchaseOrderError(warehouseError);
  return warehouse;
}

async function loadSupplier(manager: EntityManager, supplierId: string) {
  const supplier = await manager.getRepository(Supplier).findOne({ where: { id: supplierId, deletedAt: IsNull() } });
  if (!supplier) throw new PurchaseOrderError('Invalid supplierId');
  if (supplier.status !== 'active') throw new PurchaseOrderError(`Supplier "${supplier.name}" is ${supplier.status}`);
  return supplier;
}

/** Replaces the order's lines and returns the line totals; the caller stores them on the header. */
async function replaceLines(manager: EntityManager, po: PurchaseOrder, lines: z.infer<typeof poLineSchema>[]) {
  const variantIds = [...new Set(lines.map((l) => l.variantId))];
  const variants = variantIds.length
    ? await manager.getRepository(Variant).find({ where: { id: In(variantIds) } })
    : [];
  const byId = new Map(variants.map((v) => [String(v.id), v]));
  const missing = variantIds.filter((id) => !byId.has(id));
  if (missing.length) throw new PurchaseOrderError(`Unknown variant(s): ${missing.join(', ')}`);

  const lineRepo = manager.getRepository(PurchaseOrderLine);
  await lineRepo.createQueryBuilder().delete().where('purchase_order_id = :id', { id: po.id }).execute();

  let subtotal = 0;
  let taxAmount = 0;
  let lineNumber = 0;
  for (const l of lines) {
    const net = round4(l.quantity * l.unitPrice);
    const tax = round4(net * (l.taxRate ?? 0));
    subtotal += net;
    taxAmount += tax;
    await lineRepo.save(lineRepo.create({
      purchaseOrder: { id: po.id } as PurchaseOrder,
      variant: byId.get(l.variantId)!,
      lineNumber: ++lineNumber,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      taxRate: l.taxRate ?? 0,
      taxAmount: tax,
      lineTotal: round4(net + tax),
      quantityReceived: 0,
      notes: l.notes ?? null
    }));
  }
  return { subtotal: round4(subtotal), taxAmount: round4(taxAmount) };
}

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
        relations: DETAIL_RELATIONS
      });
      
      if (!item) {
        res.status(404).json({ error: { message: 'Purchase order not found' } });
        return;
      }

      item.lines?.sort((a, b) => a.lineNumber - b.lineNumber);
      const [asns, grns] = await Promise.all([
        AppDataSource.getRepository(ASN).find({
          where: { purchaseOrder: { id: item.id } },
          relations: ['warehouse'],
          order: { createdAt: 'DESC' }
        }),
        // A GRN references the PO directly or through the ASN it was received against.
        AppDataSource.getRepository(GRN).createQueryBuilder('grn')
          .leftJoinAndSelect('grn.warehouse', 'wh')
          .leftJoin('grn.asn', 'asn')
          .where('grn.purchase_order_id = :id OR asn.purchase_order_id = :id', { id: item.id })
          .orderBy('grn.createdAt', 'DESC')
          .getMany()
      ]);

      res.json({
        data: {
          ...item,
          allowedTransitions: PO_TRANSITIONS[item.status] ?? [],
          asns: asns.map((a) => ({ id: a.id, asnNumber: a.asnNumber, status: a.status, expectedDate: a.expectedDate, warehouse: a.warehouse ? { id: a.warehouse.id, name: a.warehouse.name } : null })),
          grns: grns.map((g) => ({ id: g.id, grnNumber: g.grnNumber, status: g.status, receivedDate: g.receivedDate, warehouse: g.warehouse ? { id: g.warehouse.id, name: g.warehouse.name } : null }))
        }
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createPurchaseOrderSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const input = parsed.data;
      const userId = (req as any).auth?.sub ? String((req as any).auth.sub) : null;

      const id = await AppDataSource.transaction(async (manager) => {
        const org = await manager.getRepository(Organization).findOne({ where: { id: input.organizationId } });
        if (!org) throw new PurchaseOrderError('Invalid organizationId');
        const supplier = await loadSupplier(manager, input.supplierId);
        const warehouse = await loadActiveWarehouse(manager, input.warehouseId);

        const repo = manager.getRepository(PurchaseOrder);
        const poNumber = input.poNumber?.trim() || await nextPoNumber(manager, new Date(input.orderDate));
        if (await repo.findOne({ where: { poNumber } })) {
          throw new PurchaseOrderError('PO number already exists');
        }

        const item = await repo.save(repo.create({
          organization: org,
          supplier,
          warehouse,
          poNumber,
          reference: input.reference ?? null,
          orderDate: new Date(input.orderDate),
          expectedDeliveryDate: input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null,
          currency: input.currency ?? supplier.currency ?? 'GBP',
          subtotal: input.subtotal ?? 0.00,
          taxAmount: input.taxAmount ?? 0.00,
          shippingCost: input.shippingCost ?? 0.00,
          otherCosts: input.otherCosts ?? 0.00,
          total: input.total ?? 0.00,
          status: input.status ?? 'draft',
          notes: input.notes ?? null,
          createdBy: userId ? ({ id: userId } as any) : null
        }));

        if (input.lines) {
          if (input.lines.length === 0 && item.status !== 'draft') {
            throw new PurchaseOrderError('Add at least one line before submitting');
          }
          const totals = await replaceLines(manager, item, input.lines);
          item.subtotal = totals.subtotal;
          item.taxAmount = totals.taxAmount;
          item.total = round4(totals.subtotal + totals.taxAmount + Number(item.shippingCost ?? 0) + Number(item.otherCosts ?? 0));
          await repo.save(item);
        }
        return item.id;
      });

      const saved = await AppDataSource.getRepository(PurchaseOrder).findOne({ where: { id }, relations: DETAIL_RELATIONS });
      res.status(201).json({ data: saved });
    } catch (error: any) {
      if (error instanceof PurchaseOrderError) {
        res.status(400).json({ error: { message: error.message } });
        return;
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /**
   * Header fields, supplier, warehouse and lines can only change while the order is a draft.
   * Status changes follow PO_TRANSITIONS.
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const parsed = updatePurchaseOrderSchema.safeParse(req.body);
      
      if (!parsed.success) {
        res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const input = parsed.data;
      const userId = (req as any).auth?.sub ? String((req as any).auth.sub) : null;

      await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(PurchaseOrder);
        const item = await repo.findOne({
          where: { id },
          relations: ['organization', 'supplier', 'warehouse', 'lines']
        });
        if (!item) throw new PurchaseOrderError('Purchase order not found');

        const editsDraftOnly = input.supplierId !== undefined || input.warehouseId !== undefined
          || input.lines !== undefined || input.currency !== undefined
          || (input.poNumber !== undefined && input.poNumber !== item.poNumber);
        if (editsDraftOnly && item.status !== 'draft') {
          throw new PurchaseOrderError(`Only draft purchase orders can be edited (this one is ${item.status.replace('_', ' ')})`);
        }

        if (input.status && input.status !== item.status) {
          const allowed = PO_TRANSITIONS[item.status] ?? [];
          if (!allowed.includes(input.status)) {
            throw new PurchaseOrderError(`Cannot change status from ${item.status} to ${input.status}`);
          }
        }

        if (input.poNumber && input.poNumber !== item.poNumber) {
          if (await repo.findOne({ where: { poNumber: input.poNumber } })) {
            throw new PurchaseOrderError('PO number already exists');
          }
          item.poNumber = input.poNumber;
        }
        if (input.supplierId && input.supplierId !== item.supplier?.id) {
          item.supplier = await loadSupplier(manager, input.supplierId);
        }
        if (input.warehouseId && input.warehouseId !== item.warehouse?.id) {
          item.warehouse = await loadActiveWarehouse(manager, input.warehouseId);
        }
        if (input.reference !== undefined) item.reference = input.reference || null;
        if (input.orderDate) item.orderDate = new Date(input.orderDate);
        if (input.expectedDeliveryDate !== undefined) item.expectedDeliveryDate = input.expectedDeliveryDate ? new Date(input.expectedDeliveryDate) : null;
        if (input.currency) item.currency = input.currency;
        if (input.shippingCost !== undefined) item.shippingCost = input.shippingCost;
        if (input.otherCosts !== undefined) item.otherCosts = input.otherCosts;
        if (input.notes !== undefined) item.notes = input.notes || null;

        if (input.lines) {
          const totals = await replaceLines(manager, item, input.lines);
          item.subtotal = totals.subtotal;
          item.taxAmount = totals.taxAmount;
        } else {
          if (input.subtotal !== undefined) item.subtotal = input.subtotal;
          if (input.taxAmount !== undefined) item.taxAmount = input.taxAmount;
        }
        if (input.lines || input.shippingCost !== undefined || input.otherCosts !== undefined) {
          item.total = round4(Number(item.subtotal ?? 0) + Number(item.taxAmount ?? 0) + Number(item.shippingCost ?? 0) + Number(item.otherCosts ?? 0));
        } else if (input.total !== undefined) {
          item.total = input.total;
        }

        if (input.status && input.status !== item.status) {
          if (input.status === 'submitted') {
            const lineCount = input.lines ? input.lines.length : (item.lines?.length ?? 0);
            if (lineCount === 0) throw new PurchaseOrderError('Add at least one line before submitting');
          }
          if (input.status === 'confirmed') {
            item.approvedBy = userId ? ({ id: userId } as any) : null;
            item.approvedAt = new Date();
          }
          item.status = input.status;
        }

        // Keep the relation from being re-saved with stale line objects.
        const { lines: _lines, ...header } = item;
        await repo.save(header as PurchaseOrder);
      });

      const updated = await AppDataSource.getRepository(PurchaseOrder).findOne({ where: { id }, relations: DETAIL_RELATIONS });
      res.json({ data: updated });
    } catch (error: any) {
      if (error instanceof PurchaseOrderError) {
        const status = error.message === 'Purchase order not found' ? 404 : 400;
        res.status(status).json({ error: { message: error.message } });
        return;
      }
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
      if (item.status !== 'draft' && item.status !== 'cancelled') {
        res.status(400).json({ error: { message: 'Only draft or cancelled purchase orders can be deleted. Cancel it first.' } });
        return;
      }

      await repo.remove(item);
      res.status(204).send();
    } catch (error: any) {
      if (error?.code === 'ER_ROW_IS_REFERENCED_2') {
        res.status(400).json({ error: { message: 'This purchase order is linked to an ASN or GRN and cannot be deleted' } });
        return;
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
