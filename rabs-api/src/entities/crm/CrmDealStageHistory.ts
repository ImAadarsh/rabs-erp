import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn
} from 'typeorm';
import { User } from '../iam/User.js';
import { CrmDeal } from './CrmDeal.js';
import { CrmStage } from './CrmStage.js';

@Entity({ name: 'crm_deal_stage_history' })
export class CrmDealStageHistory {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'deal_id', type: 'bigint', unsigned: true })
  dealId!: string;

  @ManyToOne(() => CrmDeal, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deal_id' })
  deal!: CrmDeal;

  @Column({ name: 'from_stage_id', type: 'bigint', unsigned: true, nullable: true })
  fromStageId!: string | null;

  @ManyToOne(() => CrmStage, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'from_stage_id' })
  fromStage!: CrmStage | null;

  @Column({ name: 'to_stage_id', type: 'bigint', unsigned: true })
  toStageId!: string;

  @ManyToOne(() => CrmStage)
  @JoinColumn({ name: 'to_stage_id' })
  toStage!: CrmStage;

  @Column({ name: 'changed_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  changedByUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'changed_by_user_id' })
  changedBy!: User | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  note!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
