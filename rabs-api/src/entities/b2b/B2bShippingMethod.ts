import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';

@Entity({ name: 'b2b_shipping_methods' })
export class B2bShippingMethod {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  price!: number;

  @Column({ name: 'eta_label', type: 'varchar', length: 255, nullable: true })
  etaLabel!: string | null;

  @Column({ type: 'varchar', length: 32, default: 'truck' })
  icon!: string;

  @Column({ name: 'min_order_amount', type: 'decimal', precision: 15, scale: 4, nullable: true })
  minOrderAmount!: number | null;

  /** When order net goods reach this amount, shipping price becomes 0. */
  @Column({ name: 'free_over_amount', type: 'decimal', precision: 15, scale: 4, nullable: true })
  freeOverAmount!: number | null;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'sort_order', type: 'int', default: 0 })
  sortOrder!: number;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
