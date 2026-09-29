import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity('payouts')
export class Payout {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'organization_id', type: 'bigint' })
    organizationId!: string;

    @Column({ name: 'payout_number', type: 'varchar', length: 100 })
    payoutNumber!: string;

    @Column({ name: 'payee_type', type: 'enum', enum: ['supplier', 'affiliate', 'employee', 'partner', 'other'] })
    payeeType!: string;

    @Column({ name: 'payee_id', type: 'bigint' })
    payeeId!: string;

    @Column({ name: 'payee_name', type: 'varchar', length: 255 })
    payeeName!: string;

    @Column({ type: 'decimal', precision: 15, scale: 4 })
    amount!: number;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ name: 'payment_method', type: 'enum', enum: ['bank_transfer', 'paypal', 'check', 'cash', 'other'] })
    paymentMethod!: string;

    @Column({ name: 'bank_account_number', type: 'varchar', length: 100, nullable: true })
    bankAccountNumber?: string;

    @Column({ name: 'bank_routing_number', type: 'varchar', length: 100, nullable: true })
    bankRoutingNumber?: string;

    @Column({ name: 'paypal_email', type: 'varchar', length: 255, nullable: true })
    paypalEmail?: string;

    @Column({ type: 'varchar', length: 255, nullable: true })
    reference?: string;

    @Column({ name: 'payout_date', type: 'date' })
    payoutDate!: Date;

    @Column({ type: 'enum', enum: ['pending', 'approved', 'processing', 'completed', 'failed', 'cancelled'], default: 'pending' })
    status!: string;

    @Column({ name: 'approved_by', type: 'bigint', nullable: true })
    approvedBy?: string;

    @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
    approvedAt?: Date;

    @Column({ name: 'processed_at', type: 'timestamp', nullable: true })
    processedAt?: Date;

    @Column({ type: 'text', nullable: true })
    notes?: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'approved_by' })
    approver?: User;
}
