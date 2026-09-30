import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Invoice } from './Invoice.js';
import { Payment } from './Payment.js';
import { BankAccount } from './BankAccount.js';
import { JournalEntry } from './JournalEntry.js';
import { User } from '../iam/User.js';

@Entity({ name: 'acc_invoice_payments' })
export class AccInvoicePayment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'invoice_id', type: 'bigint', unsigned: true })
  invoiceId!: string;

  @ManyToOne(() => Invoice)
  @JoinColumn({ name: 'invoice_id' })
  invoice!: Invoice;

  @Column({ name: 'payment_id', type: 'bigint', unsigned: true, nullable: true })
  paymentId!: string | null;

  @ManyToOne(() => Payment, { nullable: true })
  @JoinColumn({ name: 'payment_id' })
  payment!: Payment | null;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'bank_account_id', type: 'bigint', unsigned: true, nullable: true })
  bankAccountId!: string | null;

  @ManyToOne(() => BankAccount, { nullable: true })
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount!: BankAccount | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference!: string | null;

  @Column({ name: 'journal_entry_id', type: 'bigint', unsigned: true, nullable: true })
  journalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
