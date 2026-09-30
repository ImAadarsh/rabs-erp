import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import type { KpiRecord } from './KpiRecord.js';

@Entity({ name: 'kpi_definitions' })
export class KpiDefinition {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'kpi_code', type: 'varchar', length: 50 })
  kpiCode!: string;

  @Column({ name: 'kpi_name', type: 'varchar', length: 255 })
  kpiName!: string;

  @Column({ name: 'kpi_category', type: 'enum', enum: ['sales', 'operations', 'finance', 'customer_service', 'hr', 'marketing', 'other'] })
  kpiCategory!: 'sales' | 'operations' | 'finance' | 'customer_service' | 'hr' | 'marketing' | 'other';

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'unit_of_measure', type: 'varchar', length: 50, nullable: true })
  unitOfMeasure!: string | null;

  @Column({ name: 'target_value', type: 'decimal', precision: 15, scale: 4, nullable: true })
  targetValue!: number | null;

  @Column({ name: 'calculation_method', type: 'text', nullable: true })
  calculationMethod!: string | null;

  @Column({ name: 'is_higher_better', type: 'boolean', default: true })
  isHigherBetter!: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @OneToMany('KpiRecord', 'kpiDefinition')
  kpiRecords!: KpiRecord[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

