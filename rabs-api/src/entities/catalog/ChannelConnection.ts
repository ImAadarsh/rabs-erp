import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';

@Entity({ name: 'channel_connections' })
export class ChannelConnection {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: ['shopify', 'woocommerce', 'wordpress', 'goodtill'], default: 'woocommerce' })
  channel!: 'shopify' | 'woocommerce' | 'wordpress' | 'goodtill';

  @Column({ name: 'store_url', type: 'varchar', length: 500, nullable: true })
  storeUrl!: string | null;

  @Column({ name: 'shop_domain', type: 'varchar', length: 255, nullable: true })
  shopDomain!: string | null;

  @Column({ name: 'credentials_encrypted', type: 'text' })
  credentialsEncrypted!: string;

  @Column({ name: 'key_hint', type: 'varchar', length: 32, nullable: true })
  keyHint!: string | null;

  @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'active' })
  status!: 'active' | 'inactive';

  @Column({ name: 'last_tested_at', type: 'timestamp', nullable: true })
  lastTestedAt!: Date | null;

  @Column({ name: 'last_test_ok', type: 'boolean', nullable: true })
  lastTestOk!: boolean | null;

  @Column({ name: 'last_test_message', type: 'varchar', length: 500, nullable: true })
  lastTestMessage!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
