import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { ASN } from './ASN.js';
import { PurchaseOrder } from './PurchaseOrder.js';
import { Warehouse } from './Warehouse.js';
import { User } from '../iam/User.js';
import type { GRNLine } from './GRNLine.js';

@Entity({ name: 'grn' })
export class GRN {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => ASN, { nullable: true })
  @JoinColumn({ name: 'asn_id' })
  asn!: ASN | null;

  @ManyToOne(() => PurchaseOrder, { nullable: true })
  @JoinColumn({ name: 'purchase_order_id' })
  purchaseOrder!: PurchaseOrder | null;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ name: 'grn_number', type: 'varchar', length: 100 })
  grnNumber!: string;

  @Column({ name: 'received_date', type: 'date' })
  receivedDate!: Date;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'received_by' })
  receivedBy!: User;

  @Column({ type: 'enum', enum: ['draft', 'qa_pending', 'approved', 'rejected', 'put_away'], default: 'draft' })
  status!: 'draft' | 'qa_pending' | 'approved' | 'rejected' | 'put_away';

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('GRNLine', 'grn')
  lines!: GRNLine[];
}

