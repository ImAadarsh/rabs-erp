import { EntityManager } from 'typeorm';
import { StockItem } from '@entities/inventory/StockItem.js';
import { StockMovement } from '@entities/inventory/StockMovement.js';
import { StockTransfer } from '@entities/inventory/StockTransfer.js';
import { StockTransferLine } from '@entities/inventory/StockTransferLine.js';

/** Raised when a transfer cannot proceed; carries per-line detail for the UI. */
export class StockTransferError extends Error {
    constructor(message: string, public readonly details?: unknown) {
        super(message);
        this.name = 'StockTransferError';
    }
}

export interface TransferLineRequest {
    variantId: string;
    quantitySent: number;
    lotNumber?: string | null;
    notes?: string | null;
}

/** Sequential per-year transfer number, e.g. `TRF-2026-00007`. */
export async function nextTransferNumber(manager: EntityManager, date = new Date()) {
    const prefix = `TRF-${date.getFullYear()}-`;
    const rows = await manager.getRepository(StockTransfer)
        .createQueryBuilder('t')
        .select('t.transfer_number', 'transferNumber')
        .where('t.transfer_number LIKE :prefix', { prefix: `${prefix}%` })
        .getRawMany<{ transferNumber: string }>();

    let max = 0;
    for (const r of rows) {
        const seq = parseInt(r.transferNumber.slice(prefix.length), 10);
        if (Number.isFinite(seq) && seq > max) max = seq;
    }
    return `${prefix}${String(max + 1).padStart(5, '0')}`;
}

/**
 * Source rows for a variant at a warehouse, oldest stock first so lots are
 * consumed in expiry order.
 */
async function sourceRows(manager: EntityManager, variantId: string, warehouseId: string, lotNumber?: string | null) {
    const qb = manager.getRepository(StockItem).createQueryBuilder('si')
        .leftJoinAndSelect('si.variant', 'v')
        .leftJoinAndSelect('si.bin', 'b')
        .where('si.variant_id = :variantId', { variantId })
        .andWhere('si.warehouse_id = :warehouseId', { warehouseId })
        .andWhere('si.status = :status', { status: 'available' })
        .orderBy('si.expiry_date', 'ASC')
        .addOrderBy('si.id', 'ASC');

    if (lotNumber) qb.andWhere('si.lot_number = :lotNumber', { lotNumber });

    return qb.getMany();
}

const availableOn = (row: StockItem) =>
    Math.max(0, (row.quantityOnHand ?? 0) - (row.quantityReserved ?? 0));

/**
 * Moves stock for every line of a transfer and records the ledger entries.
 *
 * Runs inside the caller's transaction: if any line is short the whole transfer
 * is rejected, so stock is never left partially moved.
 */
