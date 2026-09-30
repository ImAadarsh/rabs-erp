import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Customer } from '../orders/Customer.js';

@Entity({ name: 'b2b_retailer_buyers' })
export class B2bRetailerBuyer {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'enum', enum: ['buyer', 'manager', 'viewer'], default: 'buyer' })
  role!: 'buyer' | 'manager' | 'viewer';

  @Column({ name: 'spending_cap', type: 'decimal', precision: 15, scale: 4, nullable: true })
  spendingCap!: number | null;

  @Column({ type: 'enum', enum: ['active', 'invited', 'disabled'], default: 'active' })
  status!: 'active' | 'invited' | 'disabled';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
