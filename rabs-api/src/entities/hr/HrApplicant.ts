import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { HrJobPosting } from './HrJobPosting.js';
import { Employee } from './Employee.js';

@Entity({ name: 'hr_applicants' })
export class HrApplicant {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'job_posting_id', type: 'bigint', unsigned: true })
  jobPostingId!: string;

  @ManyToOne(() => HrJobPosting, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'job_posting_id' })
  jobPosting!: HrJobPosting;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName!: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({
    type: 'enum',
    enum: ['applied', 'screening', 'interview', 'offer', 'hired', 'rejected', 'withdrawn'],
    default: 'applied'
  })
  stage!: 'applied' | 'screening' | 'interview' | 'offer' | 'hired' | 'rejected' | 'withdrawn';

  @Column({ name: 'cv_s3_key', type: 'varchar', length: 500, nullable: true })
  cvS3Key!: string | null;

  @Column({ name: 'cv_url', type: 'varchar', length: 1000, nullable: true })
  cvUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true, nullable: true })
  employeeId!: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
