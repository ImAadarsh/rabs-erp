import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn
} from 'typeorm';
import { PmTask } from './PmTask.js';

@Entity({ name: 'pm_task_dependencies' })
export class PmTaskDependency {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'task_id', type: 'bigint', unsigned: true })
  taskId!: string;

  @ManyToOne(() => PmTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'task_id' })
  task!: PmTask;

  @Column({ name: 'depends_on_task_id', type: 'bigint', unsigned: true })
  dependsOnTaskId!: string;

  @ManyToOne(() => PmTask, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'depends_on_task_id' })
  dependsOn!: PmTask;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
