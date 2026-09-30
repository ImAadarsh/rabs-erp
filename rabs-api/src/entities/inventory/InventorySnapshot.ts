import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Variant } from '../catalog/Variant.js';
import { Warehouse } from './Warehouse.js';

@Entity({ name: 'inventory_snapshots' })
export class InventorySnapshot {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'snapshot_date', type: 'date' })
  snapshotDate!: Date;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ name: 'quantity_on_hand', type: 'int' })
  quantityOnHand!: number;

  @Column({ name: 'quantity_reserved', type: 'int' })
  quantityReserved!: number;

  @Column({ name: 'quantity_available', type: 'int' })
  quantityAvailable!: number;

  @Column({ name: 'value_at_cost', type: 'decimal', precision: 15, scale: 4 })
  valueAtCost!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

