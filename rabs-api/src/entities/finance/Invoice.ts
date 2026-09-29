import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { Order } from '../orders/Order.js';
import { Customer } from '../orders/Customer.js';
import { User } from '../iam/User.js';
import { InvoiceLine } from './InvoiceLine.js';

@Entity('invoices')
export class Invoice {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'organization_id', type: 'bigint' })
    organizationId!: string;

    @Column({ name: 'business_unit_id', type: 'bigint', nullable: true })
    businessUnitId?: string;

    @Column({ name: 'order_id', type: 'bigint', nullable: true })
    orderId?: string;

    @Column({ name: 'customer_id', type: 'bigint' })
    customerId!: string;

    @Column({ name: 'invoice_number', type: 'varchar', length: 100 })
    invoiceNumber!: string;

    @Column({ name: 'invoice_date', type: 'date' })
    invoiceDate!: Date;

    @Column({ name: 'due_date', type: 'date', nullable: true })
    dueDate?: Date;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ type: 'decimal', precision: 15, scale: 4, default: 0 })
    subtotal!: number;

    @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    discountAmount!: number;

    @Column({ name: 'shipping_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    shippingAmount!: number;

    @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    taxAmount!: number;

    @Column({ type: 'decimal', precision: 15, scale: 4 })
    total!: number;

    @Column({ name: 'paid_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    paidAmount!: number;

    @Column({ name: 'balance_due', type: 'decimal', precision: 15, scale: 4, readonly: true, select: false })
    balanceDue?: number;

    @Column({ name: 'payment_terms', type: 'varchar', length: 100, nullable: true })
    paymentTerms?: string;

    @Column({ type: 'enum', enum: ['draft', 'sent', 'viewed', 'partially_paid', 'paid', 'overdue', 'cancelled', 'written_off'], default: 'draft' })
    status!: string;

    @Column({ name: 'sent_at', type: 'timestamp', nullable: true })
    sentAt?: Date;

    @Column({ name: 'paid_at', type: 'timestamp', nullable: true })
    paidAt?: Date;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Column({ name: 'footer_text', type: 'text', nullable: true })
    footerText?: string;

    @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
    documentUrl?: string | null;

    @Column({ name: 'journal_entry_id', type: 'bigint', nullable: true })
    journalEntryId?: string | null;

    @Column({ name: 'posted_at', type: 'timestamp', nullable: true })
    postedAt?: Date | null;

    @Column({ name: 'vat_inclusive', type: 'boolean', default: false })
    vatInclusive?: boolean;

    @Column({ name: 'recurring_invoice_id', type: 'bigint', nullable: true })
    recurringInvoiceId?: string | null;

    @Column({ name: 'created_by', type: 'bigint', nullable: true })
    createdBy?: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @ManyToOne(() => BusinessUnit, { nullable: true })
    @JoinColumn({ name: 'business_unit_id' })
    businessUnit?: BusinessUnit;

    @ManyToOne(() => Order, { nullable: true })
    @JoinColumn({ name: 'order_id' })
    order?: Order;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer!: Customer;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    creator?: User;

    @OneToMany(() => InvoiceLine, line => line.invoice, { cascade: true })
    lines?: InvoiceLine[];
}
