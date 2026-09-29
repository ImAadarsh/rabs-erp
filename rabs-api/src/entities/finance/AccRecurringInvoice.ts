import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Customer } from '../orders/Customer.js';
import { User } from '../iam/User.js';
import { Invoice } from './Invoice.js';

@Entity({ name: 'acc_recurring_invoices' })
export class AccRecurringInvoice {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'template_name', type: 'varchar', length: 255 })
  templateName!: string;

  @Column({
    type: 'enum',
    enum: ['weekly', 'monthly', 'quarterly', 'yearly'],
    default: 'monthly'
  })
  frequency!: 'weekly' | 'monthly' | 'quarterly' | 'yearly';

  @Column({ name: 'next_run_date', type: 'date' })
  nextRunDate!: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: Date | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'payment_terms', type: 'varchar', length: 100, nullable: true })
  paymentTerms!: string | null;

  @Column({ name: 'lines_json', type: 'json' })
  linesJson!: Array<Record<string, unknown>>;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_invoice_id', type: 'bigint', unsigned: true, nullable: true })
  lastInvoiceId!: string | null;

  @ManyToOne(() => Invoice, { nullable: true })
  @JoinColumn({ name: 'last_invoice_id' })
  lastInvoice!: Invoice | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
