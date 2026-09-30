import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { ReportDefinition } from './ReportDefinition.js';
import { User } from '../iam/User.js';

@Entity('scheduled_reports')
export class ScheduledReport {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ name: 'report_definition_id', type: 'bigint' })
  reportDefinitionId!: string;

  @ManyToOne(() => ReportDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_definition_id' })
  reportDefinition!: ReportDefinition;

  @Column({ name: 'schedule_name', type: 'varchar', length: 255 })
  scheduleName!: string;

  @Column({ type: 'enum', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] })
  frequency!: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

  @Column({ name: 'day_of_week', type: 'int', nullable: true })
  dayOfWeek?: number;

  @Column({ name: 'day_of_month', type: 'int', nullable: true })
  dayOfMonth?: number;

  @Column({ name: 'run_time', type: 'time', default: '09:00:00' })
  runTime!: string;

  @Column({ type: 'json' })
  recipients!: any;

  @Column({ type: 'json', nullable: true })
  parameters?: any;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_run_at', type: 'timestamp', nullable: true })
  lastRunAt?: Date;

  @Column({ name: 'next_run_at', type: 'timestamp', nullable: true })
  nextRunAt?: Date;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdById?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
