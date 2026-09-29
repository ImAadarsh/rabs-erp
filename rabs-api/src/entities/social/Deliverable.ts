import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Campaign } from '@entities/marketing/Campaign.js';
import { Creator } from './Creator.js';
import { User } from '@entities/iam/User.js';

@Entity('deliverables')
export class Deliverable {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'campaign_id', type: 'bigint', unsigned: true, nullable: true })
  campaignId?: string | null;

  @ManyToOne(() => Campaign, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: Campaign;

  @Column({ name: 'creator_id', type: 'bigint', unsigned: true })
  creatorId!: string;

  @ManyToOne(() => Creator, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'creator_id' })
  creator!: Creator;

  @Column({ name: 'deliverable_name', type: 'varchar', length: 255 })
  deliverableName!: string;

  @Column({ name: 'deliverable_type', type: 'enum', enum: ['post', 'story', 'reel', 'video', 'blog', 'review', 'other'] })
  deliverableType!: string;

  @Column({ type: 'enum', enum: ['instagram', 'tiktok', 'youtube', 'twitter', 'blog', 'other'] })
  platform!: string;

  @Column({ name: 'required_hashtags', type: 'varchar', length: 500, nullable: true })
  requiredHashtags?: string;

  @Column({ name: 'required_mentions', type: 'varchar', length: 500, nullable: true })
  requiredMentions?: string;

  @Column({ type: 'text', nullable: true })
  brief?: string;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate?: Date;

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt?: Date;

  @Column({ name: 'submitted_url', type: 'varchar', length: 1000, nullable: true })
  submittedUrl?: string;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedBy?: User;

  @Column({ name: 'payment_amount', type: 'decimal', precision: 15, scale: 4, nullable: true })
  paymentAmount?: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'enum', enum: ['assigned', 'in_progress', 'submitted', 'revision_needed', 'approved', 'published', 'cancelled'], default: 'assigned' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
