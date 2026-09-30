import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { PriceList } from './PriceList.js';
import { Variant } from './Variant.js';

@Entity({ name: 'price_list_items' })
export class PriceListItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => PriceList)
  @JoinColumn({ name: 'price_list_id' })
  priceList!: PriceList;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  price!: number;

  @Column({ name: 'compare_at_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  compareAtPrice!: number | null;

  @Column({ name: 'cost_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  costPrice!: number | null;

  @Column({ name: 'min_margin_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  minMarginPercent!: number | null;

  @Column({ name: 'min_quantity', type: 'int', default: 1 })
  minQuantity!: number;

  @Column({ name: 'max_quantity', type: 'int', nullable: true })
  maxQuantity!: number | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

