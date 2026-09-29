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
import { Customer } from '../orders/Customer.js';
import { Order } from '../orders/Order.js';

@Entity({ name: 'pm_projects' })
export class PmProject {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 64, nullable: true })
  code!: string | null;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true, nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId!: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order!: Order | null;

  @Column({ type: 'text', nullable: true })
  scope!: string | null;

  @Column({ type: 'text', nullable: true })
  objectives!: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'active', 'on_hold', 'completed', 'cancelled'],
    default: 'draft'
  })
  status!: 'draft' | 'active' | 'on_hold' | 'completed' | 'cancelled';

  @Column({ name: 'start_date', type: 'date', nullable: true })
  startDate!: string | null;

  @Column({ name: 'end_date', type: 'date', nullable: true })
  endDate!: string | null;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  budget!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'owner_user_id', type: 'bigint', unsigned: true, nullable: true })
  ownerUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User | null;

  @Column({ name: 'progress_pct', type: 'decimal', precision: 5, scale: 2, default: 0 })
  progressPct!: number;

  @Column({ name: 'production_ready', type: 'tinyint', width: 1, default: 0 })
  productionReady!: boolean;

  @Column({ name: 'completed_at', type: 'datetime', nullable: true })
  completedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
