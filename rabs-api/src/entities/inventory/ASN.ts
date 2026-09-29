import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { PurchaseOrder } from './PurchaseOrder.js';
import { Supplier } from './Supplier.js';
import { Warehouse } from './Warehouse.js';

@Entity({ name: 'asn' })
export class ASN {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder!: PurchaseOrder | null;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ name: 'asn_number', type: 'varchar', length: 100 })
  asnNumber!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference!: string | null;

  @Column({ name: 'expected_date', type: 'date' })
  expectedDate!: Date;

  @Column({ type: 'varchar', length: 255, nullable: true })
  carrier!: string | null;

  @Column({ name: 'tracking_number', type: 'varchar', length: 255, nullable: true })
  trackingNumber!: string | null;

  @Column({ name: 'total_pallets', type: 'int', nullable: true })
  totalPallets!: number | null;

  @Column({ name: 'total_cartons', type: 'int', nullable: true })
  totalCartons!: number | null;

  @Column({ type: 'enum', enum: ['pending', 'in_transit', 'arrived', 'receiving', 'completed', 'cancelled'], default: 'pending' })
  status!: 'pending' | 'in_transit' | 'arrived' | 'receiving' | 'completed' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

