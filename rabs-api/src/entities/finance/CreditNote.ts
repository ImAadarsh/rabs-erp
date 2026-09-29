import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Invoice } from './Invoice.js';
import { User } from '../iam/User.js';
import { CreditNoteLine } from './CreditNoteLine.js';

@Entity('credit_notes')
export class CreditNote {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'organization_id', type: 'bigint' })
    organizationId!: string;

    @Column({ name: 'invoice_id', type: 'bigint' })
    invoiceId!: string;

    @Column({ name: 'credit_note_number', type: 'varchar', length: 100 })
    creditNoteNumber!: string;

    @Column({ name: 'credit_note_date', type: 'date' })
    creditNoteDate!: Date;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
    subtotal!: number;

    @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    taxAmount!: number;

    @Column({ type: 'decimal', precision: 15, scale: 4 })
    total!: number;

    @Column({ type: 'varchar', length: 500, nullable: true })
    reason?: string;

    @Column({ type: 'enum', enum: ['draft', 'issued', 'applied', 'cancelled'], default: 'draft' })
    status!: string;

    @Column({ name: 'issued_at', type: 'timestamp', nullable: true })
    issuedAt?: Date;

    @Column({ name: 'applied_at', type: 'timestamp', nullable: true })
    appliedAt?: Date;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
    documentUrl?: string | null;

    @Column({ name: 'journal_entry_id', type: 'bigint', nullable: true })
    journalEntryId?: string | null;

    @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
    postedAt?: Date | null;

    @Column({ name: 'customer_id', type: 'bigint', nullable: true })
    customerId?: string | null;

    @Column({ name: 'created_by', type: 'bigint', nullable: true })
    createdBy?: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @ManyToOne(() => Invoice)
    @JoinColumn({ name: 'invoice_id' })
    invoice!: Invoice;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    creator?: User;

    @OneToMany(() => CreditNoteLine, line => line.creditNote, { cascade: true })
    lines?: CreditNoteLine[];
}
