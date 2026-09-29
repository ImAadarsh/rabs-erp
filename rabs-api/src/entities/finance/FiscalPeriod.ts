import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';
import { JournalEntry } from './JournalEntry.js';
import { BudgetLine } from './BudgetLine.js';

@Entity({ name: 'fiscal_periods' })
export class FiscalPeriod {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'period_name', type: 'varchar', length: 100 })
  periodName!: string;

  @Column({ 
    name: 'period_type', 
    type: 'enum', 
    enum: ['month', 'quarter', 'year'] 
  })
  periodType!: 'month' | 'quarter' | 'year';

  @Column({ name: 'start_date', type: 'date' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: Date;

  @Column({ name: 'fiscal_year', type: 'int' })
  fiscalYear!: number;

  @Column({ name: 'is_closed', type: 'boolean', default: false })
  isClosed!: boolean;

  @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
  closedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'closed_by' })
  closedBy!: User | null;

  @OneToMany(() => JournalEntry, (journalEntry) => journalEntry.fiscalPeriod)
  journalEntries!: JournalEntry[];

  @OneToMany(() => BudgetLine, (budgetLine) => budgetLine.fiscalPeriod)
  budgetLines!: BudgetLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

