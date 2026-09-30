import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Employee } from './Employee.js';
import { User } from '../iam/User.js';

@Entity({ name: 'leave_requests' })
export class LeaveRequest {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'leave_type', type: 'enum', enum: ['vacation', 'sick', 'personal', 'maternity', 'paternity', 'bereavement', 'unpaid', 'other'] })
  leaveType!: 'vacation' | 'sick' | 'personal' | 'maternity' | 'paternity' | 'bereavement' | 'unpaid' | 'other';

  @Column({ name: 'leave_policy_id', type: 'bigint', unsigned: true, nullable: true })
  leavePolicyId!: string | null;

  @Column({ name: 'start_date', type: 'date' })
  startDate!: Date;

  @Column({ name: 'end_date', type: 'date' })
  endDate!: Date;

  @Column({ name: 'total_days', type: 'decimal', precision: 5, scale: 2 })
  totalDays!: number;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'rejected', 'cancelled'], default: 'pending' })
  status!: 'pending' | 'approved' | 'rejected' | 'cancelled';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'approved_by' })
  approvedBy!: User | null;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt!: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

