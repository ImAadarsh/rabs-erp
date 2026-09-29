import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity({ name: 'canned_responses' })
export class CannedResponse {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @Column({ type: 'varchar', length: 255 })
    title!: string;

    @Column({ type: 'varchar', length: 50, nullable: true })
    shortcut!: string | null;

    @Column({ type: 'text' })
    content!: string;

    @Column({ type: 'varchar', length: 100, nullable: true })
    category!: string | null;

    @Column({ name: 'is_active', type: 'boolean', default: true })
    isActive!: boolean;

    @Column({ name: 'usage_count', type: 'int', default: 0 })
    usageCount!: number;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    createdBy!: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
