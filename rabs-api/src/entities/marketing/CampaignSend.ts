import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Campaign } from './Campaign.js';
import { Segment } from './Segment.js';

@Entity('campaign_sends')
export class CampaignSend {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'campaign_id', type: 'bigint', unsigned: true })
  campaignId!: string;

  @ManyToOne(() => Campaign, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'campaign_id' })
  campaign!: Campaign;

  @Column({ name: 'segment_id', type: 'bigint', unsigned: true, nullable: true })
  segmentId?: string | null;

  @ManyToOne(() => Segment, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'segment_id' })
  segment?: Segment;

  @Column({ name: 'send_name', type: 'varchar', length: 255 })
  sendName!: string;

  @Column({ name: 'send_type', type: 'enum', enum: ['email', 'sms', 'push'] })
  sendType!: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  subject?: string | null;

  @Column({ type: 'text', nullable: true })
  content?: string | null;

  @Column({ name: 'scheduled_at', type: 'datetime', nullable: true })
  scheduledAt?: Date | null;

  @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
  sentAt?: Date | null;

  @Column({ name: 'recipient_count', type: 'int', default: 0 })
  recipientCount!: number;

  @Column({ name: 'delivered_count', type: 'int', default: 0 })
  deliveredCount!: number;

  @Column({ name: 'failed_count', type: 'int', default: 0 })
  failedCount!: number;

  @Column({ name: 'open_count', type: 'int', default: 0 })
  openCount!: number;

  @Column({ name: 'click_count', type: 'int', default: 0 })
  clickCount!: number;

  @Column({ name: 'unsubscribe_count', type: 'int', default: 0 })
  unsubscribeCount!: number;

  @Column({
    type: 'enum',
    enum: ['draft', 'scheduled', 'sending', 'sent', 'failed', 'cancelled'],
    default: 'draft'
  })
  status!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
