import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CatalogItem } from './CatalogItem.js';
import { Variant } from './Variant.js';

@Entity({ name: 'product_media' })
export class ProductMedia {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'catalog_item_id' })
  catalogItem!: CatalogItem;

  @ManyToOne(() => Variant, { nullable: true })
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant | null;

  @Column({ type: 'enum', enum: ['image', 'video', 'document', '3d_model'] })
  type!: 'image' | 'video' | 'document' | '3d_model';

  @Column({ type: 'varchar', length: 1000 })
  url!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  filename!: string | null;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType!: string | null;

  @Column({ name: 'size_bytes', type: 'bigint', nullable: true })
  sizeBytes!: number | null;

  @Column({ name: 'alt_text', type: 'varchar', length: 500, nullable: true })
  altText!: string | null;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

