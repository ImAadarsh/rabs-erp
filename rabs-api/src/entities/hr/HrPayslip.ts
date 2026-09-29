import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Employee } from './Employee.js';
import { PayrollRun } from './PayrollRun.js';
import { PayrollLine } from './PayrollLine.js';

@Entity({ name: 'hr_payslips' })
export class HrPayslip {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'payroll_run_id', type: 'bigint', unsigned: true, nullable: true })
  payrollRunId!: string | null;

  @ManyToOne(() => PayrollRun, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payroll_run_id' })
  payrollRun!: PayrollRun | null;

  @Column({ name: 'payroll_line_id', type: 'bigint', unsigned: true, nullable: true })
  payrollLineId!: string | null;

  @ManyToOne(() => PayrollLine, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'payroll_line_id' })
  payrollLine!: PayrollLine | null;

  @Column({ name: 'tax_year', type: 'varchar', length: 9 })
  taxYear!: string;

  @Column({ name: 'pay_period_start', type: 'date' })
  payPeriodStart!: string;

  @Column({ name: 'pay_period_end', type: 'date' })
  payPeriodEnd!: string;

  @Column({ name: 'payment_date', type: 'date', nullable: true })
  paymentDate!: string | null;

  @Column({ name: 'gross_pay', type: 'decimal', precision: 15, scale: 4, default: 0 })
  grossPay!: number;

  @Column({ name: 'tax_deducted', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxDeducted!: number;

  @Column({ name: 'ni_deducted', type: 'decimal', precision: 15, scale: 4, default: 0 })
  niDeducted!: number;

  @Column({ name: 'pension_deducted', type: 'decimal', precision: 15, scale: 4, default: 0 })
  pensionDeducted!: number;

  @Column({ name: 'net_pay', type: 'decimal', precision: 15, scale: 4, default: 0 })
  netPay!: number;

  @Column({ name: 's3_key', type: 'varchar', length: 500, nullable: true })
  s3Key!: string | null;

  @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
  documentUrl!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
