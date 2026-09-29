import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Settlement } from './Settlement.js';
import { Order } from '../orders/Order.js';

@Entity('settlement_lines')
export class SettlementLine {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'settlement_id', type: 'bigint' })
    settlementId!: string;

    @Column({ name: 'order_id', type: 'bigint', nullable: true })
    orderId?: string;

    @Column({ name: 'line_type', type: 'enum', enum: ['order', 'refund', 'fee', 'adjustment', 'shipping', 'tax', 'other'] })
    lineType!: string;

    @Column({ type: 'varchar', length: 500, nullable: true })
    description?: string;

    @Column({ type: 'decimal', precision: 15, scale: 4 })
    amount!: number;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ name: 'channel_reference', type: 'varchar', length: 255, nullable: true })
    channelReference?: string;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @ManyToOne(() => Settlement, settlement => settlement.lines)
    @JoinColumn({ name: 'settlement_id' })
    settlement!: Settlement;

    @ManyToOne(() => Order, { nullable: true })
    @JoinColumn({ name: 'order_id' })
    order?: Order;
}
