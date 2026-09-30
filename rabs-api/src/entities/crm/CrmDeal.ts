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
import { CrmPipeline } from './CrmPipeline.js';
import { CrmStage } from './CrmStage.js';
import { CrmLead } from './CrmLead.js';

@Entity({ name: 'crm_deals' })
export class CrmDeal {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'pipeline_id', type: 'bigint', unsigned: true })
  pipelineId!: string;

  @ManyToOne(() => CrmPipeline)
  @JoinColumn({ name: 'pipeline_id' })
  pipeline!: CrmPipeline;

  @Column({ name: 'stage_id', type: 'bigint', unsigned: true })
  stageId!: string;

  @ManyToOne(() => CrmStage)
  @JoinColumn({ name: 'stage_id' })
  stage!: CrmStage;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
  amount!: number;

  /** When set, overrides stage.probability for forecasting */
  @Column({ name: 'probability_override', type: 'decimal', precision: 5, scale: 2, nullable: true })
  probabilityOverride!: number | null;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ name: 'expected_close', type: 'date', nullable: true })
  expectedClose!: string | null;

  @Column({ name: 'owner_user_id', type: 'bigint', unsigned: true, nullable: true })
  ownerUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User | null;

  @Column({ type: 'enum', enum: ['open', 'won', 'lost'], default: 'open' })
  status!: 'open' | 'won' | 'lost';

  @Column({ name: 'lost_reason', type: 'varchar', length: 500, nullable: true })
  lostReason!: string | null;

  @Column({ name: 'lead_id', type: 'bigint', unsigned: true, nullable: true })
  leadId!: string | null;

  @ManyToOne(() => CrmLead, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'lead_id' })
  lead!: CrmLead | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
