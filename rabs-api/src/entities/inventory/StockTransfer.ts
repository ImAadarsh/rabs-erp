import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Warehouse } from './Warehouse.js';
import { User } from '../iam/User.js';
import type { StockTransferLine } from './StockTransferLine.js';

@Entity({ name: 'stock_transfers' })
export class StockTransfer {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'transfer_number', type: 'varchar', length: 100 })
  transferNumber!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'from_warehouse_id' })
  fromWarehouse!: Warehouse;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'to_warehouse_id' })
  toWarehouse!: Warehouse;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate!: Date;

  @Column({ name: 'expected_arrival_date', type: 'date', nullable: true })
  expectedArrivalDate!: Date | null;

  @Column({ type: 'enum', enum: ['draft', 'submitted', 'in_transit', 'received', 'cancelled'], default: 'draft' })
  status!: 'draft' | 'submitted' | 'in_transit' | 'received' | 'cancelled';

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'shipped_by' })
  shippedBy!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'received_by' })
  receivedBy!: User | null;

  @Column({ name: 'shipped_at', type: 'timestamp', nullable: true })
  shippedAt!: Date | null;

  @Column({ name: 'received_at', type: 'timestamp', nullable: true })
  receivedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('StockTransferLine', 'stockTransfer')
  lines!: StockTransferLine[];
}

