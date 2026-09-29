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
import { PmProject } from './PmProject.js';

@Entity({ name: 'pm_work_stages' })
export class PmWorkStage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  /** Null = org-level template stage; set = project-specific stage. */
  @Column({ name: 'project_id', type: 'bigint', unsigned: true, nullable: true })
  projectId!: string | null;

  @ManyToOne(() => PmProject, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'project_id' })
  project!: PmProject | null;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
