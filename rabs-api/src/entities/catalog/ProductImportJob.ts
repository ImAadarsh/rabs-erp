import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
@Entity({ name: 'product_import_jobs' })
export class ProductImportJob {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @Column({ name: 'source_type', type: 'varchar', length: 50 })
  sourceType!: string;

  @Column({ type: 'varchar', length: 50 })
  channel!: string;

  @Column({ name: 'file_name', type: 'varchar', length: 255, nullable: true })
  fileName!: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'preview', 'processing', 'completed', 'failed'],
    default: 'pending'
  })
  status!: 'pending' | 'preview' | 'processing' | 'completed' | 'failed';

  @Column({ type: 'json', nullable: true })
  options!: Record<string, unknown> | null;

  @Column({ type: 'json', nullable: true })
  summary!: Record<string, unknown> | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
