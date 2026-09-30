import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Location } from '../iam/Location.js';

@Entity({ name: 'warehouses' })
export class Warehouse {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Location)
  @JoinColumn({ name: 'location_id' })
  location!: Location;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: ['main_hub', 'distribution_center', 'store', 'third_party', 'other'] })
  type!: 'main_hub' | 'distribution_center' | 'store' | 'third_party' | 'other';

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

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @Column({ name: 'capacity_cubic_meters', type: 'decimal', precision: 15, scale: 2, nullable: true })
  capacityCubicMeters!: number | null;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'maintenance'], default: 'active' })
  status!: 'active' | 'inactive' | 'maintenance';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}

