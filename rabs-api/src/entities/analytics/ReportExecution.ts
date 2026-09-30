import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { ReportDefinition } from './ReportDefinition.js';
import { ScheduledReport } from './ScheduledReport.js';
import { User } from '../iam/User.js';

@Entity('report_executions')
export class ReportExecution {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ name: 'report_definition_id', type: 'bigint' })
  reportDefinitionId!: string;

  @ManyToOne(() => ReportDefinition, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'report_definition_id' })
  reportDefinition!: ReportDefinition;

  @Column({ name: 'scheduled_report_id', type: 'bigint', nullable: true })
  scheduledReportId?: string;

  @ManyToOne(() => ScheduledReport, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'scheduled_report_id' })
  scheduledReport?: ScheduledReport;

  @Column({ type: 'json', nullable: true })
  parameters?: any;

  @Column({ type: 'enum', enum: ['queued', 'running', 'completed', 'failed'], default: 'queued' })
  status!: 'queued' | 'running' | 'completed' | 'failed';

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'execution_time_seconds', type: 'int', nullable: true })
  executionTimeSeconds?: number;

  @Column({ name: 'output_url', type: 'varchar', length: 1000, nullable: true })
  outputUrl?: string;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'row_count', type: 'int', nullable: true })
  rowCount?: number;

  @Column({ name: 'requested_by', type: 'bigint', nullable: true })
  requestedById?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'requested_by' })
  requestedBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
