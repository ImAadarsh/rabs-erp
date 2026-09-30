import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CycleCount } from './CycleCount.js';
import { StockItem } from './StockItem.js';

@Entity({ name: 'cycle_count_lines' })
export class CycleCountLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => CycleCount)
  @JoinColumn({ name: 'cycle_count_id' })
  cycleCount!: CycleCount;

  @ManyToOne(() => StockItem)
  @JoinColumn({ name: 'stock_item_id' })
  stockItem!: StockItem;

  @Column({ name: 'expected_quantity', type: 'int' })
  expectedQuantity!: number;

  @Column({ name: 'counted_quantity', type: 'int', nullable: true })
  countedQuantity!: number | null;

  @Column({ type: 'int', generatedType: 'STORED', asExpression: 'counted_quantity - expected_quantity' })
  variance!: number;

  @Column({ name: 'variance_percent', type: 'decimal', precision: 7, scale: 4, nullable: true })
  variancePercent!: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @Column({ name: 'counted_at', type: 'timestamp', nullable: true })
  countedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

