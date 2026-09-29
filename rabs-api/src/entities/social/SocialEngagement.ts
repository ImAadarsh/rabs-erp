import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { SocialPost } from './SocialPost.js';

@Entity('social_engagements')
export class SocialEngagement {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'social_post_id', type: 'bigint', unsigned: true })
  socialPostId!: string;

  @ManyToOne(() => SocialPost, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'social_post_id' })
  socialPost!: SocialPost;

  @Column({ name: 'engagement_type', type: 'enum', enum: ['like', 'comment', 'share', 'save', 'click', 'view', 'impression'] })
  engagementType!: string;

  @Column({ name: 'engagement_count', type: 'int', default: 0 })
  engagementCount!: number;

  @CreateDateColumn({ name: 'recorded_at' })
  recordedAt!: Date;
}
