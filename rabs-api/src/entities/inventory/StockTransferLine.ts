import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { StockTransfer } from './StockTransfer.js';
import { Variant } from '../catalog/Variant.js';

@Entity({ name: 'stock_transfer_lines' })
export class StockTransferLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => StockTransfer)
  @JoinColumn({ name: 'stock_transfer_id' })
  stockTransfer!: StockTransfer;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ name: 'lot_number', type: 'varchar', length: 100, nullable: true })
  lotNumber!: string | null;

  @Column({ name: 'quantity_sent', type: 'int' })
  quantitySent!: number;

  @Column({ name: 'quantity_received', type: 'int', default: 0 })
  quantityReceived!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

