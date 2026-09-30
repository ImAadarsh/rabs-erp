import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Order } from './Order.js';
import { Customer } from './Customer.js';
import { User } from '../iam/User.js';
import { ReturnLine } from './ReturnLine.js';

@Entity({ name: 'returns' })
export class Return {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'return_number', type: 'varchar', length: 100, unique: true })
  returnNumber!: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'return_date', type: 'date' })
  returnDate!: Date;

  @Column({ name: 'reason_code', type: 'enum', enum: ['defective', 'wrong_item', 'not_as_described', 'size_issue', 'changed_mind', 'damaged_in_transit', 'other'] })
  reasonCode!: 'defective' | 'wrong_item' | 'not_as_described' | 'size_issue' | 'changed_mind' | 'damaged_in_transit' | 'other';

  @Column({ name: 'reason_notes', type: 'text', nullable: true })
  reasonNotes!: string | null;

  @Column({ name: 'refund_method', type: 'enum', enum: ['original_payment', 'store_credit', 'exchange', 'no_refund'], default: 'original_payment' })
  refundMethod!: 'original_payment' | 'store_credit' | 'exchange' | 'no_refund';

  @Column({ name: 'refund_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  refundAmount!: number;

  @Column({ name: 'restocking_fee', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  restockingFee!: number;

  @Column({ name: 'return_shipping_paid_by', type: 'enum', enum: ['customer', 'merchant'], default: 'customer' })
  returnShippingPaidBy!: 'customer' | 'merchant';

  @Column({ type: 'enum', enum: ['requested', 'approved', 'rejected', 'received', 'refunded', 'completed', 'cancelled'], default: 'requested' })
  status!: 'requested' | 'approved' | 'rejected' | 'received' | 'refunded' | 'completed' | 'cancelled';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'received_at', type: 'timestamp', nullable: true })
  receivedAt!: Date | null;

  @Column({ name: 'refunded_at', type: 'timestamp', nullable: true })
  refundedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany(() => ReturnLine, (returnLine) => returnLine.return)
  lines!: ReturnLine[];
}

