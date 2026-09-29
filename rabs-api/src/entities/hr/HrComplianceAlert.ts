import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Employee } from './Employee.js';

@Entity({ name: 'hr_compliance_alerts' })
export class HrComplianceAlert {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true, nullable: true })
  employeeId!: string | null;

  @ManyToOne(() => Employee, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee | null;

  @Column({
    name: 'alert_type',
    type: 'enum',
    enum: ['visa_expiry', 'rtw_expiry', 'document_expiry', 'pension_deferral', 'leave_balance', 'custom']
  })
  alertType!:
    | 'visa_expiry'
    | 'rtw_expiry'
    | 'document_expiry'
    | 'pension_deferral'
    | 'leave_balance'
    | 'custom';

  @Column({
    type: 'enum',
    enum: ['info', 'warning', 'critical'],
    default: 'warning'
  })
  severity!: 'info' | 'warning' | 'critical';

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  message!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({
    type: 'enum',
    enum: ['open', 'acknowledged', 'resolved', 'dismissed'],
    default: 'open'
  })
  status!: 'open' | 'acknowledged' | 'resolved' | 'dismissed';

  @Column({ name: 'reminder_sent_at', type: 'datetime', nullable: true })
  reminderSentAt!: Date | null;

  @Column({ name: 'resolved_at', type: 'datetime', nullable: true })
  resolvedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
