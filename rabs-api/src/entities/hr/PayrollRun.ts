import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { User } from '../iam/User.js';
import { JournalEntry } from '../finance/JournalEntry.js';
import type { PayrollLine } from './PayrollLine.js';

@Entity({ name: 'payroll_runs' })
export class PayrollRun {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @Column({ name: 'payroll_number', type: 'varchar', length: 100 })
  payrollNumber!: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({ name: 'payment_date', type: 'date' })
  paymentDate!: Date;

  @Column({ name: 'total_gross', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalGross!: number;

  @Column({ name: 'total_deductions', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalDeductions!: number;

  /** DB-generated: total_gross - total_deductions — do not write from app code. */
  @Column({
    name: 'total_net',
    type: 'decimal',
    precision: 15,
    scale: 4,
    generatedType: 'STORED',
    asExpression: 'total_gross - total_deductions',
    insert: false,
    update: false,
  })
  totalNet!: number | null;

  @Column({ name: 'total_employer_costs', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalEmployerCosts!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'employee_count', type: 'int', default: 0 })
  employeeCount!: number;

  @Column({ type: 'enum', enum: ['draft', 'calculated', 'approved', 'paid', 'posted'], default: 'draft' })
  status!: 'draft' | 'calculated' | 'approved' | 'paid' | 'posted';

  @Column({ name: 'calculated_at', type: 'timestamp', nullable: true })
  calculatedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt!: Date | null;

  @Column({ name: 'posted_to_ledger', type: 'boolean', default: false })
  postedToLedger!: boolean;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'journal_entry_id' })
  journalEntry!: JournalEntry | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @OneToMany('PayrollLine', 'payrollRun')
  payrollLines!: PayrollLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

