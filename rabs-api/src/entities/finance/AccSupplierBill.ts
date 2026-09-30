import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Supplier } from '../inventory/Supplier.js';
import { User } from '../iam/User.js';
import { JournalEntry } from './JournalEntry.js';
import { AccSupplierBillLine } from './AccSupplierBillLine.js';

@Entity({ name: 'acc_supplier_bills' })
export class AccSupplierBill {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'supplier_id', type: 'bigint', unsigned: true })
  supplierId!: string;

  @ManyToOne(() => Supplier)
  @JoinColumn({ name: 'supplier_id' })
  supplier!: Supplier;

  @Column({ name: 'bill_number', type: 'varchar', length: 100 })
  billNumber!: string;

  @Column({ name: 'bill_date', type: 'date' })
  billDate!: Date;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: Date | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  subtotal!: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount!: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  total!: number;

  @Column({ name: 'paid_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  paidAmount!: number;

  @Column({
    type: 'enum',
    enum: ['draft', 'pending_approval', 'approved', 'partially_paid', 'paid', 'void'],
    default: 'draft'
  })
  status!: 'draft' | 'pending_approval' | 'approved' | 'partially_paid' | 'paid' | 'void';

  @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
  documentUrl!: string | null;

  @Column({ name: 'journal_entry_id', type: 'bigint', unsigned: true, nullable: true })
  journalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
  postedAt!: Date | null;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @OneToMany(() => AccSupplierBillLine, (line) => line.bill, { cascade: true })
  lines!: AccSupplierBillLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
