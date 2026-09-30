import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';
import type { EmploymentContract } from './EmploymentContract.js';
import type { EmployeeDocument } from './EmployeeDocument.js';
import type { TimeEntry } from './TimeEntry.js';
import type { LeaveRequest } from './LeaveRequest.js';
import type { Shift } from './Shift.js';
import type { PayrollLine } from './PayrollLine.js';
import type { KpiRecord } from './KpiRecord.js';

@Entity({ name: 'employees' })
export class Employee {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @Column({ name: 'employee_number', type: 'varchar', length: 100 })
  employeeNumber!: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ name: 'date_of_birth', type: 'date', nullable: true })
  dateOfBirth!: Date | null;

  @Column({ type: 'enum', enum: ['male', 'female', 'other', 'prefer_not_to_say'], nullable: true })
  gender!: 'male' | 'female' | 'other' | 'prefer_not_to_say' | null;

  @Column({ name: 'marital_status', type: 'enum', enum: ['single', 'married', 'divorced', 'widowed', 'other'], nullable: true })
  maritalStatus!: 'single' | 'married' | 'divorced' | 'widowed' | 'other' | null;

  @Column({ name: 'national_id', type: 'varchar', length: 100, nullable: true })
  nationalId!: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 100, nullable: true })
  taxId!: string | null;

  /** UK National Insurance number (access-controlled via HR roles). */
  @Column({ name: 'ni_number', type: 'varchar', length: 20, nullable: true })
  niNumber!: string | null;

  /** UK PAYE tax code e.g. 1257L */
  @Column({ name: 'tax_code', type: 'varchar', length: 20, nullable: true, default: '1257L' })
  taxCode!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department!: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 255, nullable: true })
  jobTitle!: string | null;

  @Column({ name: 'annual_salary', type: 'decimal', precision: 15, scale: 4, nullable: true })
  annualSalary!: number | null;

  @Column({
    name: 'pay_frequency',
    type: 'enum',
    enum: ['weekly', 'fortnightly', 'four_weekly', 'monthly'],
    nullable: true,
    default: 'monthly'
  })
  payFrequency!: 'weekly' | 'fortnightly' | 'four_weekly' | 'monthly' | null;

  @Column({ name: 'passport_number', type: 'varchar', length: 100, nullable: true })
  passportNumber!: string | null;

  @Column({ name: 'address_line1', type: 'varchar', length: 255, nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ name: 'state_province', type: 'varchar', length: 100, nullable: true })
  stateProvince!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode!: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ name: 'emergency_contact_name', type: 'varchar', length: 255, nullable: true })
  emergencyContactName!: string | null;

  @Column({ name: 'emergency_contact_phone', type: 'varchar', length: 50, nullable: true })
  emergencyContactPhone!: string | null;

  @Column({ name: 'emergency_contact_relationship', type: 'varchar', length: 100, nullable: true })
  emergencyContactRelationship!: string | null;

  @Column({ name: 'hire_date', type: 'date' })
  hireDate!: Date;

  @Column({ name: 'termination_date', type: 'date', nullable: true })
  terminationDate!: Date | null;

  @Column({ name: 'employment_type', type: 'enum', enum: ['full_time', 'part_time', 'contract', 'temporary', 'intern'], default: 'full_time' })
  employmentType!: 'full_time' | 'part_time' | 'contract' | 'temporary' | 'intern';

  @Column({ type: 'enum', enum: ['active', 'on_leave', 'suspended', 'terminated'], default: 'active' })
  status!: 'active' | 'on_leave' | 'suspended' | 'terminated';

  @Column({ name: 'photo_url', type: 'varchar', length: 500, nullable: true })
  photoUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @OneToMany('EmploymentContract', 'employee')
  employmentContracts!: EmploymentContract[];

  @OneToMany('EmployeeDocument', 'employee')
  documents!: EmployeeDocument[];

  @OneToMany('TimeEntry', 'employee')
  timeEntries!: TimeEntry[];

  @OneToMany('LeaveRequest', 'employee')
  leaveRequests!: LeaveRequest[];

  @OneToMany('Shift', 'employee')
  shifts!: Shift[];

  @OneToMany('PayrollLine', 'employee')
  payrollLines!: PayrollLine[];

  @OneToMany('KpiRecord', 'employee')
  kpiRecords!: KpiRecord[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}

