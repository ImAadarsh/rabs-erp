import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Employee } from './Employee.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { Location } from '../iam/Location.js';
import { CostCenter } from '../finance/CostCenter.js';

@Entity({ name: 'employment_contracts' })
export class EmploymentContract {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @ManyToOne(() => BusinessUnit)
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit;

  @ManyToOne(() => Location, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location!: Location | null;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter!: CostCenter | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'reporting_to' })
  reportingTo!: Employee | null;

  @Column({ name: 'job_title', type: 'varchar', length: 255 })
  jobTitle!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department!: string | null;

  @Column({ name: 'contract_type', type: 'enum', enum: ['permanent', 'fixed_term', 'contract', 'zero_hours'] })
  contractType!: 'permanent' | 'fixed_term' | 'contract' | 'zero_hours';

  @Column({ name: 'start_date', type: 'date' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: Date | null;

  @Column({ name: 'salary_amount', type: 'decimal', precision: 15, scale: 4 })
  salaryAmount!: number;

  @Column({ name: 'salary_currency', type: 'char', length: 3, default: 'GBP' })
  salaryCurrency!: string;

  @Column({ name: 'salary_period', type: 'enum', enum: ['hourly', 'daily', 'weekly', 'monthly', 'annual'], default: 'annual' })
  salaryPeriod!: 'hourly' | 'daily' | 'weekly' | 'monthly' | 'annual';

  @Column({ name: 'working_hours_per_week', type: 'decimal', precision: 5, scale: 2, nullable: true })
  workingHoursPerWeek!: number | null;

  @Column({ name: 'probation_period_days', type: 'int', nullable: true })
  probationPeriodDays!: number | null;

  @Column({ name: 'notice_period_days', type: 'int', nullable: true })
  noticePeriodDays!: number | null;

  @Column({ name: 'contract_document_url', type: 'varchar', length: 1000, nullable: true })
  contractDocumentUrl!: string | null;

  @Column({ name: 'is_current', type: 'boolean', default: true })
  isCurrent!: boolean;

  @Column({ type: 'enum', enum: ['draft', 'active', 'expired', 'terminated'], default: 'draft' })
  status!: 'draft' | 'active' | 'expired' | 'terminated';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

