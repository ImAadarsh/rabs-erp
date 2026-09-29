import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';
import { User } from '@entities/iam/User.js';

@Entity('social_accounts')
export class SocialAccount {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'business_unit_id', type: 'bigint', unsigned: true, nullable: true })
  businessUnitId?: string | null;

  @ManyToOne(() => BusinessUnit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit?: BusinessUnit;

  @Column({ type: 'enum', enum: ['facebook', 'instagram', 'tiktok', 'twitter', 'linkedin', 'youtube', 'whatsapp', 'other'] })
  platform!: string;

  @Column({ name: 'account_name', type: 'varchar', length: 255 })
  accountName!: string;

  @Column({ name: 'account_handle', type: 'varchar', length: 255, nullable: true })
  accountHandle?: string;

  @Column({ name: 'account_id', type: 'varchar', length: 255, nullable: true })
  accountId?: string;

  @Column({ name: 'profile_url', type: 'varchar', length: 500, nullable: true })
  profileUrl?: string;

  @Column({ name: 'access_token', type: 'text', nullable: true })
  accessToken?: string;

  @Column({ name: 'refresh_token', type: 'text', nullable: true })
  refreshToken?: string;

  @Column({ name: 'token_expires_at', type: 'timestamp', nullable: true })
  tokenExpiresAt?: Date;

  /** Meta extras: pageId, igUserId, adAccountId, tokenType, etc. */
  @Column({ type: 'json', nullable: true })
  metadata?: Record<string, unknown> | null;

  @Column({ name: 'follower_count', type: 'int', default: 0 })
  followerCount!: number;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt?: Date;

  @Column({ name: 'connected_by', type: 'bigint', unsigned: true, nullable: true })
  connectedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connected_by' })
  connectedBy?: User;

  @Column({ name: 'connected_at', type: 'timestamp', default: () => 'CURRENT_TIMESTAMP' })
  connectedAt!: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
