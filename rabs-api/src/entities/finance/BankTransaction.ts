import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { BankAccount } from './BankAccount.js';
import { JournalEntry } from './JournalEntry.js';

@Entity({ name: 'bank_transactions' })
export class BankTransaction {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => BankAccount, (bankAccount) => bankAccount.bankTransactions)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount!: BankAccount;

  @Column({ name: 'transaction_date', type: 'date' })
  transactionDate!: Date;

  @Column({ name: 'post_date', type: 'date', nullable: true })
  postDate!: Date | null;

  @Column({ 
    name: 'transaction_type', 
    type: 'enum', 
    enum: ['debit', 'credit', 'fee', 'interest', 'other'] 
  })
  transactionType!: 'debit' | 'credit' | 'fee' | 'interest' | 'other';

  @Column({ 
    type: 'decimal', 
    precision: 15, 
    scale: 4 
  })
  amount!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference!: string | null;

  @Column({ name: 'payee_payer', type: 'varchar', length: 255, nullable: true })
  payeePayer!: string | null;

  @Column({ 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    nullable: true 
  })
  balance!: number | null;

  @Column({ name: 'is_reconciled', type: 'boolean', default: false })
  isReconciled!: boolean;

  @Column({ name: 'reconciled_at', type: 'timestamp', nullable: true })
  reconciledAt!: Date | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @Column({ name: 'import_batch_id', type: 'varchar', length: 64, nullable: true })
  importBatchId!: string | null;

  @Column({ name: 'matched_type', type: 'varchar', length: 40, nullable: true })
  matchedType!: string | null;

  @Column({ name: 'matched_id', type: 'bigint', unsigned: true, nullable: true })
  matchedId!: string | null;

  @Column({ name: 'match_confidence', type: 'decimal', precision: 5, scale: 2, nullable: true })
  matchConfidence!: number | null;

  @Column({ name: 'rule_id', type: 'bigint', unsigned: true, nullable: true })
  ruleId!: string | null;

  @Column({ name: 'imported_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  importedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

