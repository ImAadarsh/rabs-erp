import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CatalogItem } from './CatalogItem.js';
import type { BundleItem } from './BundleItem.js';

@Entity({ name: 'bundles' })
export class Bundle {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'catalog_item_id' })
  catalogItem!: CatalogItem;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  discountPercent!: number | null;

  @Column({ name: 'fixed_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  fixedPrice!: number | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'active' })
  status!: 'active' | 'inactive';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany('BundleItem', 'bundle')
  items!: BundleItem[];
}

