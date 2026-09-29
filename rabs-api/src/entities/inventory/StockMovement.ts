import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, Index } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Variant } from '../catalog/Variant.js';
import { Warehouse } from './Warehouse.js';
import { Bin } from './Bin.js';
import { User } from '../iam/User.js';

export type StockMovementType =
    | 'transfer_out'
    | 'transfer_in'
    | 'adjustment'
    | 'receipt'
    | 'sale'
    | 'return'
    | 'count'
    | 'other';

export type StockMovementReference =
    | 'stock_transfer'
    | 'stock_adjustment'
    | 'grn'
    | 'order'
    | 'cycle_count'
    | 'manual';

/**
 * Append-only ledger of every change to on-hand stock.
 *
 * Rows are never updated: a reversal is recorded as a further movement in the
 * opposite direction, so the running total can always be reconstructed by
 * summing `quantity` for a variant and warehouse.
 */
@Entity({ name: 'stock_movements' })
@Index('idx_stock_movements_variant_warehouse', ['variant', 'warehouse'])
@Index('idx_stock_movements_reference', ['referenceType', 'referenceId'])
export class StockMovement {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @ManyToOne(() => Variant)
    @JoinColumn({ name: 'variant_id' })
    variant!: Variant;

    @ManyToOne(() => Warehouse)
    @JoinColumn({ name: 'warehouse_id' })
    warehouse!: Warehouse;

    @ManyToOne(() => Bin, { nullable: true })
    @JoinColumn({ name: 'bin_id' })
    bin!: Bin | null;

    /** The stock row affected. Nulled if that row is later removed. */
    @Column({ name: 'stock_item_id', type: 'bigint', unsigned: true, nullable: true })
    stockItemId!: string | null;

    @Column({ name: 'lot_number', type: 'varchar', length: 100, nullable: true })
    lotNumber!: string | null;

    @Column({ name: 'movement_type', type: 'enum', enum: ['transfer_out', 'transfer_in', 'adjustment', 'receipt', 'sale', 'return', 'count', 'other'] })
    movementType!: StockMovementType;

    /** Signed change: negative removes stock, positive adds it. */
    @Column({ type: 'int' })
    quantity!: number;

    @Column({ name: 'quantity_before', type: 'int' })
    quantityBefore!: number;

    @Column({ name: 'quantity_after', type: 'int' })
    quantityAfter!: number;

    @Column({ name: 'unit_cost', type: 'decimal', precision: 15, scale: 4, nullable: true })
    unitCost!: number | null;

    @Column({ name: 'reference_type', type: 'enum', enum: ['stock_transfer', 'stock_adjustment', 'grn', 'order', 'cycle_count', 'manual'], nullable: true })
    referenceType!: StockMovementReference | null;

    @Column({ name: 'reference_id', type: 'bigint', unsigned: true, nullable: true })
    referenceId!: string | null;

    /** Human-readable document number, kept even if the document is deleted. */
    @Column({ name: 'reference_number', type: 'varchar', length: 100, nullable: true })
    referenceNumber!: string | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    notes!: string | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    createdBy!: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
