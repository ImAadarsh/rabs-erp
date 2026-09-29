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
import { PmTask } from './PmTask.js';

@Entity({ name: 'pm_schedule_blocks' })
export class PmScheduleBlock {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'user_id', type: 'bigint', unsigned: true })
  userId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'project_id', type: 'bigint', unsigned: true, nullable: true })
  projectId!: string | null;

  @ManyToOne(() => PmProject, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: PmProject | null;

  @Column({ name: 'task_id', type: 'bigint', unsigned: true, nullable: true })
  taskId!: string | null;

  @ManyToOne(() => PmTask, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: PmTask | null;

  @Column({ name: 'start_at', type: 'datetime' })
  startAt!: Date;

  @Column({ name: 'end_at', type: 'datetime' })
  endAt!: Date;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
