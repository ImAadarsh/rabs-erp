import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  OneToMany,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { LedgerAccount } from './LedgerAccount.js';
import { JournalEntry } from './JournalEntry.js';
import { AccDepreciationSchedule } from './AccDepreciationSchedule.js';

@Entity({ name: 'acc_fixed_assets' })
export class AccFixedAsset {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'asset_code', type: 'varchar', length: 50 })
  assetCode!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'purchase_date', type: 'date' })
  purchaseDate!: Date;

  @Column({ name: 'purchase_cost', type: 'decimal', precision: 15, scale: 4 })
  purchaseCost!: number;

  @Column({ name: 'residual_value', type: 'decimal', precision: 15, scale: 4, default: 0 })
  residualValue!: number;

  @Column({ name: 'useful_life_months', type: 'int', default: 36 })
  usefulLifeMonths!: number;

  @Column({
    name: 'depreciation_method',
    type: 'enum',
    enum: ['straight_line', 'reducing_balance'],
    default: 'straight_line'
  })
  depreciationMethod!: 'straight_line' | 'reducing_balance';

  @Column({ name: 'reducing_rate', type: 'decimal', precision: 7, scale: 4, nullable: true })
  reducingRate!: number | null;

  @Column({ name: 'cost_account_id', type: 'bigint', unsigned: true, nullable: true })
  costAccountId!: string | null;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'cost_account_id' })
  costAccount!: LedgerAccount | null;

  @Column({ name: 'accum_depr_account_id', type: 'bigint', unsigned: true, nullable: true })
  accumDeprAccountId!: string | null;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'accum_depr_account_id' })
  accumDeprAccount!: LedgerAccount | null;

  @Column({ name: 'depr_expense_account_id', type: 'bigint', unsigned: true, nullable: true })
  deprExpenseAccountId!: string | null;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'depr_expense_account_id' })
  deprExpenseAccount!: LedgerAccount | null;

  @Column({
    type: 'enum',
    enum: ['active', 'fully_depreciated', 'disposed'],
    default: 'active'
  })
  status!: 'active' | 'fully_depreciated' | 'disposed';

  @Column({ name: 'disposed_at', type: 'date', nullable: true })
  disposedAt!: Date | null;

  @Column({ name: 'disposal_proceeds', type: 'decimal', precision: 15, scale: 4, nullable: true })
  disposalProceeds!: number | null;

  @Column({ name: 'disposal_journal_id', type: 'bigint', unsigned: true, nullable: true })
  disposalJournalId!: string | null;

  @ManyToOne(() => JournalEntry, { nullable: true })
  @JoinColumn({ name: 'disposal_journal_id' })
  disposalJournal!: JournalEntry | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @OneToMany(() => AccDepreciationSchedule, (s) => s.asset)
  schedule!: AccDepreciationSchedule[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
