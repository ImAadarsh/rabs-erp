import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { PayrollRun } from './PayrollRun.js';
import { Employee } from './Employee.js';
import { CostCenter } from '../finance/CostCenter.js';

@Entity({ name: 'payroll_lines' })
export class PayrollLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => PayrollRun)
  @JoinColumn({ name: 'payroll_run_id' })
  payrollRun!: PayrollRun;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter!: CostCenter | null;

  @Column({ name: 'gross_pay', type: 'decimal', precision: 15, scale: 4 })
  grossPay!: number;

  @Column({ name: 'tax_deduction', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  taxDeduction!: number;

  @Column({ name: 'national_insurance', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  nationalInsurance!: number;

  @Column({ name: 'pension_deduction', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  pensionDeduction!: number;

  @Column({ name: 'other_deductions', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  otherDeductions!: number;

  /** DB-generated: tax + NI + pension + other — do not write from app code. */
  @Column({
    name: 'total_deductions',
    type: 'decimal',
    precision: 15,
    scale: 4,
    generatedType: 'STORED',
    asExpression: 'tax_deduction + national_insurance + pension_deduction + other_deductions',
    insert: false,
    update: false,
  })
  totalDeductions!: number | null;

  /** DB-generated — do not write from app code. */
  @Column({
    name: 'net_pay',
    type: 'decimal',
    precision: 15,
    scale: 4,
    generatedType: 'STORED',
    asExpression: 'gross_pay - tax_deduction - national_insurance - pension_deduction - other_deductions',
    insert: false,
    update: false,
  })
  netPay!: number | null;

  @Column({ name: 'employer_ni', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  employerNi!: number;

  @Column({ name: 'employer_pension', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  employerPension!: number;

  /** DB-generated — do not write from app code. */
  @Column({
    name: 'total_employer_costs',
    type: 'decimal',
    precision: 15,
    scale: 4,
    generatedType: 'STORED',
    asExpression: 'gross_pay + employer_ni + employer_pension',
    insert: false,
    update: false,
  })
  totalEmployerCosts!: number | null;

  @Column({ name: 'regular_hours', type: 'decimal', precision: 5, scale: 2, default: 0.00 })
  regularHours!: number;

  @Column({ name: 'overtime_hours', type: 'decimal', precision: 5, scale: 2, default: 0.00 })
  overtimeHours!: number;

  @Column({ name: 'holiday_hours', type: 'decimal', precision: 5, scale: 2, default: 0.00 })
  holidayHours!: number;

  @Column({ name: 'sick_hours', type: 'decimal', precision: 5, scale: 2, default: 0.00 })
  sickHours!: number;

  @Column({ name: 'payment_method', type: 'enum', enum: ['bank_transfer', 'check', 'cash', 'paypal'], default: 'bank_transfer' })
  paymentMethod!: 'bank_transfer' | 'check' | 'cash' | 'paypal';

  @Column({ name: 'payslip_url', type: 'varchar', length: 1000, nullable: true })
  payslipUrl!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

