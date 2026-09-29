import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Variant } from './Variant.js';
import { PriceList } from './PriceList.js';

@Entity({ name: 'promotional_prices' })
export class PromotionalPrice {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @ManyToOne(() => PriceList, { nullable: true })
  @JoinColumn({ name: 'price_list_id' })
  priceList!: PriceList | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'discount_type', type: 'enum', enum: ['percentage', 'fixed_amount'] })
  discountType!: 'percentage' | 'fixed_amount';

  @Column({ name: 'discount_value', type: 'decimal', precision: 15, scale: 4 })
  discountValue!: number;

  @Column({ name: 'valid_from', type: 'datetime' })
  validFrom!: Date;

  @Column({ name: 'valid_until', type: 'datetime' })
  validUntil!: Date;

  @Column({ type: 'enum', enum: ['scheduled', 'active', 'expired', 'cancelled'], default: 'scheduled' })
  status!: 'scheduled' | 'active' | 'expired' | 'cancelled';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

