import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { TaxCode } from './TaxCode.js';
import { User } from '../iam/User.js';
import type { Variant } from './Variant.js';
import type { ProductMedia } from './ProductMedia.js';
import type { Bundle } from './Bundle.js';
import type { ChannelMapping } from './ChannelMapping.js';
import type { ComplianceDocument } from './ComplianceDocument.js';

@Entity({ name: 'catalog_items' })
export class CatalogItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @Column({ type: 'varchar', length: 100 })
  sku!: string;

  @Column({ type: 'varchar', length: 500 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'long_description', type: 'longtext', nullable: true })
  longDescription!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  category!: string | null;

  @Column({ name: 'sub_category', type: 'varchar', length: 255, nullable: true })
  subCategory!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  brand!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  manufacturer!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  uom!: string | null;

  @Column({ name: 'pack_size', type: 'varchar', length: 100, nullable: true })
  packSize!: string | null;

  @Column({ name: 'cost_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  costPrice!: number | null;

  @Column({ name: 'selling_price', type: 'decimal', precision: 15, scale: 4, nullable: true })
  sellingPrice!: number | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'supplier_sku', type: 'varchar', length: 100, nullable: true })
  supplierSku!: string | null;

  @Column({ name: 'lead_time_days', type: 'int', nullable: true })
  leadTimeDays!: number | null;

  @Column({ type: 'text', nullable: true })
  remarks!: string | null;

  @Column({ name: 'hs_code', type: 'varchar', length: 20, nullable: true })
  hsCode!: string | null;

  @Column({ name: 'country_of_origin', type: 'char', length: 2, nullable: true })
  countryOfOrigin!: string | null;

  @ManyToOne(() => TaxCode, { nullable: true })
  @JoinColumn({ name: 'tax_code_id' })
  taxCode!: TaxCode | null;

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

  @Column({ type: 'json', nullable: true })
  attributes!: Record<string, any> | null;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'discontinued'], default: 'active' })
  status!: 'active' | 'inactive' | 'discontinued';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  // Relations
  @OneToMany('Variant', 'catalogItem')
  variants!: Variant[];

  @OneToMany('ProductMedia', 'catalogItem')
  media!: ProductMedia[];

  @OneToMany('Bundle', 'catalogItem')
  bundles!: Bundle[];

  @OneToMany('ChannelMapping', 'catalogItem')
  channelMappings!: ChannelMapping[];

  @OneToMany('ComplianceDocument', 'catalogItem')
  complianceDocuments!: ComplianceDocument[];
}

