import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';

@Entity({ name: 'suppliers' })
export class Supplier {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 255, nullable: true })
  legalName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  website!: string | null;

  @Column({ name: 'tax_id', type: 'varchar', length: 100, nullable: true })
  taxId!: string | null;

  @Column({ name: 'payment_terms', type: 'varchar', length: 100, nullable: true })
  paymentTerms!: string | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'address_line1', type: 'varchar', length: 255, nullable: true })
  addressLine1!: string | null;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ name: 'state_province', type: 'varchar', length: 100, nullable: true })
  stateProvince!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20, nullable: true })
  postalCode!: string | null;

  @Column({ name: 'country_code', type: 'char', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ name: 'lead_time_days', type: 'int', default: 0 })
  leadTimeDays!: number;

  @Column({ name: 'minimum_order_value', type: 'decimal', precision: 15, scale: 4, nullable: true })
  minimumOrderValue!: number | null;

  @Column({ type: 'decimal', precision: 3, scale: 2, nullable: true })
  rating!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'blocked'], default: 'active' })
  status!: 'active' | 'inactive' | 'blocked';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}

