import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Order } from '../orders/Order.js';
import { PaymentGateway } from './PaymentGateway.js';

@Entity('payments')
export class Payment {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'organization_id', type: 'bigint' })
    organizationId!: string;

    @Column({ name: 'order_id', type: 'bigint', nullable: true })
    orderId?: string;

    @Column({ name: 'payment_gateway_id', type: 'bigint', nullable: true })
    paymentGatewayId?: string;

    @Column({ name: 'transaction_id', type: 'varchar', length: 255, nullable: true })
    transactionId?: string;

    @Column({ name: 'payment_method', type: 'enum', enum: ['card', 'bank_transfer', 'paypal', 'cash', 'check', 'other'] })
    paymentMethod!: string;

    @Column({ name: 'payment_type', type: 'enum', enum: ['sale', 'refund', 'partial_refund', 'authorization', 'capture'], default: 'sale' })
    paymentType!: string;

    @Column({ type: 'decimal', precision: 15, scale: 4 })
    amount!: number;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ name: 'fee_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
    feeAmount!: number;

    @Column({ name: 'net_amount', type: 'decimal', precision: 15, scale: 4, readonly: true, select: false }) // GENERATED FIELD
    netAmount?: number;

    @Column({ type: 'enum', enum: ['pending', 'authorized', 'completed', 'failed', 'refunded', 'cancelled', 'expired'], default: 'pending' })
    status!: string;

    @Column({ name: 'payment_date', type: 'date' })
    paymentDate!: Date;

    @Column({ type: 'varchar', length: 255, nullable: true })
    reference?: string;

    @Column({ name: 'card_last4', type: 'varchar', length: 4, nullable: true })
    cardLast4?: string;

    @Column({ name: 'card_brand', type: 'varchar', length: 50, nullable: true })
    cardBrand?: string;

    @Column({ name: 'bank_name', type: 'varchar', length: 255, nullable: true })
    bankName?: string;

    @Column({ name: 'payer_email', type: 'varchar', length: 255, nullable: true })
    payerEmail?: string;

    @Column({ name: 'payer_name', type: 'varchar', length: 255, nullable: true })
    payerName?: string;

    @Column({ name: 'gateway_response', type: 'json', nullable: true })
    gatewayResponse?: any;

    @Column({ name: 'failure_code', type: 'varchar', length: 100, nullable: true })
    failureCode?: string;

    @Column({ name: 'failure_message', type: 'text', nullable: true })
    failureMessage?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
    processedAt?: Date;

    @Column({ name: 'refunded_at', type: 'timestamp', nullable: true })
    refundedAt?: Date;

    @Column({ name: 'invoice_id', type: 'bigint', nullable: true })
    invoiceId?: string | null;

    @Column({ name: 'customer_id', type: 'bigint', nullable: true })
    customerId?: string | null;

    @Column({ name: 'journal_entry_id', type: 'bigint', nullable: true })
    journalEntryId?: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @ManyToOne(() => Order, { nullable: true })
    @JoinColumn({ name: 'order_id' })
    order?: Order;

    @ManyToOne(() => PaymentGateway, { nullable: true })
    @JoinColumn({ name: 'payment_gateway_id' })
    paymentGateway?: PaymentGateway;
}
