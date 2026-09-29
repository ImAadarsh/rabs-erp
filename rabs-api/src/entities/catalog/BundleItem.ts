import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Bundle } from './Bundle.js';
import { Variant } from './Variant.js';

@Entity({ name: 'bundle_items' })
export class BundleItem {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Bundle)
  @JoinColumn({ name: 'bundle_id' })
  bundle!: Bundle;

  @ManyToOne(() => Variant)
  @JoinColumn({ name: 'variant_id' })
  variant!: Variant;

  @Column({ type: 'int', default: 1 })
  quantity!: number;

  @Column({ type: 'int', default: 0 })
  position!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

