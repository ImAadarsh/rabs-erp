import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Customer } from '../orders/Customer.js';

@Entity({ name: 'b2b_referrals' })
export class B2bReferral {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'referrer_customer_id' })
  referrerCustomer!: Customer;

  @Column({ type: 'varchar', length: 64 })
  code!: string;

  @Column({ name: 'referred_email', type: 'varchar', length: 255, nullable: true })
  referredEmail!: string | null;

  @Column({ name: 'referred_company', type: 'varchar', length: 255, nullable: true })
  referredCompany!: string | null;

  @Column({
    type: 'enum',
    enum: ['active', 'pending', 'qualified', 'rewarded', 'cancelled'],
    default: 'active'
  })
  status!: 'active' | 'pending' | 'qualified' | 'rewarded' | 'cancelled';

  @Column({ name: 'reward_amount', type: 'decimal', precision: 15, scale: 4, default: 0 })
  rewardAmount!: number;

  @Column({ name: 'rewarded_at', type: 'timestamp', nullable: true })
  rewardedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
