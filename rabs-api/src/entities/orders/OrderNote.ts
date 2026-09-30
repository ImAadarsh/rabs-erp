import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Order } from './Order.js';
import { User } from '../iam/User.js';

@Entity({ name: 'order_notes' })
export class OrderNote {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ name: 'note_type', type: 'enum', enum: ['internal', 'customer', 'system'], default: 'internal' })
  noteType!: 'internal' | 'customer' | 'system';

  @Column({ type: 'text' })
  note!: string;

  @Column({ name: 'is_customer_visible', type: 'boolean', default: false })
  isCustomerVisible!: boolean;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

