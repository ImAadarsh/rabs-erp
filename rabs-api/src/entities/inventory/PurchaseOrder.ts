import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Supplier } from './Supplier.js';
import { Warehouse } from './Warehouse.js';
import { User } from '../iam/User.js';
import type { PurchaseOrderLine } from './PurchaseOrderLine.js';

@Entity({ name: 'purchase_orders' })
export class PurchaseOrder {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ name: 'po_number', type: 'varchar', length: 100 })
  poNumber!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference!: string | null;

  @Column({ name: 'order_date', type: 'date' })
  orderDate!: Date;

  @Column({ name: 'expected_delivery_date', type: 'date', nullable: true })
  expectedDeliveryDate!: Date | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  subtotal!: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  taxAmount!: number;

  @Column({ name: 'shipping_cost', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  shippingCost!: number;

  @Column({ name: 'other_costs', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  otherCosts!: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  total!: number;

  @Column({ type: 'enum', enum: ['draft', 'submitted', 'confirmed', 'partial_received', 'received', 'cancelled'], default: 'draft' })
  status!: 'draft' | 'submitted' | 'confirmed' | 'partial_received' | 'received' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('PurchaseOrderLine', 'purchaseOrder')
  lines!: PurchaseOrderLine[];
}

