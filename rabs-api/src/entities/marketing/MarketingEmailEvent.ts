import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { MarketingEmailConnector } from './MarketingEmailConnector.js';
import { MarketingEmailCampaign } from './MarketingEmailCampaign.js';
import { MarketingEmailSend } from './MarketingEmailSend.js';

@Entity({ name: 'marketing_email_events' })
export class MarketingEmailEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true, nullable: true })
  organizationId!: string | null;

  @ManyToOne(() => Organization, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization | null;

  @Column({ name: 'connector_id', type: 'bigint', unsigned: true, nullable: true })
  connectorId!: string | null;

  @ManyToOne(() => MarketingEmailConnector, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'connector_id' })
  connector!: MarketingEmailConnector | null;

  @Column({ name: 'campaign_id', type: 'bigint', unsigned: true, nullable: true })
  campaignId!: string | null;

  @ManyToOne(() => MarketingEmailCampaign, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: MarketingEmailCampaign | null;

  @Column({ name: 'send_id', type: 'bigint', unsigned: true, nullable: true })
  sendId!: string | null;

  @ManyToOne(() => MarketingEmailSend, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'send_id' })
  send!: MarketingEmailSend | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: string;

  @Column({ name: 'provider_event_id', type: 'varchar', length: 191, nullable: true })
  providerEventId!: string | null;

  @Column({ name: 'sg_message_id', type: 'varchar', length: 191, nullable: true })
  sgMessageId!: string | null;

  @Column({ type: 'json', nullable: true })
  payload!: Record<string, unknown> | null;

  @Column({ name: 'occurred_at', type: 'timestamp', nullable: true })
  occurredAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
