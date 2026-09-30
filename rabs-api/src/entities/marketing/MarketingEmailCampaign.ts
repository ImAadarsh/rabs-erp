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
import { Segment } from './Segment.js';
import { MarketingEmailConnector } from './MarketingEmailConnector.js';

export type MarketingEmailCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';
export type MarketingEmailCampaignSource = 'crm_leads' | 'segment' | 'manual';

@Entity({ name: 'marketing_email_campaigns' })
export class MarketingEmailCampaign {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'connector_id', type: 'bigint', unsigned: true, nullable: true })
  connectorId!: string | null;

  @ManyToOne(() => MarketingEmailConnector, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connector_id' })
  connector!: MarketingEmailConnector | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ name: 'from_name', type: 'varchar', length: 255, nullable: true })
  fromName!: string | null;

  @Column({ name: 'reply_to', type: 'varchar', length: 255, nullable: true })
  replyTo!: string | null;

  @Column({ name: 'html_body', type: 'mediumtext' })
  htmlBody!: string;

  /** Visual / drag-drop builder state (JSON string). */
  @Column({ name: 'builder_json', type: 'longtext', nullable: true })
  builderJson!: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed'],
    default: 'draft'
  })
  status!: MarketingEmailCampaignStatus;

  @Column({ name: 'segment_id', type: 'bigint', unsigned: true, nullable: true })
  segmentId!: string | null;

  @ManyToOne(() => Segment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'segment_id' })
  segment!: Segment | null;

  @Column({
    type: 'enum',
    enum: ['crm_leads', 'segment', 'manual'],
    default: 'crm_leads'
  })
  source!: MarketingEmailCampaignSource;

  /** Preferred audience selector; falls back to `source` when null. */
  @Column({
    name: 'audience_type',
    type: 'enum',
    enum: ['crm_leads', 'segment', 'manual'],
    nullable: true
  })
  audienceType!: MarketingEmailCampaignSource | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @Column({ name: 'scheduled_at', type: 'timestamp', nullable: true })
  scheduledAt!: Date | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
