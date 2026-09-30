import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BankAccount } from './BankAccount.js';
import { JournalEntry } from './JournalEntry.js';
import { User } from '../iam/User.js';

@Entity({ name: 'acc_bank_transfers' })
export class AccBankTransfer {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'from_bank_account_id', type: 'bigint', unsigned: true })
  fromBankAccountId!: string;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'from_bank_account_id' })
  fromBankAccount!: BankAccount;

  @Column({ name: 'to_bank_account_id', type: 'bigint', unsigned: true })
  toBankAccountId!: string;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'to_bank_account_id' })
  toBankAccount!: BankAccount;

  @Column({ name: 'transfer_date', type: 'date' })
  transferDate!: Date;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  amount!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference!: string | null;

  @Column({ name: 'journal_entry_id', type: 'bigint', unsigned: true, nullable: true })
  journalEntryId!: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
