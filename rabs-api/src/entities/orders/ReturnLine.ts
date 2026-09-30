import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Return } from './Return.js';
import { OrderLine } from './OrderLine.js';
import { Variant } from '../catalog/Variant.js';
import { Warehouse } from '../inventory/Warehouse.js';

@Entity({ name: 'return_lines' })
export class ReturnLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Return)
  @JoinColumn({ name: 'return_id' })
  return!: Return;

  @ManyToOne(() => OrderLine)
  @JoinColumn({ name: 'order_line_id' })
  orderLine!: OrderLine;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'condition_on_return', type: 'enum', enum: ['new', 'like_new', 'used', 'damaged', 'defective'], default: 'new' })
  conditionOnReturn!: 'new' | 'like_new' | 'used' | 'damaged' | 'defective';

  @Column({ type: 'enum', enum: ['restock', 'refurbish', 'dispose', 'return_to_supplier', 'pending'], default: 'pending' })
  action!: 'restock' | 'refurbish' | 'dispose' | 'return_to_supplier' | 'pending';

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'restock_warehouse_id' })
  restockWarehouse!: Warehouse | null;

  @Column({ name: 'restocked_at', type: 'timestamp', nullable: true })
  restockedAt!: Date | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

