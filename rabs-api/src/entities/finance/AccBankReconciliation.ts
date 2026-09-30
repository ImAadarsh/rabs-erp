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
import { BankAccount } from './BankAccount.js';
import { User } from '../iam/User.js';

@Entity({ name: 'acc_bank_reconciliations' })
export class AccBankReconciliation {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'bank_account_id', type: 'bigint', unsigned: true })
  bankAccountId!: string;

  @ManyToOne(() => BankAccount)
  @JoinColumn({ name: 'bank_account_id' })
  bankAccount!: BankAccount;

  @Column({ name: 'statement_date', type: 'date' })
  statementDate!: Date;

  @Column({ name: 'statement_balance', type: 'decimal', precision: 15, scale: 4 })
  statementBalance!: number;

  @Column({ name: 'book_balance', type: 'decimal', precision: 15, scale: 4, default: 0 })
  bookBalance!: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  difference!: number;

  @Column({
    type: 'enum',
    enum: ['in_progress', 'completed'],
    default: 'in_progress'
  })
  status!: 'in_progress' | 'completed';

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'completed_by', type: 'bigint', unsigned: true, nullable: true })
  completedBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'completed_by' })
  completer!: User | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
