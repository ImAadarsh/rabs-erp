import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { GRN } from './GRN.js';
import { PurchaseOrderLine } from './PurchaseOrderLine.js';
import { Variant } from '../catalog/Variant.js';

@Entity({ name: 'grn_lines' })
export class GRNLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => GRN)
  @JoinColumn({ name: 'grn_id' })
  grn!: GRN;

  @ManyToOne(() => PurchaseOrderLine, { nullable: true })
  @JoinColumn({ name: 'purchase_order_line_id' })
  purchaseOrderLine!: PurchaseOrderLine | null;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ name: 'quantity_expected', type: 'int' })
  quantityExpected!: number;

  @Column({ name: 'quantity_received', type: 'int' })
  quantityReceived!: number;

  @Column({ name: 'quantity_rejected', type: 'int', default: 0 })
  quantityRejected!: number;

  @Column({ name: 'lot_number', type: 'varchar', length: 100, nullable: true })
  lotNumber!: string | null;

  @Column({ name: 'serial_numbers', type: 'text', nullable: true })
  serialNumbers!: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: Date | null;

  @Column({ name: 'qa_status', type: 'enum', enum: ['pending', 'passed', 'failed', 'quarantine'], default: 'pending' })
  qaStatus!: 'pending' | 'passed' | 'failed' | 'quarantine';

  @Column({ name: 'qa_notes', type: 'text', nullable: true })
  qaNotes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

