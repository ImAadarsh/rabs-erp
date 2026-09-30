import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Segment } from './Segment.js';
import { Customer } from '@entities/orders/Customer.js';

@Entity('segment_members')
export class SegmentMember {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'segment_id', type: 'bigint', unsigned: true })
  segmentId!: string;

  @ManyToOne(() => Segment, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'segment_id' })
  segment!: Segment;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @ManyToOne(() => Customer, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @CreateDateColumn({ name: 'added_at' })
  addedAt!: Date;
}
