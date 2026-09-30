import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Customer } from '../orders/Customer.js';
import { User } from '../iam/User.js';

@Entity({ name: 'customer_notes' })
export class CustomerNote {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @ManyToOne(() => Customer)
    @JoinColumn({ name: 'customer_id' })
    customer!: Customer;

    @Column({ name: 'note_type', type: 'enum', enum: ['general', 'complaint', 'praise', 'follow_up', 'warning', 'other'], default: 'general' })
    noteType!: 'general' | 'complaint' | 'praise' | 'follow_up' | 'warning' | 'other';

    @Column({ type: 'text' })
    note!: string;

    @Column({ name: 'is_important', type: 'boolean', default: false })
    isImportant!: boolean;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'created_by' })
    createdBy!: User | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;
}
