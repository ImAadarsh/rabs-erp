import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';

@Entity('payment_gateways')
export class PaymentGateway {
    @PrimaryGeneratedColumn('increment', { type: 'bigint' })
    id!: string;

    @Column({ name: 'organization_id', type: 'bigint' })
    organizationId!: string;

    @Column({ type: 'varchar', length: 255 })
    name!: string;

    @Column({ type: 'enum', enum: ['stripe', 'paypal', 'square', 'sumup', 'open_banking', 'manual', 'other', 'worldpay'] })
    provider!: string;

    @Column({ name: 'api_key_encrypted', type: 'text', nullable: true })
    apiKeyEncrypted?: string;

    @Column({ name: 'api_secret_encrypted', type: 'text', nullable: true })
    apiSecretEncrypted?: string;

    @Column({ name: 'webhook_secret', type: 'text', nullable: true })
    webhookSecret?: string;

    @Column({ type: 'enum', enum: ['test', 'live'], default: 'test' })
    mode!: string;

    @Column({ name: 'supported_currencies', type: 'json', nullable: true })
    supportedCurrencies?: any;

    @Column({ name: 'is_default', type: 'boolean', default: false })
    isDefault!: boolean;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;
}
