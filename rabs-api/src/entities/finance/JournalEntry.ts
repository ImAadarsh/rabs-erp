import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { FiscalPeriod } from './FiscalPeriod.js';
import { User } from '../iam/User.js';
import { JournalLine } from './JournalLine.js';
import { BankTransaction } from './BankTransaction.js';

@Entity({ name: 'journal_entries' })
export class JournalEntry {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @ManyToOne(() => FiscalPeriod)
  @JoinColumn({ name: 'fiscal_period_id' })
  fiscalPeriod!: FiscalPeriod;

  @Column({ name: 'journal_number', type: 'varchar', length: 100 })
  journalNumber!: string;

  @Column({ name: 'entry_date', type: 'date' })
  entryDate!: Date;

  @Column({ 
    name: 'entry_type', 
    type: 'enum', 
    enum: ['standard', 'adjusting', 'closing', 'reversing', 'recurring'],
    default: 'standard'
  })
  entryType!: 'standard' | 'adjusting' | 'closing' | 'reversing' | 'recurring';

  @Column({ 
    name: 'source_type', 
    type: 'enum', 
    enum: ['manual', 'invoice', 'payment', 'order', 'payroll', 'inventory', 'other'],
    default: 'manual'
  })
  sourceType!: 'manual' | 'invoice' | 'payment' | 'order' | 'payroll' | 'inventory' | 'other';

  @Column({ name: 'source_id', type: 'bigint', unsigned: true, nullable: true })
  sourceId!: string | null;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reference!: string | null;

  @Column({ 
    type: 'enum', 
    enum: ['draft', 'posted', 'voided'],
    default: 'draft'
  })
  status!: 'draft' | 'posted' | 'voided';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'posted_by' })
  postedBy!: User | null;

  @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
  postedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @OneToMany(() => JournalLine, (journalLine) => journalLine.journalEntry, { cascade: true })
  journalLines!: JournalLine[];

  @OneToMany(() => BankTransaction, (bankTransaction) => bankTransaction.journalEntry)
  bankTransactions!: BankTransaction[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

