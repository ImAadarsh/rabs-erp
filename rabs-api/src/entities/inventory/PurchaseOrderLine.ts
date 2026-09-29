import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { PurchaseOrder } from './PurchaseOrder.js';
import { Variant } from '../catalog/Variant.js';

@Entity({ name: 'purchase_order_lines' })
export class PurchaseOrderLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => PurchaseOrder)
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder!: PurchaseOrder;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 4 })
  unitPrice!: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 4, default: 0.00 })
  taxRate!: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  taxAmount!: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 15, scale: 4 })
  lineTotal!: number;

  @Column({ name: 'quantity_received', type: 'int', default: 0 })
  quantityReceived!: number;

  @Column({ name: 'quantity_pending', type: 'int', generatedType: 'STORED', asExpression: 'quantity - quantity_received' })
  quantityPending!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

