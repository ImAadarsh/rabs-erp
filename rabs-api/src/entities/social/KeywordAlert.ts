import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';

@Entity('keyword_alerts')
export class KeywordAlert {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  keyword!: string;

  @Column({ name: 'alert_name', type: 'varchar', length: 255 })
  alertName!: string;

  @Column({ type: 'json', nullable: true })
  platforms?: any;

  @Column({ name: 'notify_email', type: 'varchar', length: 255, nullable: true })
  notifyEmail?: string;

  @Column({ name: 'notify_slack_webhook', type: 'varchar', length: 500, nullable: true })
  notifySlackWebhook?: string;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
