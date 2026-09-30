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

@Entity({ name: 'acc_org_settings' })
export class AccOrgSettings {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @Column({ name: 'vat_registered', type: 'boolean', default: true })
  vatRegistered!: boolean;

  @Column({ name: 'vat_number', type: 'varchar', length: 20, nullable: true })
  vatNumber!: string | null;

  @Column({
    name: 'vat_scheme',
    type: 'enum',
    enum: ['standard', 'flat_rate', 'cash_accounting'],
    default: 'standard'
  })
  vatScheme!: 'standard' | 'flat_rate' | 'cash_accounting';

  @Column({ name: 'flat_rate_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
  flatRatePercent!: number | null;

  @Column({ name: 'cash_accounting_enabled', type: 'boolean', default: false })
  cashAccountingEnabled!: boolean;

  @Column({ name: 'flat_rate_enabled', type: 'boolean', default: false })
  flatRateEnabled!: boolean;

  @Column({ name: 'default_currency', type: 'char', length: 3, default: 'GBP' })
  defaultCurrency!: string;

  @Column({ name: 'financial_year_start_month', type: 'tinyint', default: 4 })
  financialYearStartMonth!: number;

  @Column({ name: 'hmrc_mtd_client_id', type: 'varchar', length: 255, nullable: true })
  hmrcMtdClientId!: string | null;

  @Column({ name: 'hmrc_mtd_enabled', type: 'boolean', default: false })
  hmrcMtdEnabled!: boolean;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
