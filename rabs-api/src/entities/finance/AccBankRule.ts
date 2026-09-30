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
import { LedgerAccount } from './LedgerAccount.js';
import { AccVatCode } from './AccVatCode.js';

@Entity({ name: 'acc_bank_rules' })
export class AccBankRule {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 150 })
  name!: string;

  @Column({
    name: 'match_field',
    type: 'enum',
    enum: ['description', 'reference', 'payee_payer', 'amount'],
    default: 'description'
  })
  matchField!: 'description' | 'reference' | 'payee_payer' | 'amount';

  @Column({
    name: 'match_operator',
    type: 'enum',
    enum: ['contains', 'equals', 'starts_with', 'regex'],
    default: 'contains'
  })
  matchOperator!: 'contains' | 'equals' | 'starts_with' | 'regex';

  @Column({ name: 'match_value', type: 'varchar', length: 255 })
  matchValue!: string;

  @Column({ name: 'ledger_account_id', type: 'bigint', unsigned: true, nullable: true })
  ledgerAccountId!: string | null;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccount | null;

  @Column({ name: 'vat_code_id', type: 'bigint', unsigned: true, nullable: true })
  vatCodeId!: string | null;

  @ManyToOne(() => AccVatCode, { nullable: true })
  @JoinColumn({ name: 'vat_code_id' })
  vatCode!: AccVatCode | null;

  @Column({ type: 'int', default: 100 })
  priority!: number;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
