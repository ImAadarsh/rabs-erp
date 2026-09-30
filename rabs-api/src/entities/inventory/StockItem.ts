import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Variant } from '../catalog/Variant.js';
import { Warehouse } from './Warehouse.js';
import { Bin } from './Bin.js';

@Entity({ name: 'stock_items' })
export class StockItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @ManyToOne(() => Bin, { nullable: true })
  @JoinColumn({ name: 'bin_id' })
  bin!: Bin | null;

  @Column({ name: 'lot_number', type: 'varchar', length: 100, nullable: true })
  lotNumber!: string | null;

  @Column({ name: 'serial_number', type: 'varchar', length: 100, nullable: true })
  serialNumber!: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: Date | null;

  @Column({ name: 'manufacture_date', type: 'date', nullable: true })
  manufactureDate!: Date | null;

  @Column({ name: 'quantity_on_hand', type: 'int', default: 0 })
  quantityOnHand!: number;

  @Column({ name: 'quantity_reserved', type: 'int', default: 0 })
  quantityReserved!: number;

  @Column({ name: 'quantity_available', type: 'int', generatedType: 'STORED', asExpression: 'quantity_on_hand - quantity_reserved' })
  quantityAvailable!: number;

  @Column({ name: 'safety_stock_level', type: 'int', default: 0 })
  safetyStockLevel!: number;

  @Column({ name: 'reorder_point', type: 'int', default: 0 })
  reorderPoint!: number;

  @Column({ name: 'reorder_quantity', type: 'int', default: 0 })
  reorderQuantity!: number;

  @Column({ type: 'enum', enum: ['available', 'reserved', 'quarantine', 'damaged', 'expired'], default: 'available' })
  status!: 'available' | 'reserved' | 'quarantine' | 'damaged' | 'expired';

  @Column({ name: 'cost_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  costPrice!: number | null;

  @Column({ name: 'last_counted_at', type: 'timestamp', nullable: true })
  lastCountedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

