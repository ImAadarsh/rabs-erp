import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Customer } from '../orders/Customer.js';
import { Order } from '../orders/Order.js';
import { User } from '../iam/User.js';
import { TicketMessage } from './TicketMessage.js';
import { TicketAssignment } from './TicketAssignment.js';

@Entity({ name: 'tickets' })
export class Ticket {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @ManyToOne(() => Organization)
    @JoinColumn({ name: 'organization_id' })
    organization!: Organization;

    @Column({ name: 'ticket_number', type: 'varchar', length: 100 })
    ticketNumber!: string;

    @ManyToOne(() => Customer, { nullable: true })
    @JoinColumn({ name: 'customer_id' })
    customer!: Customer | null;

    @ManyToOne(() => Order, { nullable: true })
    @JoinColumn({ name: 'order_id' })
    order!: Order | null;

    @Column({ type: 'enum', enum: ['email', 'sms', 'whatsapp', 'phone', 'chat', 'social_dm', 'web_form'] })
    channel!: 'email' | 'sms' | 'whatsapp' | 'phone' | 'chat' | 'social_dm' | 'web_form';

    @Column({ type: 'varchar', length: 500 })
    subject!: string;

    @Column({ type: 'text', nullable: true })
    description!: string | null;

    @Column({ type: 'enum', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
    priority!: 'low' | 'medium' | 'high' | 'urgent';

    @Column({ type: 'enum', enum: ['order_inquiry', 'return', 'complaint', 'technical', 'billing', 'general', 'other'], default: 'general' })
    category!: 'order_inquiry' | 'return' | 'complaint' | 'technical' | 'billing' | 'general' | 'other';

    @Column({ type: 'enum', enum: ['new', 'open', 'pending_customer', 'pending_internal', 'resolved', 'closed', 'cancelled'], default: 'new' })
    status!: 'new' | 'open' | 'pending_customer' | 'pending_internal' | 'resolved' | 'closed' | 'cancelled';

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'assigned_to' })
    assignedTo!: User | null;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'assigned_by' })
    assignedBy!: User | null;

    @Column({ name: 'assigned_at', type: 'timestamp', nullable: true })
    assignedAt!: Date | null;

    @Column({ name: 'first_response_at', type: 'timestamp', nullable: true })
    firstResponseAt!: Date | null;

    @Column({ name: 'first_response_sla_minutes', type: 'int', default: 240 })
    firstResponseSlaMinutes!: number;

    @Column({ name: 'resolution_sla_minutes', type: 'int', default: 1440 })
    resolutionSlaMinutes!: number;

    @Column({ name: 'resolved_at', type: 'timestamp', nullable: true })
    resolvedAt!: Date | null;

    @Column({ name: 'closed_at', type: 'timestamp', nullable: true })
    closedAt!: Date | null;

    @Column({ name: 'customer_satisfaction', type: 'int', nullable: true })
    customerSatisfaction!: number | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    tags!: string | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;

    @UpdateDateColumn({ name: 'updated_at' })
    updatedAt!: Date;

    // Relations
    @OneToMany(() => TicketMessage, (message: TicketMessage) => message.ticket)
    messages!: TicketMessage[];

    @OneToMany(() => TicketAssignment, (assignment: TicketAssignment) => assignment.ticket)
    assignments!: TicketAssignment[];
}
