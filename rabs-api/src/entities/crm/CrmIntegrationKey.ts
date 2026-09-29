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

export type CrmIntegrationSource = 'salesforce' | 'hubspot' | 'zapier' | 'generic';

@Entity({ name: 'crm_integration_keys' })
export class CrmIntegrationKey {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({ name: 'key_hash', type: 'varchar', length: 64, unique: true })
  keyHash!: string;

  @Column({ name: 'key_prefix', type: 'varchar', length: 32, nullable: true })
  keyPrefix!: string | null;

  @Column({
    type: 'enum',
    enum: ['salesforce', 'hubspot', 'zapier', 'generic'],
    default: 'generic'
  })
  source!: CrmIntegrationSource;

  @Column({ type: 'boolean', default: true })
  active!: boolean;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @Column({ name: 'last_used_at', type: 'timestamp', nullable: true })
  lastUsedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
