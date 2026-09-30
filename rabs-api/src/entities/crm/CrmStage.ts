import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { CrmPipeline } from './CrmPipeline.js';

@Entity({ name: 'crm_stages' })
export class CrmStage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'pipeline_id', type: 'bigint', unsigned: true })
  pipelineId!: string;

  @ManyToOne(() => CrmPipeline, (pipeline) => pipeline.stages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'pipeline_id' })
  pipeline!: CrmPipeline;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'decimal', precision: 5, scale: 2, default: 0 })
  probability!: number;

  @Column({ name: 'is_won', type: 'boolean', default: false })
  isWon!: boolean;

  @Column({ name: 'is_lost', type: 'boolean', default: false })
  isLost!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
