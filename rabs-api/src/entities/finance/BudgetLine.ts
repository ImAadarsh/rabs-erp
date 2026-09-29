import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { CostCenter } from './CostCenter.js';
import { LedgerAccount } from './LedgerAccount.js';
import { FiscalPeriod } from './FiscalPeriod.js';

@Entity({ name: 'budget_lines' })
export class BudgetLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @ManyToOne(() => CostCenter, { nullable: true })
  @JoinColumn({ name: 'cost_center_id' })
  costCenter!: CostCenter | null;

  @ManyToOne(() => LedgerAccount)
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccount;

  @ManyToOne(() => FiscalPeriod)
  @JoinColumn({ name: 'fiscal_period_id' })
  fiscalPeriod!: FiscalPeriod;

  @Column({ 
    name: 'budgeted_amount', 
    type: 'decimal', 
    precision: 15, 
    scale: 4 
  })
  budgetedAmount!: number;

  @Column({ 
    name: 'actual_amount', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  actualAmount!: number;

  @Column({ 
    name: 'variance_percent', 
    type: 'decimal', 
    precision: 7, 
    scale: 4, 
    nullable: true 
  })
  variancePercent!: number | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

