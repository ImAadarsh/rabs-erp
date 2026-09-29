import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';

@Entity({ name: 'customer_tiers' })
export class CustomerTier {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @Column({ name: 'tier_name', type: 'varchar', length: 100 })
    tierName!: string;

    @Column({ name: 'tier_code', type: 'varchar', length: 50 })
    tierCode!: string;

    @Column({ name: 'min_lifetime_value', type: 'decimal', precision: 15, scale: 4, nullable: true })
    minLifetimeValue!: number | null;

    @Column({ name: 'min_orders', type: 'int', nullable: true })
    minOrders!: number | null;

    @Column({ type: 'json', nullable: true })
    benefits!: any | null;

    @Column({ name: 'discount_percent', type: 'decimal', precision: 5, scale: 2, nullable: true })
    discountPercent!: number | null;

    @Column({ name: 'priority_support', type: 'boolean', default: false })
    prioritySupport!: boolean;

    @Column({ type: 'int', default: 0 })
    position!: number;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
