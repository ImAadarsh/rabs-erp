import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { SocialAccount } from './SocialAccount.js';
import { User } from '@entities/iam/User.js';
// Note: assuming Ticket entity exists in CRM, but we'll loosely couple it with just the ID for now if needed, 
// or import if we can find it. For now, CRM ticket may not exist if CRM wasn't built yet, or we'll assume it exists.
// I'll leave ticket as just a column to avoid circular cross-module entity dependency until necessary.

@Entity('social_messages')
export class SocialMessage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'social_account_id', type: 'bigint', unsigned: true })
  socialAccountId!: string;

  @ManyToOne(() => SocialAccount, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'social_account_id' })
  socialAccount!: SocialAccount;

  @Column({ name: 'platform_conversation_id', type: 'varchar', length: 255 })
  platformConversationId!: string;

  @Column({ name: 'sender_name', type: 'varchar', length: 255, nullable: true })
  senderName?: string;

  @Column({ name: 'sender_handle', type: 'varchar', length: 255, nullable: true })
  senderHandle?: string;

  @Column({ name: 'sender_id', type: 'varchar', length: 255, nullable: true })
  senderId?: string;

  @Column({ name: 'message_text', type: 'text' })
  messageText!: string;

  @Column({ type: 'enum', enum: ['inbound', 'outbound'] })
  direction!: string;

  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @Column({ name: 'read_at', type: 'timestamp', nullable: true })
  readAt?: Date;

  @Column({ name: 'replied_by', type: 'bigint', unsigned: true, nullable: true })
  repliedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'replied_by' })
  repliedBy?: User;

  @Column({ name: 'ticket_id', type: 'bigint', unsigned: true, nullable: true })
  ticketId?: string | null;

  @Column({ type: 'json', nullable: true })
  tags?: string[] | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  folder?: string | null;

  @Column({ name: 'platform_message_id', type: 'varchar', length: 255, nullable: true })
  platformMessageId?: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
