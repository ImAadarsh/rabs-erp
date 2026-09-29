import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { SocialPost } from './SocialPost.js';
import { SocialAccount } from './SocialAccount.js';
import { User } from '@entities/iam/User.js';

@Entity('social_comments')
export class SocialComment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'social_post_id', type: 'bigint', unsigned: true, nullable: true })
  socialPostId?: string | null;

  @ManyToOne(() => SocialPost, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'social_post_id' })
  socialPost?: SocialPost;

  @Column({ name: 'social_account_id', type: 'bigint', unsigned: true })
  socialAccountId!: string;

  @ManyToOne(() => SocialAccount, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'social_account_id' })
  socialAccount!: SocialAccount;

  @Column({ name: 'platform_comment_id', type: 'varchar', length: 255, nullable: true })
  platformCommentId?: string;

  @Column({ name: 'parent_comment_id', type: 'bigint', unsigned: true, nullable: true })
  parentCommentId?: string | null;

  @ManyToOne(() => SocialComment, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'parent_comment_id' })
  parentComment?: SocialComment;

  @Column({ name: 'commenter_name', type: 'varchar', length: 255, nullable: true })
  commenterName?: string;

  @Column({ name: 'commenter_handle', type: 'varchar', length: 255, nullable: true })
  commenterHandle?: string;

  @Column({ name: 'commenter_id', type: 'varchar', length: 255, nullable: true })
  commenterId?: string;

  @Column({ name: 'comment_text', type: 'text' })
  commentText!: string;

  @Column({ type: 'enum', enum: ['positive', 'neutral', 'negative', 'unknown'], default: 'unknown' })
  sentiment!: string;

  @Column({ name: 'is_reply', type: 'boolean', default: false })
  isReply!: boolean;

  @Column({ name: 'is_hidden', type: 'boolean', default: false })
  isHidden!: boolean;

  @Column({ name: 'replied_at', type: 'timestamp', nullable: true })
  repliedAt?: Date;

  @Column({ name: 'replied_by', type: 'bigint', unsigned: true, nullable: true })
  repliedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replied_by' })
  repliedBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
