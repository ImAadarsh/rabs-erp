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

@Entity({ name: 'hr_immigration' })
export class HrImmigration {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    type: 'enum',
    enum: [
      'british_citizen',
      'settled',
      'pre_settled',
      'skilled_worker',
      'student',
      'spouse',
      'other',
      'unknown'
    ],
    default: 'unknown'
  })
  status!:
    | 'british_citizen'
    | 'settled'
    | 'pre_settled'
    | 'skilled_worker'
    | 'student'
    | 'spouse'
    | 'other'
    | 'unknown';

  @Column({ name: 'visa_type', type: 'varchar', length: 100, nullable: true })
  visaType!: string | null;

  @Column({ name: 'visa_number', type: 'varchar', length: 100, nullable: true })
  visaNumber!: string | null;

  @Column({ name: 'visa_expiry', type: 'date', nullable: true })
  visaExpiry!: string | null;

  @Column({ name: 'share_code', type: 'varchar', length: 50, nullable: true })
  shareCode!: string | null;

  @Column({ name: 'right_to_work_verified', type: 'tinyint', width: 1, default: 0 })
  rightToWorkVerified!: boolean;

  @Column({ name: 'right_to_work_checked_at', type: 'datetime', nullable: true })
  rightToWorkCheckedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
