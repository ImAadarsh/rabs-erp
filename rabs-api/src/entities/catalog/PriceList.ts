import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import type { PriceListItem } from './PriceListItem.js';

@Entity({ name: 'price_lists' })
export class PriceList {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'enum', enum: ['retail', 'wholesale', 'channel', 'customer_tier', 'region'] })
  type!: 'retail' | 'wholesale' | 'channel' | 'customer_tier' | 'region';

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom!: Date | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil!: Date | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'enum', enum: ['active', 'inactive'], default: 'active' })
  status!: 'active' | 'inactive';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  // Relations
  @OneToMany('PriceListItem', 'priceList')
  items!: PriceListItem[];
}

