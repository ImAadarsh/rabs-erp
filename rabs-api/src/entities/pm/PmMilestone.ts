import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { PmProject } from './PmProject.js';

@Entity({ name: 'pm_milestones' })
export class PmMilestone {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'project_id', type: 'bigint', unsigned: true })
  projectId!: string;

  @ManyToOne(() => PmProject, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: PmProject;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: string | null;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'achieved', 'missed', 'cancelled'],
    default: 'pending'
  })
  status!: 'pending' | 'achieved' | 'missed' | 'cancelled';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
