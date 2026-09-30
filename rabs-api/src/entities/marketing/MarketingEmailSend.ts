import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn
} from 'typeorm';
import { MarketingEmailCampaign } from './MarketingEmailCampaign.js';
import { CrmLead } from '../crm/CrmLead.js';
import { Customer } from '../orders/Customer.js';

export type MarketingEmailSendStatus = 'queued' | 'sent' | 'failed';

@Entity({ name: 'marketing_email_sends' })
export class MarketingEmailSend {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'campaign_id', type: 'bigint', unsigned: true })
  campaignId!: string;

  @ManyToOne(() => MarketingEmailCampaign, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: MarketingEmailCampaign;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'lead_id', type: 'bigint', unsigned: true, nullable: true })
  leadId!: string | null;

  @ManyToOne(() => CrmLead, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_id' })
  lead!: CrmLead | null;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true, nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;

  @Column({
    type: 'enum',
    enum: ['queued', 'sent', 'failed'],
    default: 'queued'
  })
  status!: MarketingEmailSendStatus;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  error!: string | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
