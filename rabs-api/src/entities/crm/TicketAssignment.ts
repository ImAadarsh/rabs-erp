import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Ticket } from './Ticket.js';
import { User } from '../iam/User.js';

@Entity({ name: 'ticket_assignments' })
export class TicketAssignment {
    @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
    id!: string;

    @ManyToOne(() => Ticket, (ticket) => ticket.assignments)
    @JoinColumn({ name: 'ticket_id' })
    ticket!: Ticket;

    @ManyToOne(() => User)
    @JoinColumn({ name: 'assigned_to' })
    assignedTo!: User;

    @ManyToOne(() => User, { nullable: true })
    @JoinColumn({ name: 'assigned_by' })
    assignedBy!: User | null;

    @CreateDateColumn({ name: 'assigned_at' })
    assignedAt!: Date;

    @Column({ name: 'unassigned_at', type: 'timestamp', nullable: true })
    unassignedAt!: Date | null;

    @Column({ type: 'varchar', length: 500, nullable: true })
    notes!: string | null;
}
