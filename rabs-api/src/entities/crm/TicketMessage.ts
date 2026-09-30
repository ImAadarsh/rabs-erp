import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Ticket } from './Ticket.js';
import { User } from '../iam/User.js';

@Entity({ name: 'ticket_messages' })
export class TicketMessage {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @ManyToOne(() => Ticket, (ticket) => ticket.messages)
    @JoinColumn({ name: 'ticket_id' })
    ticket!: Ticket;

    @Column({ name: 'sender_type', type: 'enum', enum: ['customer', 'agent', 'system'] })
    senderType!: 'customer' | 'agent' | 'system';

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'sender_id' })
    sender!: User | null;

    @Column({ name: 'sender_name', type: 'varchar', length: 255, nullable: true })
    senderName!: string | null;

    @Column({ name: 'sender_email', type: 'varchar', length: 255, nullable: true })
    senderEmail!: string | null;

    @Column({ type: 'text' })
    message!: string;

    @Column({ name: 'is_internal', type: 'boolean', default: false })
    isInternal!: boolean;

    @Column({ type: 'json', nullable: true })
    attachments!: any | null;

    @CreateDateColumn({ name: 'created_at' })
    createdAt!: Date;
}
