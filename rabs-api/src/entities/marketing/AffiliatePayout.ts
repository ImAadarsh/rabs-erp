import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Affiliate } from './Affiliate.js';
import { User } from '@entities/iam/User.js';

@Entity('affiliate_payouts')
export class AffiliatePayout {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'affiliate_id', type: 'bigint', unsigned: true })
  affiliateId!: string;

  @ManyToOne(() => Affiliate, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'affiliate_id' })
  affiliate!: Affiliate;

  @Column({ name: 'payout_number', type: 'varchar', length: 100, unique: true })
  payoutNumber!: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({ name: 'total_conversions', type: 'int', default: 0 })
  totalConversions!: number;

  @Column({ name: 'total_revenue', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalRevenue!: number;

  @Column({ name: 'total_commission', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  totalCommission!: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  adjustments!: number;

  // MySQL Generated column bypass: Just read-only in TypeORM, marked as select: false or mapped directly.
  // We can just define it over the calculated db column. TypeORM supports generated columns.
  @Column({ name: 'payout_amount', type: 'decimal', precision: 15, scale: 4, insert: false, update: false })
  payoutAmount!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'payment_method', type: 'enum', enum: ['bank_transfer', 'paypal', 'check', 'other'] })
  paymentMethod!: string;

  @Column({ type: 'enum', enum: ['pending', 'approved', 'processing', 'paid', 'failed'], default: 'pending' })
  status!: string;

  @Column({ name: 'approved_by', type: 'bigint', unsigned: true, nullable: true })
  approvedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'approved_by' })
  approvedBy?: User;

  @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
  approvedAt?: Date;

  @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
  paidAt?: Date;

  @Column({ name: 'statement_url', type: 'varchar', length: 1000, nullable: true })
  statementUrl?: string;

  @Column({ type: 'text', nullable: true })
  notes?: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
