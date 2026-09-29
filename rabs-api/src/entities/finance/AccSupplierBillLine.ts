import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { AccSupplierBill } from './AccSupplierBill.js';
import { AccVatCode } from './AccVatCode.js';
import { LedgerAccount } from './LedgerAccount.js';

@Entity({ name: 'acc_supplier_bill_lines' })
export class AccSupplierBillLine {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'bill_id', type: 'bigint', unsigned: true })
  billId!: string;

  @ManyToOne(() => AccSupplierBill, (bill) => bill.lines)
  @JoinColumn({ name: 'bill_id' })
  bill!: AccSupplierBill;

  @Column({ type: 'varchar', length: 500 })
  description!: string;

  @Column({ type: 'decimal', precision: 12, scale: 4, default: 1 })
  quantity!: number;

  @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 4, default: 0 })
  unitPrice!: number;

  @Column({ name: 'vat_code_id', type: 'bigint', unsigned: true, nullable: true })
  vatCodeId!: string | null;

  @ManyToOne(() => AccVatCode, { nullable: true })
  @JoinColumn({ name: 'vat_code_id' })
  vatCode!: AccVatCode | null;

  @Column({ name: 'tax_rate', type: 'decimal', precision: 7, scale: 4, default: 0 })
  taxRate!: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  taxAmount!: number;

  @Column({ name: 'line_total', type: 'decimal', precision: 15, scale: 4, default: 0 })
  lineTotal!: number;

  @Column({ name: 'ledger_account_id', type: 'bigint', unsigned: true, nullable: true })
  ledgerAccountId!: string | null;

  @ManyToOne(() => LedgerAccount, { nullable: true })
  @JoinColumn({ name: 'ledger_account_id' })
  ledgerAccount!: LedgerAccount | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
