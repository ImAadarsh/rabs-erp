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
import { User } from '../iam/User.js';
import { PmProject } from './PmProject.js';
import { PmWorkOrder } from './PmWorkOrder.js';

@Entity({ name: 'pm_tasks' })
export class PmTask {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'project_id', type: 'bigint', unsigned: true })
  projectId!: string;

  @ManyToOne(() => PmProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: PmProject;

  @Column({ name: 'work_order_id', type: 'bigint', unsigned: true, nullable: true })
  workOrderId!: string | null;

  @ManyToOne(() => PmWorkOrder, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'work_order_id' })
  workOrder!: PmWorkOrder | null;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'assignee_user_id', type: 'bigint', unsigned: true, nullable: true })
  assigneeUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_user_id' })
  assignee!: User | null;

  @Column({
    type: 'enum',
    enum: ['todo', 'in_progress', 'blocked', 'done', 'cancelled'],
    default: 'todo'
  })
  status!: 'todo' | 'in_progress' | 'blocked' | 'done' | 'cancelled';

  @Column({
    type: 'enum',
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  })
  priority!: 'low' | 'medium' | 'high' | 'urgent';

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'estimate_hours', type: 'decimal', precision: 10, scale: 2, default: 0 })
  estimateHours!: number;

  @Column({ name: 'logged_hours', type: 'decimal', precision: 10, scale: 2, default: 0 })
  loggedHours!: number;

  @Column({ name: 'progress_pct', type: 'decimal', precision: 5, scale: 2, default: 0 })
  progressPct!: number;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
