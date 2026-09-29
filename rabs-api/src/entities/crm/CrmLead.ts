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
import { Customer } from '../orders/Customer.js';
import { Affiliate } from '../marketing/Affiliate.js';

@Entity({ name: 'crm_leads' })
export class CrmLead {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  source!: string | null;

  /** External system id (Salesforce Id, HubSpot vid, etc.) for idempotent upserts */
  @Column({ name: 'external_id', type: 'varchar', length: 191, nullable: true })
  externalId!: string | null;

  @Column({
    type: 'enum',
    enum: ['new', 'contacted', 'qualified', 'unqualified', 'converted', 'lost'],
    default: 'new'
  })
  status!: 'new' | 'contacted' | 'qualified' | 'unqualified' | 'converted' | 'lost';

  @Column({ name: 'owner_user_id', type: 'bigint', unsigned: true, nullable: true })
  ownerUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User | null;

  @Column({ name: 'affiliate_id', type: 'bigint', unsigned: true, nullable: true })
  affiliateId!: string | null;

  @ManyToOne(() => Affiliate, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'affiliate_id' })
  affiliate!: Affiliate | null;

  @Column({ name: 'converted_customer_id', type: 'bigint', unsigned: true, nullable: true })
  convertedCustomerId!: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'converted_customer_id' })
  convertedCustomer!: Customer | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  /** Lead score 0–100 for qualification / prioritization */
  @Column({ type: 'int', nullable: true })
  score!: number | null;

  @Column({
    type: 'enum',
    enum: ['low', 'medium', 'high', 'urgent'],
    default: 'medium'
  })
  priority!: 'low' | 'medium' | 'high' | 'urgent';

  @Column({ name: 'qualified_at', type: 'timestamp', nullable: true })
  qualifiedAt!: Date | null;

  @Column({ name: 'disqualified_reason', type: 'varchar', length: 500, nullable: true })
  disqualifiedReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
