import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { StockItem } from './StockItem.js';
import { User } from '../iam/User.js';

@Entity({ name: 'stock_adjustments' })
export class StockAdjustment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => StockItem)
  @JoinColumn({ name: 'stock_item_id' })
  stockItem!: StockItem;

  @Column({ name: 'adjustment_number', type: 'varchar', length: 100 })
  adjustmentNumber!: string;

  @Column({ name: 'adjustment_date', type: 'date' })
  adjustmentDate!: Date;

  @Column({ name: 'adjustment_type', type: 'enum', enum: ['increase', 'decrease', 'correction', 'write_off', 'found', 'damaged'] })
  adjustmentType!: 'increase' | 'decrease' | 'correction' | 'write_off' | 'found' | 'damaged';

  @Column({ name: 'quantity_change', type: 'int' })
  quantityChange!: number;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ name: 'cost_impact', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  costImpact!: number;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'adjusted_by' })
  adjustedBy!: User;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

