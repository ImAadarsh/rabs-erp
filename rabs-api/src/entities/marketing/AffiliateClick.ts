import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { AffiliateLink } from './AffiliateLink.js';
import { Affiliate } from './Affiliate.js';

@Entity('affiliate_clicks')
export class AffiliateClick {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'affiliate_link_id', type: 'bigint', unsigned: true })
  affiliateLinkId!: string;

  @ManyToOne(() => AffiliateLink, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'affiliate_link_id' })
  affiliateLink!: AffiliateLink;

  @Column({ name: 'affiliate_id', type: 'bigint', unsigned: true })
  affiliateId!: string;

  @ManyToOne(() => Affiliate, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'affiliate_id' })
  affiliate!: Affiliate;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress?: string;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent?: string;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  referrer?: string;

  @Column({ name: 'landing_page', type: 'varchar', length: 1000, nullable: true })
  landingPage?: string;

  @Column({ name: 'utm_source', type: 'varchar', length: 255, nullable: true })
  utmSource?: string;

  @Column({ name: 'utm_medium', type: 'varchar', length: 255, nullable: true })
  utmMedium?: string;

  @Column({ name: 'utm_campaign', type: 'varchar', length: 255, nullable: true })
  utmCampaign?: string;

  @Column({ name: 'utm_term', type: 'varchar', length: 255, nullable: true })
  utmTerm?: string;

  @Column({ name: 'utm_content', type: 'varchar', length: 255, nullable: true })
  utmContent?: string;

  @Column({ name: 'session_id', type: 'varchar', length: 255, nullable: true })
  sessionId?: string;

  @CreateDateColumn({ name: 'clicked_at' })
  clickedAt!: Date;
}
