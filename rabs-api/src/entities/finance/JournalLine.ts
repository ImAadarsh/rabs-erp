import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { JournalEntry } from './JournalEntry.js';
import { LedgerAccount } from './LedgerAccount.js';
import { CostCenter } from './CostCenter.js';

@Entity({ name: 'journal_lines' })
export class JournalLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => JournalEntry, (journalEntry) => journalEntry.journalLines)
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry;

  @ManyToOne(() => LedgerAccount)
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccount;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter!: CostCenter | null;

  @Column({ name: 'line_number', type: 'int' })
  lineNumber!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({ 
    name: 'debit_amount', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  debitAmount!: number;

  @Column({ 
    name: 'credit_amount', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  creditAmount!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ 
    name: 'exchange_rate', 
    type: 'decimal', 
    precision: 15, 
    scale: 6, 
    default: 1.000000 
  })
  exchangeRate!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

