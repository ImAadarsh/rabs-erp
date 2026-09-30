import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Payment } from './Payment.js';

@Entity('payment_disputes')
export class PaymentDispute {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'payment_id', type: 'bigint' })
    paymentId!: string;

    @Column({ name: 'dispute_id', type: 'varchar', length: 255, nullable: true })
    disputeId?: string;

    @Column({ name: 'dispute_type', type: 'enum', enum: ['chargeback', 'inquiry', 'fraud', 'other'] })
    disputeType!: string;

    @Column({ type: 'decimal', precision: 15, scale: 4 })
    amount!: number;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    reason?: string;

    @Column({ type: 'enum', enum: ['open', 'under_review', 'won', 'lost', 'closed'], default: 'open' })
    status!: string;

    @Column({ name: 'opened_at', type: 'date' })
    openedAt!: Date;

    @Column({ name: 'resolved_at', type: 'date', nullable: true })
    resolvedAt?: Date;

    @Column({ name: 'evidence_submitted', type: 'boolean', default: false })
    evidenceSubmitted!: boolean;

    @Column({ name: 'evidence_url', type: 'varchar', length: 1000, nullable: true })
    evidenceUrl?: string;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Payment)
    @JoinColumn({ name: 'payment_id' })
    payment!: Payment;
}
