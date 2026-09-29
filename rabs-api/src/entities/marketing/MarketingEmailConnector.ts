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

export type MarketingEmailProviderKind =
  | 'sendgrid'
  | 'gmail_smtp'
  | 'brevo'
  | 'ses'
  | 'mailchimp';

export type MarketingEmailConnectorStatus = 'active' | 'inactive' | 'error';

@Entity({ name: 'marketing_email_connectors' })
export class MarketingEmailConnector {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({
    type: 'enum',
    enum: ['sendgrid', 'gmail_smtp', 'brevo', 'ses', 'mailchimp']
  })
  provider!: MarketingEmailProviderKind;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  /** AES-GCM encrypted JSON — never serialize raw value to clients. */
  @Column({ name: 'credentials_encrypted', type: 'text' })
  credentialsEncrypted!: string;

  @Column({ name: 'key_hint', type: 'varchar', length: 64, nullable: true })
  keyHint!: string | null;

  @Column({
    type: 'enum',
    enum: ['active', 'inactive', 'error'],
    default: 'active'
  })
  status!: MarketingEmailConnectorStatus;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'last_tested_at', type: 'timestamp', nullable: true })
  lastTestedAt!: Date | null;

  @Column({ name: 'last_test_ok', type: 'boolean', nullable: true })
  lastTestOk!: boolean | null;

  @Column({ name: 'last_test_message', type: 'varchar', length: 500, nullable: true })
  lastTestMessage!: string | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
