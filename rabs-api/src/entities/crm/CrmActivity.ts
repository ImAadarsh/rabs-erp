import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';
import { Customer } from '../orders/Customer.js';
import { Order } from '../orders/Order.js';
import { Ticket } from './Ticket.js';
import { CrmLead } from './CrmLead.js';
import { CrmDeal } from './CrmDeal.js';

@Entity({ name: 'crm_activities' })
export class CrmActivity {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'enum', enum: ['task', 'call', 'meeting', 'note'], default: 'task' })
  type!: 'task' | 'call' | 'meeting' | 'note';

  @Column({ type: 'varchar', length: 500 })
  subject!: string;

  @Column({ type: 'text', nullable: true })
  body!: string | null;

  @Column({ name: 'due_at', type: 'timestamp', nullable: true })
  dueAt!: Date | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'owner_user_id', type: 'bigint', unsigned: true, nullable: true })
  ownerUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'owner_user_id' })
  owner!: User | null;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true, nullable: true })
  customerId!: string | null;

  @ManyToOne(() => Customer, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;

  @Column({ name: 'lead_id', type: 'bigint', unsigned: true, nullable: true })
  leadId!: string | null;

  @ManyToOne(() => CrmLead, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'lead_id' })
  lead!: CrmLead | null;

  @Column({ name: 'deal_id', type: 'bigint', unsigned: true, nullable: true })
  dealId!: string | null;

  @ManyToOne(() => CrmDeal, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'deal_id' })
  deal!: CrmDeal | null;

  @Column({ name: 'ticket_id', type: 'bigint', unsigned: true, nullable: true })
  ticketId!: string | null;

  @ManyToOne(() => Ticket, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'ticket_id' })
  ticket!: Ticket | null;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true, nullable: true })
  orderId!: string | null;

  @ManyToOne(() => Order, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'order_id' })
  order!: Order | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
