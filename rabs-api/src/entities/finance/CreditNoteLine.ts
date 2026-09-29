import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { CreditNote } from './CreditNote.js';
import { InvoiceLine } from './InvoiceLine.js';

@Entity('credit_note_lines')
export class CreditNoteLine {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'credit_note_id', type: 'bigint' })
    creditNoteId!: string;

    @Column({ name: 'invoice_line_id', type: 'bigint', nullable: true })
    invoiceLineId?: string;

    @Column({ type: 'varchar', length: 500 })
    description!: string;

    @Column({ type: 'decimal', precision: 10, scale: 4 })
    quantity!: number;

    @Column({ name: 'unit_price', type: 'decimal', precision: 15, scale: 4 })
    unitPrice!: number;

    @Column({ name: 'tax_rate', type: 'decimal', precision: 5, scale: 4, default: 0 })
    taxRate!: number;

    @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    taxAmount!: number;

    @Column({ name: 'line_total', type: 'decimal', precision: 15, scale: 4 })
    lineTotal!: number;

    @Column({ name: 'vat_code_id', type: 'bigint', nullable: true })
    vatCodeId?: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => CreditNote, creditNote => creditNote.lines)
    @JoinColumn({ name: 'credit_note_id' })
    creditNote!: CreditNote;

    @ManyToOne(() => InvoiceLine, { nullable: true })
    @JoinColumn({ name: 'invoice_line_id' })
    invoiceLine?: InvoiceLine;
}
