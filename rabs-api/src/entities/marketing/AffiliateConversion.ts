import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { AffiliateClick } from './AffiliateClick.js';
import { Affiliate } from './Affiliate.js';
import { Order } from '@entities/orders/Order.js';

@Entity('affiliate_conversions')
export class AffiliateConversion {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'affiliate_click_id', type: 'bigint', unsigned: true, nullable: true })
  affiliateClickId?: string | null;

  @ManyToOne(() => AffiliateClick, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'affiliate_click_id' })
  affiliateClick?: AffiliateClick | null;

  /** Sales channel that produced the conversion (e.g. b2b_portal) */
  @Column({ name: 'channel', type: 'varchar', length: 50, nullable: true })
  channel?: string | null;

  @Column({ name: 'affiliate_id', type: 'bigint', unsigned: true })
  affiliateId!: string;

  @ManyToOne(() => Affiliate, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'affiliate_id' })
  affiliate!: Affiliate;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ name: 'order_value', type: 'decimal', precision: 15, scale: 4 })
  orderValue!: number;

  @Column({ name: 'commission_amount', type: 'decimal', precision: 15, scale: 4 })
  commissionAmount!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'attribution_model', type: 'enum', enum: ['first_click', 'last_click', 'linear', 'time_decay'], default: 'last_click' })
  attributionModel!: string;

  @CreateDateColumn({ name: 'converted_at' })
  convertedAt!: Date;
}
