import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Variant } from './Variant.js';

@Entity({ name: 'barcodes' })
export class Barcode {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ type: 'varchar', length: 100, unique: true })
  barcode!: string;

  @Column({ type: 'enum', enum: ['EAN', 'UPC', 'ISBN', 'CODE128', 'QR', 'INTERNAL'], default: 'EAN' })
  type!: 'EAN' | 'UPC' | 'ISBN' | 'CODE128' | 'QR' | 'INTERNAL';

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

