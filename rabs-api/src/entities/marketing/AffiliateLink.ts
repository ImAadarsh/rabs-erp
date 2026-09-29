import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Affiliate } from './Affiliate.js';

@Entity('affiliate_links')
export class AffiliateLink {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'affiliate_id', type: 'bigint', unsigned: true })
  affiliateId!: string;

  @ManyToOne(() => Affiliate, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'affiliate_id' })
  affiliate!: Affiliate;

  @Column({ name: 'link_name', type: 'varchar', length: 255, nullable: true })
  linkName?: string;

  @Column({ name: 'original_url', type: 'varchar', length: 1000 })
  originalUrl!: string;

  @Column({ name: 'tracking_code', type: 'varchar', length: 100, unique: true })
  trackingCode!: string;

  @Column({ name: 'short_url', type: 'varchar', length: 500, nullable: true })
  shortUrl?: string;

  @Column({ name: 'click_count', type: 'int', default: 0 })
  clickCount!: number;

  @Column({ name: 'conversion_count', type: 'int', default: 0 })
  conversionCount!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
