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

@Entity({ name: 'hr_pension' })
export class HrPension {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ type: 'tinyint', width: 1, default: 1 })
  eligible!: boolean;

  @Column({ type: 'tinyint', width: 1, default: 0 })
  enrolled!: boolean;

  @Column({ name: 'scheme_name', type: 'varchar', length: 255, nullable: true })
  schemeName!: string | null;

  @Column({ name: 'contribution_pct', type: 'decimal', precision: 5, scale: 2, nullable: true })
  contributionPct!: number | null;

  @Column({ name: 'employer_contribution_pct', type: 'decimal', precision: 5, scale: 2, nullable: true })
  employerContributionPct!: number | null;

  @Column({ name: 'deferral_date', type: 'date', nullable: true })
  deferralDate!: string | null;

  @Column({ name: 'enrolment_date', type: 'date', nullable: true })
  enrolmentDate!: string | null;

  @Column({ name: 'opt_out_date', type: 'date', nullable: true })
  optOutDate!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
