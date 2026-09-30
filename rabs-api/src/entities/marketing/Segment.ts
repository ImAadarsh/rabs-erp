import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';

@Entity('segments')
export class Segment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'segment_name', type: 'varchar', length: 255 })
  segmentName!: string;

  @Column({ name: 'segment_code', type: 'varchar', length: 50 })
  segmentCode!: string;

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'segment_type', type: 'enum', enum: ['static', 'dynamic'], default: 'dynamic' })
  segmentType!: string;

  @Column({ name: 'filter_rules', type: 'json', nullable: true })
  filterRules?: any;

  @Column({ name: 'customer_count', type: 'int', default: 0 })
  customerCount!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @Column({ name: 'last_calculated_at', type: 'timestamp', nullable: true })
  lastCalculatedAt?: Date | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  /** UI/API alias */
  get name(): string {
    return this.segmentName;
  }

  get totalMembers(): number {
    return this.customerCount;
  }

  get rules(): any {
    return this.filterRules;
  }
}
