import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { SettlementLine } from './SettlementLine.js';

@Entity('settlements')
export class Settlement {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'organization_id', type: 'bigint' })
    organizationId!: string;

    @Column({ name: 'business_unit_id', type: 'bigint', nullable: true })
    businessUnitId?: string;

    @Column({ type: 'enum', enum: ['amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'other'] })
    channel!: string;

    @Column({ name: 'settlement_id', type: 'varchar', length: 255 })
    settlementId!: string;

    @Column({ name: 'settlement_date', type: 'date' })
    settlementDate!: Date;

    @Column({ name: 'start_date', type: 'date' })
    startDate!: Date;

    @Column({ name: 'end_date', type: 'date' })
    endDate!: Date;

    @Column({ type: 'char', length: 3, default: 'GBP' })
    currency!: string;

    @Column({ name: 'total_amount', type: 'decimal', precision: 15, scale: 4 })
    totalAmount!: number;

    @Column({ name: 'order_count', type: 'int', default: 0 })
    orderCount!: number;

    @Column({ type: 'enum', enum: ['pending', 'imported', 'reconciled', 'disputed'], default: 'pending' })
    status!: string;

    @Column({ name: 'imported_at', type: 'timestamp', nullable: true })
    importedAt?: Date;

    @Column({ name: 'reconciled_at', type: 'timestamp', nullable: true })
    reconciledAt?: Date;

    @Column({ name: 'raw_data', type: 'json', nullable: true })
    rawData?: any;

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

    @OneToMany(() => SettlementLine, line => line.settlement, { cascade: true })
    lines?: SettlementLine[];
}
