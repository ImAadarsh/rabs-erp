import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity('data_exports')
export class DataExport {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'export_name', type: 'varchar', length: 255 })
  exportName!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100 })
  entityType!: string;

  @Column({ name: 'export_format', type: 'enum', enum: ['csv', 'excel', 'json', 'xml'] })
  exportFormat!: 'csv' | 'excel' | 'json' | 'xml';

  @Column({ type: 'json', nullable: true })
  filters?: any;

  @Column({ type: 'json', nullable: true })
  columns?: any;

  @Column({ type: 'enum', enum: ['queued', 'processing', 'completed', 'failed'], default: 'queued' })
  status!: 'queued' | 'processing' | 'completed' | 'failed';

  @Column({ name: 'started_at', type: 'timestamp', nullable: true })
  startedAt?: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt?: Date;

  @Column({ name: 'file_url', type: 'varchar', length: 1000, nullable: true })
  fileUrl?: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number;

  @Column({ name: 'row_count', type: 'int', nullable: true })
  rowCount?: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage?: string;

  @Column({ name: 'expires_at', type: 'timestamp', nullable: true })
  expiresAt?: Date;

  @Column({ name: 'requested_by', type: 'bigint' })
  requestedById!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'requested_by' })
  requestedBy!: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
