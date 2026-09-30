import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { CatalogItem } from './CatalogItem.js';
import type { Barcode } from './Barcode.js';
import type { ProductMedia } from './ProductMedia.js';
import type { BundleItem } from './BundleItem.js';
import type { PriceListItem } from './PriceListItem.js';
import type { PromotionalPrice } from './PromotionalPrice.js';
import type { ChannelMapping } from './ChannelMapping.js';

@Entity({ name: 'variants' })
export class Variant {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'catalog_item_id' })
  catalogItem!: CatalogItem;

  @Column({ name: 'variant_sku', type: 'varchar', length: 100, unique: true })
  variantSku!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ name: 'option1_name', type: 'varchar', length: 100, nullable: true })
  option1Name!: string | null;

  @Column({ name: 'option1_value', type: 'varchar', length: 100, nullable: true })
  option1Value!: string | null;

  @Column({ name: 'option2_name', type: 'varchar', length: 100, nullable: true })
  option2Name!: string | null;

  @Column({ name: 'option2_value', type: 'varchar', length: 100, nullable: true })
  option2Value!: string | null;

  @Column({ name: 'option3_name', type: 'varchar', length: 100, nullable: true })
  option3Name!: string | null;

  @Column({ name: 'option3_value', type: 'varchar', length: 100, nullable: true })
  option3Value!: string | null;

  @Column({ name: 'weight_value', type: 'decimal', precision: 10, scale: 4, nullable: true })
  weightValue!: number | null;

  @Column({ name: 'weight_unit', type: 'enum', enum: ['g', 'kg', 'lb', 'oz'], default: 'kg' })
  weightUnit!: 'g' | 'kg' | 'lb' | 'oz';

  @Column({ name: 'length_value', type: 'decimal', precision: 10, scale: 2, nullable: true })
  lengthValue!: number | null;

  @Column({ name: 'width_value', type: 'decimal', precision: 10, scale: 2, nullable: true })
  widthValue!: number | null;

  @Column({ name: 'height_value', type: 'decimal', precision: 10, scale: 2, nullable: true })
  heightValue!: number | null;

  @Column({ name: 'dimension_unit', type: 'enum', enum: ['cm', 'm', 'in', 'ft'], default: 'cm' })
  dimensionUnit!: 'cm' | 'm' | 'in' | 'ft';

  @Column({ name: 'cost_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  costPrice!: number | null;

  @Column({ name: 'cost_currency', type: 'char', length: 3, default: 'GBP' })
  costCurrency!: string;

  @Column({ name: 'image_url', type: 'varchar', length: 500, nullable: true })
  imageUrl!: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'discontinued'], default: 'active' })
  status!: 'active' | 'inactive' | 'discontinued';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  // Relations
  @OneToMany('Barcode', 'variant')
  barcodes!: Barcode[];

  @OneToMany('ProductMedia', 'variant')
  media!: ProductMedia[];

  @OneToMany('BundleItem', 'variant')
  bundleItems!: BundleItem[];

  @OneToMany('PriceListItem', 'variant')
  priceListItems!: PriceListItem[];

  @OneToMany('PromotionalPrice', 'variant')
  promotionalPrices!: PromotionalPrice[];

  @OneToMany('ChannelMapping', 'variant')
  channelMappings!: ChannelMapping[];
}