export async function applyTransferStock(
    manager: EntityManager,
    transfer: StockTransfer,
    lines: StockTransferLine[],
    userId?: string | null
) {
    const stockRepo = manager.getRepository(StockItem);
    const moveRepo = manager.getRepository(StockMovement);
    const orgId = transfer.organization.id;
    const fromId = transfer.fromWarehouse.id;
    const toId = transfer.toWarehouse.id;

    // Check every line before moving anything, so the error names all shortages
    // at once rather than failing one line at a time.
    const shortages: Array<{ sku: string; requested: number; available: number }> = [];
    const plans: Array<{ line: StockTransferLine; rows: StockItem[] }> = [];

    for (const line of lines) {
        const rows = await sourceRows(manager, line.variant.id, fromId, line.lotNumber);
        const available = rows.reduce((s, r) => s + availableOn(r), 0);
        if (available < line.quantitySent) {
            shortages.push({
                sku: line.variant.variantSku,
                requested: line.quantitySent,
                available
            });
        }
        plans.push({ line, rows });
    }

    if (shortages.length > 0) {
        const summary = shortages
            .map((s) => `${s.sku} (need ${s.requested}, have ${s.available})`)
            .join(', ');
        throw new StockTransferError(
            `Not enough stock at ${transfer.fromWarehouse.name} for: ${summary}`,
            { shortages }
        );
    }

    for (const { line, rows } of plans) {
        let remaining = line.quantitySent;

        for (const row of rows) {
            if (remaining <= 0) break;
            const take = Math.min(remaining, availableOn(row));
            if (take <= 0) continue;

            const before = row.quantityOnHand;
            row.quantityOnHand = before - take;
            await stockRepo.save(row);

            await moveRepo.save(moveRepo.create({
                organization: { id: orgId } as any,
                variant: { id: line.variant.id } as any,
                warehouse: { id: fromId } as any,
                bin: row.bin,
                stockItemId: row.id,
                lotNumber: row.lotNumber,
                movementType: 'transfer_out',
                quantity: -take,
                quantityBefore: before,
                quantityAfter: row.quantityOnHand,
                unitCost: row.costPrice,
                referenceType: 'stock_transfer',
                referenceId: transfer.id,
                referenceNumber: transfer.transferNumber,
                notes: `To ${transfer.toWarehouse.name}`,
                createdBy: userId ? ({ id: userId } as any) : null
            }));

            // Mirror the outgoing quantity into the destination, matching lot and
            // carrying the source cost so valuation follows the goods.
            let dest = await stockRepo.findOne({
                where: {
                    variant: { id: line.variant.id },
                    warehouse: { id: toId },
                    lotNumber: row.lotNumber ?? undefined,
                    status: 'available'
                },
                relations: ['bin']
            });

            const destBefore = dest?.quantityOnHand ?? 0;
            if (dest) {
                dest.quantityOnHand = destBefore + take;
                if (dest.costPrice == null && row.costPrice != null) dest.costPrice = row.costPrice;
            } else {
                dest = stockRepo.create({
                    variant: { id: line.variant.id } as any,
                    warehouse: { id: toId } as any,
                    bin: null,
                    lotNumber: row.lotNumber,
                    serialNumber: row.serialNumber,
                    expiryDate: row.expiryDate,
                    manufactureDate: row.manufactureDate,
                    quantityOnHand: take,
                    quantityReserved: 0,
                    safetyStockLevel: 0,
                    reorderPoint: 0,
                    reorderQuantity: 0,
                    status: 'available',
                    costPrice: row.costPrice
                });
            }
            dest = await stockRepo.save(dest);

            await moveRepo.save(moveRepo.create({
                organization: { id: orgId } as any,
                variant: { id: line.variant.id } as any,
                warehouse: { id: toId } as any,
                bin: dest.bin ?? null,
                stockItemId: dest.id,
                lotNumber: dest.lotNumber,
                movementType: 'transfer_in',
                quantity: take,
                quantityBefore: destBefore,
                quantityAfter: dest.quantityOnHand,
                unitCost: dest.costPrice,
                referenceType: 'stock_transfer',
                referenceId: transfer.id,
                referenceNumber: transfer.transferNumber,
                notes: `From ${transfer.fromWarehouse.name}`,
                createdBy: userId ? ({ id: userId } as any) : null
            }));

            remaining -= take;
        }

        line.quantityReceived = line.quantitySent - remaining;
        await manager.getRepository(StockTransferLine).save(line);
    }
}

/**
 * Puts stock back where it came from, recording the reversal as new ledger
 * entries rather than deleting history.
 */
export async function reverseTransferStock(
    manager: EntityManager,
    transfer: StockTransfer,
    userId?: string | null
) {
    const moveRepo = manager.getRepository(StockMovement);
    const stockRepo = manager.getRepository(StockItem);

    const original = await moveRepo.find({
        where: { referenceType: 'stock_transfer', referenceId: transfer.id },
        relations: ['variant', 'warehouse', 'bin'],
        order: { id: 'DESC' }
    });

    // Only reverse the movements this transfer created, ignoring any earlier
    // reversal so repeated calls cannot double-count.
    const alreadyReversed = original.some((m) => m.notes?.startsWith('Reversal of'));
    if (alreadyReversed || original.length === 0) return;

    for (const m of original) {
        if (!m.stockItemId) continue;
        const row = await stockRepo.findOne({ where: { id: m.stockItemId }, relations: ['bin'] });
        if (!row) continue;

        const before = row.quantityOnHand;
        row.quantityOnHand = Math.max(0, before - m.quantity);
        await stockRepo.save(row);

        await moveRepo.save(moveRepo.create({
            organization: { id: transfer.organization.id } as any,
            variant: { id: m.variant.id } as any,
            warehouse: { id: m.warehouse.id } as any,
            bin: row.bin,
            stockItemId: row.id,
            lotNumber: row.lotNumber,
            movementType: m.movementType === 'transfer_out' ? 'transfer_in' : 'transfer_out',
            quantity: -m.quantity,
            quantityBefore: before,
            quantityAfter: row.quantityOnHand,
            unitCost: row.costPrice,
            referenceType: 'stock_transfer',
            referenceId: transfer.id,
            referenceNumber: transfer.transferNumber,
            notes: `Reversal of ${transfer.transferNumber}`,
            createdBy: userId ? ({ id: userId } as any) : null
        }));
    }
}
