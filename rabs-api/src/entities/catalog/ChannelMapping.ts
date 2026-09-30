import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CatalogItem } from './CatalogItem.js';
import { Variant } from './Variant.js';

@Entity({ name: 'channel_mappings' })
export class ChannelMapping {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'catalog_item_id' })
  catalogItem!: CatalogItem;

  @ManyToOne(() => Variant, { nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant | null;

  @Column({ type: 'enum', enum: ['amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'wordpress', 'wix', 'b2b_portal', 'pos'] })
  channel!: 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wordpress' | 'wix' | 'b2b_portal' | 'pos';

  @Column({ name: 'channel_product_id', type: 'varchar', length: 255, nullable: true })
  channelProductId!: string | null;

  @Column({ name: 'channel_variant_id', type: 'varchar', length: 255, nullable: true })
  channelVariantId!: string | null;

  @Column({ name: 'channel_url', type: 'varchar', length: 1000, nullable: true })
  channelUrl!: string | null;

  @Column({ type: 'json', nullable: true })
  attributes!: Record<string, any> | null;

  @Column({ name: 'sync_enabled', type: 'boolean', default: true })
  syncEnabled!: boolean;

  @Column({ name: 'last_synced_at', type: 'timestamp', nullable: true })
  lastSyncedAt!: Date | null;

  @Column({ name: 'sync_status', type: 'enum', enum: ['pending', 'synced', 'failed', 'disabled'], default: 'pending' })
  syncStatus!: 'pending' | 'synced' | 'failed' | 'disabled';

  @Column({ name: 'sync_error', type: 'text', nullable: true })
  syncError!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

