import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Payment } from './Payment.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { User } from '../iam/User.js';

@Entity('payment_allocations')
export class PaymentAllocation {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'payment_id', type: 'bigint' })
    paymentId!: string;

    @Column({ name: 'business_unit_id', type: 'bigint', nullable: true })
    businessUnitId?: string;

    @Column({ name: 'cost_center_id', type: 'bigint', nullable: true })
    costCenterId?: string;

    @Column({ name: 'allocation_type', type: 'enum', enum: ['revenue', 'commission', 'fee', 'tax', 'shipping', 'other'] })
    allocationType!: string;

    @Column({ type: 'decimal', precision: 15, scale: 4 })
    amount!: number;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    notes?: string;

    @Column({ name: 'approved_by', type: 'bigint', nullable: true })
    approvedBy?: string;

    @Column({ name: 'approved_at', type: 'timestamp', nullable: true })
    approvedAt?: Date;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => Payment)
    @JoinColumn({ name: 'payment_id' })
    payment!: Payment;

    @ManyToOne(() => BusinessUnit, { nullable: true })
    @JoinColumn({ name: 'business_unit_id' })
    businessUnit?: BusinessUnit;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'approved_by' })
    approver?: User;
}
