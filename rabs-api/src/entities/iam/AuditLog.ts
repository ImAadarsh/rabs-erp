import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from './Organization.js';
import { User } from './User.js';
import { ApiKey } from './ApiKey.js';

@Entity({ name: 'audit_logs' })
export class AuditLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'user_id' })
  user!: User | null;

  @ManyToOne(() => ApiKey, { nullable: true })
  @JoinColumn({ name: 'api_key_id' })
  apiKey!: ApiKey | null;

  @Column({ type: 'varchar', length: 100 })
  action!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 100, nullable: true })
  entityType!: string | null;

  @Column({ name: 'entity_id', type: 'bigint', unsigned: true, nullable: true })
  entityId!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'request_id', type: 'varchar', length: 100, nullable: true })
  requestId!: string | null;

  @Column({ type: 'json', nullable: true })
  changes!: any | null;

  @Column({ type: 'json', nullable: true })
  metadata!: any | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}


