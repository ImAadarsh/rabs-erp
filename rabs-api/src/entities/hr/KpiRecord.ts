import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { KpiDefinition } from './KpiDefinition.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { Location } from '../iam/Location.js';
import { Employee } from './Employee.js';

@Entity({ name: 'kpi_records' })
export class KpiRecord {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => KpiDefinition)
  @JoinColumn({ name: 'kpi_definition_id' })
  kpiDefinition!: KpiDefinition;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @ManyToOne(() => Location, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location!: Location | null;

  @ManyToOne(() => Employee, { nullable: true })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee | null;

  @Column({ name: 'period_type', type: 'enum', enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'] })
  periodType!: 'daily' | 'weekly' | 'monthly' | 'quarterly' | 'yearly';

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({ name: 'actual_value', type: 'decimal', precision: 15, scale: 4 })
  actualValue!: number;

  @Column({ name: 'target_value', type: 'decimal', precision: 15, scale: 4, nullable: true })
  targetValue!: number | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, nullable: true })
  variance!: number | null;

  @Column({ name: 'variance_percent', type: 'decimal', precision: 7, scale: 4, nullable: true })
  variancePercent!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

