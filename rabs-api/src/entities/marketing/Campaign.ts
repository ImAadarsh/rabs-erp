import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { BusinessUnit } from '@entities/iam/BusinessUnit.js';

@Entity('campaigns')
export class Campaign {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'business_unit_id', type: 'bigint', unsigned: true, nullable: true })
  businessUnitId?: string | null;

  @ManyToOne(() => BusinessUnit, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit?: BusinessUnit;

  @Column({ name: 'campaign_name', type: 'varchar', length: 255 })
  campaignName!: string;

  @Column({ name: 'campaign_code', type: 'varchar', length: 50 })
  campaignCode!: string;

  @Column({
    name: 'campaign_type',
    type: 'enum',
    enum: ['email', 'sms', 'social', 'affiliate', 'paid_ads', 'other']
  })
  campaignType!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'start_date', type: 'datetime', nullable: true })
  startDate?: Date | null;

  @Column({ name: 'end_date', type: 'datetime', nullable: true })
  endDate?: Date | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  budget?: number | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'target_audience', type: 'varchar', length: 500, nullable: true })
  targetAudience?: string | null;

  @Column({ type: 'text', nullable: true })
  goals?: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'scheduled', 'active', 'paused', 'completed', 'cancelled'],
    default: 'draft'
  })
  status!: string;

  @Column({ name: 'total_sent', type: 'int', default: 0 })
  totalSent!: number;

  @Column({ name: 'total_delivered', type: 'int', default: 0 })
  totalDelivered!: number;

  @Column({ name: 'total_opens', type: 'int', default: 0 })
  totalOpens!: number;

  @Column({ name: 'total_clicks', type: 'int', default: 0 })
  totalClicks!: number;

  @Column({ name: 'total_conversions', type: 'int', default: 0 })
  totalConversions!: number;

  @Column({ name: 'total_revenue', type: 'decimal', precision: 15, scale: 4, default: 0 })
  totalRevenue!: number;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** UI/API aliases */
  get name(): string {
    return this.campaignName;
  }

  get type(): string {
    return this.campaignType;
  }
}
