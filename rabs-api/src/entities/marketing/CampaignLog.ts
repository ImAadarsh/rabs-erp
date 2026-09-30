import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { CampaignSend } from './CampaignSend.js';
import { Customer } from '@entities/orders/Customer.js';

@Entity('campaign_logs')
export class CampaignLog {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'campaign_send_id', type: 'bigint', unsigned: true })
  campaignSendId!: string;

  @ManyToOne(() => CampaignSend, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_send_id' })
  campaignSend!: CampaignSend;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @ManyToOne(() => Customer, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email?: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'enum', enum: ['sent', 'delivered', 'bounced', 'failed', 'opened', 'clicked', 'unsubscribed'] })
  status!: string;

  @Column({ type: 'json', nullable: true })
  eventData?: any;

  @CreateDateColumn({ name: 'event_timestamp' })
  eventTimestamp!: Date;
}
