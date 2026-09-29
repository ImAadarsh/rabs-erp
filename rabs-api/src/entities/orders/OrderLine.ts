import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Order } from './Order.js';
import { Variant } from '../catalog/Variant.js';
import { Warehouse } from '../inventory/Warehouse.js';
import { Backorder } from './Backorder.js';
import { ReturnLine } from './ReturnLine.js';

@Entity({ name: 'order_lines' })
export class OrderLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'varchar', length: 500 })
  name!: string;

  @Column({ type: 'int' })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 4 })
  unitPrice!: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  discountAmount!: number;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 4, default: 0.00 })
  taxRate!: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  taxAmount!: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 15, scale: 4 })
  lineTotal!: number;

  @Column({ name: 'cost_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  costPrice!: number | null;

  @Column({ name: 'quantity_fulfilled', type: 'int', default: 0 })
  quantityFulfilled!: number;

  @Column({ name: 'quantity_pending', type: 'int', generatedType: 'STORED', asExpression: 'quantity - quantity_fulfilled' })
  quantityPending!: number;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse | null;

  @Column({ name: 'fulfillment_status', type: 'enum', enum: ['pending', 'allocated', 'picked', 'packed', 'shipped', 'cancelled'], default: 'pending' })
  fulfillmentStatus!: 'pending' | 'allocated' | 'picked' | 'packed' | 'shipped' | 'cancelled';

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => Backorder, (backorder) => backorder.orderLine)
  backorders!: Backorder[];

  @OneToMany(() => ReturnLine, (returnLine) => returnLine.orderLine)
  returnLines!: ReturnLine[];
}

