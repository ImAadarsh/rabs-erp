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
import { HrLeavePolicy } from './HrLeavePolicy.js';

@Entity({ name: 'hr_leave_balances' })
export class HrLeaveBalance {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'leave_policy_id', type: 'bigint', unsigned: true })
  leavePolicyId!: string;

  @ManyToOne(() => HrLeavePolicy, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'leave_policy_id' })
  leavePolicy!: HrLeavePolicy;

  @Column({ type: 'smallint' })
  year!: number;

  @Column({ name: 'entitled_days', type: 'decimal', precision: 5, scale: 2, default: 0 })
  entitledDays!: number;

  @Column({ name: 'used_days', type: 'decimal', precision: 5, scale: 2, default: 0 })
  usedDays!: number;

  @Column({ name: 'pending_days', type: 'decimal', precision: 5, scale: 2, default: 0 })
  pendingDays!: number;

  @Column({ name: 'carried_days', type: 'decimal', precision: 5, scale: 2, default: 0 })
  carriedDays!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
