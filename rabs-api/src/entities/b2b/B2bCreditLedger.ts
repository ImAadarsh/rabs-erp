import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Customer } from '../orders/Customer.js';

@Entity({ name: 'b2b_credit_ledger' })
export class B2bCreditLedger {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'entry_type', type: 'enum', enum: ['invoice', 'payment', 'credit_note', 'adjustment', 'reward'] })
  entryType!: 'invoice' | 'payment' | 'credit_note' | 'adjustment' | 'reward';

  @Column({ type: 'varchar', length: 100 })
  reference!: string;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount!: number;

  @Column({ name: 'balance_after', type: 'decimal', precision: 15, scale: 4, nullable: true })
  balanceAfter!: number | null;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId!: string | null;

  @Column({ name: 'payment_id', type: 'bigint', unsigned: true, nullable: true })
  paymentId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
