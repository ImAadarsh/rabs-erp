import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Invoice } from './Invoice.js';
import { OrderLine } from '../orders/OrderLine.js';

@Entity('invoice_lines')
export class InvoiceLine {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'invoice_id', type: 'bigint' })
    invoiceId!: string;

    @Column({ name: 'order_line_id', type: 'bigint', nullable: true })
    orderLineId?: string;

    @Column({ type: 'varchar', length: 500 })
    description!: string;

    @Column({ type: 'decimal', precision: 10, scale: 4 })
    quantity!: number;

    @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 4 })
    unitPrice!: number;

    @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, default: 0 })
    discountPercent!: number;

    @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    discountAmount!: number;

    @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 4, default: 0 })
    taxRate!: number;

    @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    taxAmount!: number;

    @Column({ name: 'line_total', type: 'decimal', precision: 15, scale: 4 })
    lineTotal!: number;

    @Column({ name: 'vat_code_id', type: 'bigint', nullable: true })
    vatCodeId?: string | null;

    @Column({ name: 'ledger_account_id', type: 'bigint', nullable: true })
    ledgerAccountId?: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => Invoice, invoice => invoice.lines)
    @JoinColumn({ name: 'invoice_id' })
    invoice!: Invoice;

    @ManyToOne(() => OrderLine, { nullable: true })
    @JoinColumn({ name: 'order_line_id' })
    orderLine?: OrderLine;
}
