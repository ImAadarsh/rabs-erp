import { Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { StockTransfer } from '@entities/inventory/StockTransfer.js';
import { StockTransferLine } from '@entities/inventory/StockTransferLine.js';
import { StockMovement } from '@entities/inventory/StockMovement.js';
import { StockItem } from '@entities/inventory/StockItem.js';
import { z } from 'zod';
import { Organization } from '@entities/iam/Organization.js';
import { Warehouse } from '@entities/inventory/Warehouse.js';
import { User } from '@entities/iam/User.js';
import { Variant } from '@entities/catalog/Variant.js';
import {
  applyTransferStock,
  reverseTransferStock,
  nextTransferNumber,
  StockTransferError
} from '@services/inventory/stockTransfer.service.js';

const transferLineSchema = z.object({
  variantId: z.string(),
  lotNumber: z.string().optional(),
  quantitySent: z.number().int().positive('Quantity must be at least 1'),
  notes: z.string().optional()
});

const createStockTransferSchema = z.object({
  organizationId: z.string(),
  /** Optional: a sequential number is generated when omitted. */
  transferNumber: z.string().min(1).optional(),
  fromWarehouseId: z.string(),
  toWarehouseId: z.string(),
  transferDate: z.string(),
  expectedArrivalDate: z.string().optional(),
  notes: z.string().optional(),
  lines: z.array(transferLineSchema).min(1)
});

const updateStockTransferSchema = z.object({
  transferNumber: z.string().min(1).optional(),
  transferDate: z.string().optional(),
  expectedArrivalDate: z.string().optional(),
  notes: z.string().optional()
});

const detailRelations = [
  'organization', 'fromWarehouse', 'toWarehouse',
  'createdBy', 'shippedBy', 'receivedBy',
  'lines', 'lines.variant', 'lines.variant.catalogItem'
];

export class StockTransfersController {
  static async list(req: Request, res: Response): Promise<void> {
    try {
      const repo = AppDataSource.getRepository(StockTransfer);
      const { organizationId, fromWarehouseId, toWarehouseId, status, search, page = '1', limit = '50' } = req.query;

      const queryBuilder = repo.createQueryBuilder('st')
        .leftJoinAndSelect('st.organization', 'org')
        .leftJoinAndSelect('st.fromWarehouse', 'fromWh')
        .leftJoinAndSelect('st.toWarehouse', 'toWh')
        .leftJoinAndSelect('st.createdBy', 'creator')
        .leftJoinAndSelect('st.shippedBy', 'shipper')
        .leftJoinAndSelect('st.receivedBy', 'receiver')
        .leftJoinAndSelect('st.lines', 'lines')
        .leftJoinAndSelect('lines.variant', 'variant')
        .orderBy('st.createdAt', 'DESC');

      if (organizationId) queryBuilder.andWhere('st.organization_id = :orgId', { orgId: organizationId });
      if (fromWarehouseId) queryBuilder.andWhere('st.from_warehouse_id = :fromWhId', { fromWhId: fromWarehouseId });
      if (toWarehouseId) queryBuilder.andWhere('st.to_warehouse_id = :toWhId', { toWhId: toWarehouseId });
      if (status) queryBuilder.andWhere('st.status = :status', { status });

      if (search) {
        queryBuilder.andWhere(
          '(st.transfer_number LIKE :search OR st.notes LIKE :search OR fromWh.name LIKE :search OR toWh.name LIKE :search)',
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

  /** Full transfer document, including the ledger entries it produced. */
  static async get(req: Request, res: Response): Promise<void> {
    try {
      const item = await AppDataSource.getRepository(StockTransfer).findOne({
        where: { id: req.params.id },
        relations: detailRelations
      });

      if (!item) {
        res.status(404).json({ error: { message: 'Stock transfer not found' } });
        return;
      }

      const movements = await AppDataSource.getRepository(StockMovement).find({
        where: { referenceType: 'stock_transfer', referenceId: item.id },
        relations: ['variant', 'warehouse'],
        order: { id: 'ASC' }
      });

      res.json({ data: { ...item, movements } });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /** Stock available to send from a warehouse, for the create form. */
  static async availability(req: Request, res: Response): Promise<void> {
    try {
      const { warehouseId, search } = req.query;
      if (!warehouseId) {
        res.status(400).json({ error: { message: 'warehouseId is required' } });
        return;
      }

      const qb = AppDataSource.getRepository(StockItem).createQueryBuilder('si')
        .innerJoin('si.variant', 'v')
        .select('v.id', 'variantId')
        .addSelect('v.variant_sku', 'variantSku')
        .addSelect('v.name', 'variantName')
        .addSelect('SUM(si.quantity_on_hand - si.quantity_reserved)', 'available')
        .where('si.warehouse_id = :warehouseId', { warehouseId })
        .andWhere('si.status = :status', { status: 'available' })
        .groupBy('v.id')
        .addGroupBy('v.variant_sku')
        .addGroupBy('v.name')
        .having('available > 0')
        .orderBy('v.variant_sku', 'ASC');

      if (search) qb.andWhere('(v.variant_sku LIKE :s OR v.name LIKE :s)', { s: `%${search}%` });

      const rows = await qb.limit(500).getRawMany<{ variantId: string; variantSku: string; variantName: string | null; available: string }>();

      res.json({
        data: rows.map((r) => ({
          variantId: String(r.variantId),
          variantSku: r.variantSku,
          variantName: r.variantName,
          available: Number(r.available)
        }))
      });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /**
   * Creates a transfer, approves it, and moves the stock in one step.
   *
   * The document, its lines, the quantity changes and the ledger entries are
   * written in a single transaction, so a shortage on any line leaves nothing
   * behind.
   */
  static async create(req: Request, res: Response): Promise<void> {
    try {
      const parsed = createStockTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: parsed.error.issues[0]?.message ?? 'Invalid payload', details: parsed.error.issues } });
        return;
      }
      const input = parsed.data;

      if (input.fromWarehouseId === input.toWarehouseId) {
        res.status(400).json({ error: { message: 'From and to warehouses cannot be the same' } });
        return;
      }

      const currentUser = (req as any).user;
      const userId = currentUser?.id ? String(currentUser.id) : null;

      const transferId = await AppDataSource.transaction(async (manager) => {
        const org = await manager.getRepository(Organization).findOne({ where: { id: input.organizationId } });
        if (!org) throw new StockTransferError('Invalid organizationId');

        const warehouseRepo = manager.getRepository(Warehouse);
        const fromWarehouse = await warehouseRepo.findOne({ where: { id: input.fromWarehouseId } });
        if (!fromWarehouse) throw new StockTransferError('Invalid fromWarehouseId');
        const toWarehouse = await warehouseRepo.findOne({ where: { id: input.toWarehouseId } });
        if (!toWarehouse) throw new StockTransferError('Invalid toWarehouseId');

        const transferNumber = input.transferNumber ?? await nextTransferNumber(manager, new Date(input.transferDate));
        const repo = manager.getRepository(StockTransfer);
        if (await repo.findOne({ where: { transferNumber } })) {
          throw new StockTransferError(`Transfer number ${transferNumber} already exists`);
        }

        const variantRepo = manager.getRepository(Variant);
        const createdBy = userId ? await manager.getRepository(User).findOne({ where: { id: userId } }) : null;
        const now = new Date();

        const transfer = await repo.save(repo.create({
          organization: org,
          transferNumber,
          fromWarehouse,
          toWarehouse,
          transferDate: new Date(input.transferDate),
          expectedArrivalDate: input.expectedArrivalDate ? new Date(input.expectedArrivalDate) : null,
          // Approved and completed on creation: the goods move immediately.
          status: 'received',
          notes: input.notes || null,
          createdBy,
          shippedBy: createdBy,
          receivedBy: createdBy,
          shippedAt: now,
          receivedAt: now
        }));

        const lineRepo = manager.getRepository(StockTransferLine);
        const lines: StockTransferLine[] = [];
        for (const lineData of input.lines) {
          const variant = await variantRepo.findOne({ where: { id: lineData.variantId } });
          if (!variant) throw new StockTransferError(`Invalid variantId: ${lineData.variantId}`);

          lines.push(await lineRepo.save(lineRepo.create({
            stockTransfer: transfer,
            variant,
            lotNumber: lineData.lotNumber || null,
            quantitySent: lineData.quantitySent,
            quantityReceived: 0,
            notes: lineData.notes || null
          })));
        }

        await applyTransferStock(manager, transfer, lines, userId);
        return transfer.id;
      });

      const result = await AppDataSource.getRepository(StockTransfer).findOne({
        where: { id: transferId },
        relations: detailRelations
      });

      res.status(201).json({ data: result });
    } catch (error: any) {
      if (error instanceof StockTransferError) {
        res.status(400).json({ error: { message: error.message, details: error.details } });
        return;
      }
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /**
   * Amends the document only. Quantities and warehouses are fixed once the
   * stock has moved — delete the transfer to reverse it instead.
   */
  static async update(req: Request, res: Response): Promise<void> {
    try {
      const parsed = updateStockTransferSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: { message: 'Invalid payload', details: parsed.error.issues } });
        return;
      }

      const repo = AppDataSource.getRepository(StockTransfer);
      const item = await repo.findOne({ where: { id: req.params.id } });
      if (!item) {
        res.status(404).json({ error: { message: 'Stock transfer not found' } });
        return;
      }

      if (parsed.data.transferNumber && parsed.data.transferNumber !== item.transferNumber) {
        const existing = await repo.findOne({ where: { transferNumber: parsed.data.transferNumber } });
        if (existing) {
          res.status(400).json({ error: { message: 'Transfer number already exists' } });
          return;
        }
        item.transferNumber = parsed.data.transferNumber;
      }

      if (parsed.data.transferDate) item.transferDate = new Date(parsed.data.transferDate);
      if (parsed.data.expectedArrivalDate !== undefined) {
        item.expectedArrivalDate = parsed.data.expectedArrivalDate ? new Date(parsed.data.expectedArrivalDate) : null;
      }
      if (parsed.data.notes !== undefined) item.notes = parsed.data.notes || null;

      await repo.save(item);

      const result = await repo.findOne({ where: { id: item.id }, relations: detailRelations });
      res.json({ data: result });
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }

  /** Deleting a completed transfer returns the stock to the source warehouse. */
  static async remove(req: Request, res: Response): Promise<void> {
    try {
      const currentUser = (req as any).user;
      const userId = currentUser?.id ? String(currentUser.id) : null;

      const found = await AppDataSource.transaction(async (manager) => {
        const repo = manager.getRepository(StockTransfer);
        const item = await repo.findOne({
          where: { id: req.params.id },
          relations: ['organization', 'fromWarehouse', 'toWarehouse', 'lines']
        });
        if (!item) return false;

        if (item.status === 'received') {
          await reverseTransferStock(manager, item, userId);
        }

        // Keep the ledger intact: detach the movements from the deleted document
        // but retain their reference number for the audit trail.
        await manager.getRepository(StockMovement).update(
          { referenceType: 'stock_transfer', referenceId: item.id },
          { referenceId: null }
        );

        await repo.remove(item);
        return true;
      });

      if (!found) {
        res.status(404).json({ error: { message: 'Stock transfer not found' } });
        return;
      }

      res.status(204).send();
    } catch (error: any) {
      res.status(500).json({ error: { message: error.message } });
    }
  }
}
