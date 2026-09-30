import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ChartOfAccounts } from './ChartOfAccounts.js';
import { JournalLine } from './JournalLine.js';
import { BudgetLine } from './BudgetLine.js';
import { BankAccount } from './BankAccount.js';

@Entity({ name: 'ledger_accounts' })
export class LedgerAccount {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => ChartOfAccounts)
  @JoinColumn({ name: 'chart_of_accounts_id' })
  chartOfAccounts!: ChartOfAccounts;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'parent_account_id' })
  parentAccount!: LedgerAccount | null;

  @Column({ name: 'account_code', type: 'varchar', length: 50 })
  accountCode!: string;

  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName!: string;

  @Column({ 
    name: 'account_type', 
    type: 'enum', 
    enum: ['asset', 'liability', 'equity', 'revenue', 'expense', 'cost_of_goods_sold'] 
  })
  accountType!: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense' | 'cost_of_goods_sold';

  @Column({ name: 'account_subtype', type: 'varchar', length: 100, nullable: true })
  accountSubtype!: string | null;

  @Column({ 
    name: 'normal_balance', 
    type: 'enum', 
    enum: ['debit', 'credit'] 
  })
  normalBalance!: 'debit' | 'credit';

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany(() => LedgerAccount, (ledgerAccount) => ledgerAccount.parentAccount)
  childAccounts!: LedgerAccount[];

  @OneToMany(() => JournalLine, (journalLine) => journalLine.ledgerAccount)
  journalLines!: JournalLine[];

  @OneToMany(() => BudgetLine, (budgetLine) => budgetLine.ledgerAccount)
  budgetLines!: BudgetLine[];

  @OneToMany(() => BankAccount, (bankAccount) => bankAccount.ledgerAccount)
  bankAccounts!: BankAccount[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

