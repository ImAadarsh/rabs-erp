import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Warehouse } from './Warehouse.js';
import { User } from '../iam/User.js';
import type { CycleCountLine } from './CycleCountLine.js';

@Entity({ name: 'cycle_counts' })
export class CycleCount {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ name: 'count_number', type: 'varchar', length: 100 })
  countNumber!: string;

  @Column({ name: 'count_date', type: 'date' })
  countDate!: Date;

  @Column({ name: 'count_type', type: 'enum', enum: ['full', 'partial', 'abc_class_a', 'abc_class_b', 'abc_class_c', 'spot_check'] })
  countType!: 'full' | 'partial' | 'abc_class_a' | 'abc_class_b' | 'abc_class_c' | 'spot_check';

  @Column({ type: 'enum', enum: ['planned', 'in_progress', 'completed', 'reconciled', 'cancelled'], default: 'planned' })
  status!: 'planned' | 'in_progress' | 'completed' | 'reconciled' | 'cancelled';

  @Column({ name: 'total_skus', type: 'int', default: 0 })
  totalSkus!: number;

  @Column({ name: 'counted_skus', type: 'int', default: 0 })
  countedSkus!: number;

  @Column({ type: 'int', default: 0 })
  discrepancies!: number;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignedTo!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'completed_by' })
  completedBy!: User | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany('CycleCountLine', 'cycleCount')
  lines!: CycleCountLine[];
}

