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
import { Employee } from '../hr/Employee.js';
import { AccVatCode } from './AccVatCode.js';
import { LedgerAccount } from './LedgerAccount.js';
import { JournalEntry } from './JournalEntry.js';
import { User } from '../iam/User.js';

@Entity({ name: 'acc_expenses' })
export class AccExpense {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true, nullable: true })
  employeeId!: string | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee | null;

  @Column({ name: 'expense_date', type: 'date' })
  expenseDate!: Date;

  @Column({ type: 'varchar', length: 100, nullable: true })
  category!: string | null;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount!: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount!: number;

  @Column({ name: 'vat_code_id', type: 'bigint', unsigned: true, nullable: true })
  vatCodeId!: string | null;

  @ManyToOne(() => AccVatCode, { nullable: true })
  @JoinColumn({ name: 'vat_code_id' })
  vatCode!: AccVatCode | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'receipt_url', type: 'varchar', length: 1000, nullable: true })
  receiptUrl!: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'submitted', 'approved', 'rejected', 'reimbursed', 'void'],
    default: 'draft'
  })
  status!: 'draft' | 'submitted' | 'approved' | 'rejected' | 'reimbursed' | 'void';

  @Column({ name: 'ledger_account_id', type: 'bigint', unsigned: true, nullable: true })
  ledgerAccountId!: string | null;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccount | null;

  @Column({ name: 'journal_entry_id', type: 'bigint', unsigned: true, nullable: true })
  journalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approver!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'varchar', length: 500, nullable: true })
  rejectionReason!: string | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
