import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { Campaign } from '@entities/marketing/Campaign.js';
import { SocialAccount } from './SocialAccount.js';
import { User } from '@entities/iam/User.js';

@Entity('social_posts')
export class SocialPost {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'campaign_id', type: 'bigint', unsigned: true, nullable: true })
  campaignId?: string | null;

  @ManyToOne(() => Campaign, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: Campaign;

  @Column({ name: 'social_account_id', type: 'bigint', unsigned: true })
  socialAccountId!: string;

  @ManyToOne(() => SocialAccount, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'social_account_id' })
  socialAccount!: SocialAccount;

  @Column({ name: 'post_type', type: 'enum', enum: ['text', 'image', 'video', 'carousel', 'story', 'reel', 'live'], default: 'text' })
  postType!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ name: 'media_urls', type: 'json', nullable: true })
  mediaUrls?: any;

  @Column({ type: 'varchar', length: 500, nullable: true })
  hashtags?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  mentions?: string;

  @Column({ name: 'link_url', type: 'varchar', length: 1000, nullable: true })
  linkUrl?: string;

  @Column({ name: 'utm_source', type: 'varchar', length: 255, nullable: true })
  utmSource?: string;

  @Column({ name: 'utm_medium', type: 'varchar', length: 255, nullable: true })
  utmMedium?: string;

  @Column({ name: 'utm_campaign', type: 'varchar', length: 255, nullable: true })
  utmCampaign?: string;

  @Column({ name: 'scheduled_at', type: 'datetime', nullable: true })
  scheduledAt?: Date;

  @Column({ name: 'published_at', type: 'timestamp', nullable: true })
  publishedAt?: Date;

  @Column({ name: 'platform_post_id', type: 'varchar', length: 255, nullable: true })
  platformPostId?: string;

  @Column({ name: 'platform_post_url', type: 'varchar', length: 1000, nullable: true })
  platformPostUrl?: string;

  @Column({ type: 'enum', enum: ['draft', 'scheduled', 'published', 'failed', 'deleted'], default: 'draft' })
  status!: string;

  @Column({ type: 'int', default: 0 })
  reach!: number;

  @Column({ type: 'int', default: 0 })
  impressions!: number;

  @Column({ type: 'int', default: 0 })
  likes!: number;

  @Column({ type: 'int', default: 0 })
  comments!: number;

  @Column({ type: 'int', default: 0 })
  shares!: number;

  @Column({ type: 'int', default: 0 })
  clicks!: number;

  @Column({ name: 'engagement_rate', type: 'decimal', precision: 7, scale: 4, nullable: true })
  engagementRate?: number;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason?: string;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedBy?: User;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
