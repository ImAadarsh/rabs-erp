import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Warehouse } from './Warehouse.js';

@Entity({ name: 'bins' })
export class Bin {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ type: 'varchar', length: 100 })
  code!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  name!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  zone!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  aisle!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  rack!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  shelf!: string | null;

  @Column({ name: 'bin_type', type: 'enum', enum: ['standard', 'bulk', 'cold_storage', 'hazmat', 'quarantine', 'staging', 'returns'], default: 'standard' })
  binType!: 'standard' | 'bulk' | 'cold_storage' | 'hazmat' | 'quarantine' | 'staging' | 'returns';

  @Column({ name: 'capacity_cubic_meters', type: 'decimal', precision: 10, scale: 4, nullable: true })
  capacityCubicMeters!: number | null;

  @Column({ name: 'max_weight_kg', type: 'decimal', precision: 10, scale: 2, nullable: true })
  maxWeightKg!: number | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  barcode!: string | null;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'full', 'maintenance'], default: 'active' })
  status!: 'active' | 'inactive' | 'full' | 'maintenance';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

