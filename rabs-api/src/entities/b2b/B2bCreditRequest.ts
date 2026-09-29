import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Customer } from '../orders/Customer.js';

@Entity({ name: 'b2b_credit_requests' })
export class B2bCreditRequest {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'requested_limit', type: 'decimal', precision: 15, scale: 4 })
  requestedLimit!: number;

  @Column({ name: 'current_limit', type: 'decimal', precision: 15, scale: 4 })
  currentLimit!: number;

  @Column({ type: 'text', nullable: true })
  reason!: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  })
  status!: 'pending' | 'approved' | 'rejected' | 'cancelled';

  @Column({ name: 'reviewed_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  reviewedByUserId!: string | null;

  @Column({ name: 'review_notes', type: 'text', nullable: true })
  reviewNotes!: string | null;

  @Column({ name: 'reviewed_at', type: 'timestamp', nullable: true })
  reviewedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
