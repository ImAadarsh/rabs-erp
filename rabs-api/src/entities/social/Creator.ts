import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';

@Entity('creators')
export class Creator {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'creator_name', type: 'varchar', length: 255 })
  creatorName!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ name: 'primary_platform', type: 'enum', enum: ['instagram', 'tiktok', 'youtube', 'twitter', 'other'] })
  primaryPlatform!: string;

  @Column({ name: 'primary_handle', type: 'varchar', length: 255, nullable: true })
  primaryHandle?: string;

  @Column({ name: 'follower_count', type: 'int', nullable: true })
  followerCount?: number;

  @Column({ name: 'engagement_rate', type: 'decimal', precision: 7, scale: 4, nullable: true })
  engagementRate?: number;

  @Column({ type: 'varchar', length: 255, nullable: true })
  niche?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location?: string;

  @Column({ name: 'audience_demographics', type: 'json', nullable: true })
  audienceDemographics?: any;

  @Column({ name: 'rate_card', type: 'json', nullable: true })
  rateCard?: any;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @Column({ type: 'enum', enum: ['prospect', 'contacted', 'negotiating', 'active', 'inactive'], default: 'prospect' })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
