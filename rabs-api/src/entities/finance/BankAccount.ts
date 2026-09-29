import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { LedgerAccount } from './LedgerAccount.js';
import { BankTransaction } from './BankTransaction.js';

@Entity({ name: 'bank_accounts' })
export class BankAccount {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName!: string;

  @Column({ name: 'bank_name', type: 'varchar', length: 255 })
  bankName!: string;

  @Column({ name: 'account_number', type: 'varchar', length: 100, nullable: true })
  accountNumber!: string | null;

  @Column({ name: 'routing_number', type: 'varchar', length: 100, nullable: true })
  routingNumber!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  iban!: string | null;

  @Column({ name: 'swift_code', type: 'varchar', length: 20, nullable: true })
  swiftCode!: string | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ 
    name: 'current_balance', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  currentBalance!: number;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccount | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ 
    type: 'enum', 
    enum: ['active', 'inactive', 'closed'], 
    default: 'active' 
  })
  status!: 'active' | 'inactive' | 'closed';

  @OneToMany(() => BankTransaction, (bankTransaction) => bankTransaction.bankAccount)
  bankTransactions!: BankTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

