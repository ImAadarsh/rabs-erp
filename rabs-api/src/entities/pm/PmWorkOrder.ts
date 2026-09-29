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
import { PmWorkStage } from './PmWorkStage.js';

@Entity({ name: 'pm_work_orders' })
export class PmWorkOrder {
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

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'scheduled', 'in_progress', 'done', 'cancelled'],
    default: 'draft'
  })
  status!: 'draft' | 'scheduled' | 'in_progress' | 'done' | 'cancelled';

  @Column({ name: 'assignee_user_id', type: 'bigint', unsigned: true, nullable: true })
  assigneeUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'assignee_user_id' })
  assignee!: User | null;

  @Column({ name: 'stage_id', type: 'bigint', unsigned: true, nullable: true })
  stageId!: string | null;

  @ManyToOne(() => PmWorkStage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'stage_id' })
  stage!: PmWorkStage | null;

  @Column({ name: 'scheduled_start', type: 'datetime', nullable: true })
  scheduledStart!: Date | null;

  @Column({ name: 'scheduled_end', type: 'datetime', nullable: true })
  scheduledEnd!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
