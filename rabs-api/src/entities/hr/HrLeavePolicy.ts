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

@Entity({ name: 'hr_leave_policies' })
export class HrLeavePolicy {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({
    name: 'leave_type',
    type: 'enum',
    enum: ['vacation', 'sick', 'personal', 'maternity', 'paternity', 'bereavement', 'unpaid', 'other'],
    default: 'vacation'
  })
  leaveType!:
    | 'vacation'
    | 'sick'
    | 'personal'
    | 'maternity'
    | 'paternity'
    | 'bereavement'
    | 'unpaid'
    | 'other';

  @Column({ name: 'entitlement_days', type: 'decimal', precision: 5, scale: 2, default: 28 })
  entitlementDays!: number;

  @Column({ name: 'carries_over', type: 'tinyint', width: 1, default: 0 })
  carriesOver!: boolean;

  @Column({ name: 'max_carry_days', type: 'decimal', precision: 5, scale: 2, nullable: true })
  maxCarryDays!: number | null;

  @Column({ name: 'is_active', type: 'tinyint', width: 1, default: 1 })
  isActive!: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
