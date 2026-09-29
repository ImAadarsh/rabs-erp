import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';

@Entity('affiliates')
export class Affiliate {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'affiliate_code', type: 'varchar', length: 50 })
  affiliateCode!: string;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName?: string;

  @Column({ name: 'contact_name', type: 'varchar', length: 255 })
  contactName!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website?: string;

  @Column({ name: 'commission_type', type: 'enum', enum: ['percentage', 'fixed_per_sale', 'tiered'], default: 'percentage' })
  commissionType!: string;

  @Column({ name: 'commission_value', type: 'decimal', precision: 15, scale: 4 })
  commissionValue!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'payment_terms', type: 'varchar', length: 255, nullable: true })
  paymentTerms?: string;

  @Column({ name: 'payment_method', type: 'enum', enum: ['bank_transfer', 'paypal', 'check', 'other'], default: 'bank_transfer' })
  paymentMethod!: string;

  @Column({ name: 'payment_details', type: 'text', nullable: true })
  paymentDetails?: string;

  @Column({ name: 'payout_frequency', type: 'enum', enum: ['weekly', 'biweekly', 'monthly', 'quarterly'], default: 'monthly' })
  payoutFrequency!: string;

  @Column({ name: 'minimum_payout', type: 'decimal', precision: 15, scale: 4, default: 50.00 })
  minimumPayout!: number;

  @Column({ name: 'total_clicks', type: 'int', default: 0 })
  totalClicks!: number;

  @Column({ name: 'total_conversions', type: 'int', default: 0 })
  totalConversions!: number;

  @Column({ name: 'total_revenue', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalRevenue!: number;

  @Column({ name: 'total_commission', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalCommission!: number;

  @Column({ name: 'total_paid', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalPaid!: number;

  @Column({ type: 'enum', enum: ['pending', 'active', 'suspended', 'terminated'], default: 'pending' })
  status!: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
