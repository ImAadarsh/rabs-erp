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
import { User } from '../iam/User.js';

@Entity({ name: 'hr_overtime' })
export class HrOvertime {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'work_date', type: 'date' })
  workDate!: string;

  @Column({ type: 'decimal', precision: 5, scale: 2 })
  hours!: number;

  @Column({ name: 'rate_multiplier', type: 'decimal', precision: 4, scale: 2, default: 1.5 })
  rateMultiplier!: number;

  @Column({ type: 'varchar', length: 500, nullable: true })
  reason!: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'paid'],
    default: 'pending'
  })
  status!: 'pending' | 'approved' | 'rejected' | 'paid';

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
