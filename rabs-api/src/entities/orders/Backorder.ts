import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { OrderLine } from './OrderLine.js';
import { Variant } from '../catalog/Variant.js';

@Entity({ name: 'backorders' })
export class Backorder {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => OrderLine)
  @JoinColumn({ name: 'order_line_id' })
  orderLine!: OrderLine;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'quantity_allocated', type: 'int', default: 0 })
  quantityAllocated!: number;

  @Column({ name: 'quantity_pending', type: 'int', generatedType: 'STORED', asExpression: 'quantity - quantity_allocated' })
  quantityPending!: number;

  @Column({ name: 'expected_date', type: 'date', nullable: true })
  expectedDate!: Date | null;

  @Column({ type: 'enum', enum: ['pending', 'partially_allocated', 'allocated', 'cancelled'], default: 'pending' })
  status!: 'pending' | 'partially_allocated' | 'allocated' | 'cancelled';

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

