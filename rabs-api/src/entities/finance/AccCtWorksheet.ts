import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity({ name: 'acc_ct_worksheets' })
export class AccCtWorksheet {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({ name: 'accounting_profit', type: 'decimal', precision: 15, scale: 4, default: 0 })
  accountingProfit!: number;

  @Column({ name: 'add_backs', type: 'decimal', precision: 15, scale: 4, default: 0 })
  addBacks!: number;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  deductions!: number;

  @Column({ name: 'capital_allowances', type: 'decimal', precision: 15, scale: 4, default: 0 })
  capitalAllowances!: number;

  @Column({ name: 'taxable_profit', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxableProfit!: number;

  @Column({ name: 'ct_rate', type: 'decimal', precision: 7, scale: 4, default: 0.25 })
  ctRate!: number;

  @Column({ name: 'estimated_ct', type: 'decimal', precision: 15, scale: 4, default: 0 })
  estimatedCt!: number;

  @Column({ name: 'adjustments_json', type: 'json', nullable: true })
  adjustmentsJson!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'enum', enum: ['draft', 'finalised'], default: 'draft' })
  status!: 'draft' | 'finalised';

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdBy!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
