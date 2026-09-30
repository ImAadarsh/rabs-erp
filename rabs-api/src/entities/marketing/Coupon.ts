import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { Campaign } from './Campaign.js';

@Entity('coupons')
export class Coupon {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'campaign_id', type: 'bigint', unsigned: true, nullable: true })
  campaignId?: string | null;

  @ManyToOne(() => Campaign, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'campaign_id' })
  campaign?: Campaign;

  @Column({ name: 'coupon_code', type: 'varchar', length: 100 })
  couponCode!: string;

  @Column({ name: 'coupon_name', type: 'varchar', length: 255 })
  couponName!: string;

  @Column({ name: 'discount_type', type: 'enum', enum: ['percentage', 'fixed_amount', 'free_shipping', 'buy_x_get_y'] })
  discountType!: string;

  @Column({ name: 'discount_value', type: 'decimal', precision: 15, scale: 4, nullable: true })
  discountValue?: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'minimum_purchase', type: 'decimal', precision: 15, scale: 4, nullable: true })
  minimumPurchase?: number;

  @Column({ name: 'maximum_discount', type: 'decimal', precision: 15, scale: 4, nullable: true })
  maximumDiscount?: number;

  @Column({ name: 'applies_to', type: 'enum', enum: ['all', 'category', 'product', 'collection'], default: 'all' })
  appliesTo!: string;

  @Column({ name: 'product_ids', type: 'json', nullable: true })
  productIds?: any;

  @Column({ name: 'valid_from', type: 'datetime', nullable: true })
  validFrom?: Date;

  @Column({ name: 'valid_until', type: 'datetime', nullable: true })
  validUntil?: Date;

  @Column({ name: 'usage_limit', type: 'int', nullable: true })
  usageLimit?: number;

  @Column({ name: 'usage_limit_per_customer', type: 'int', default: 1 })
  usageLimitPerCustomer!: number;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
