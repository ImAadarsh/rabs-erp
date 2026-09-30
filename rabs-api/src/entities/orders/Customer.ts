import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';
import { CustomerAddress } from './CustomerAddress.js';
import { Order } from './Order.js';
import { Return } from './Return.js';

@Entity({ name: 'customers' })
export class Customer {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'customer_number', type: 'varchar', length: 100, nullable: true })
  customerNumber!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ name: 'company_name', type: 'varchar', length: 255, nullable: true })
  companyName!: string | null;

  @Column({ name: 'customer_type', type: 'enum', enum: ['individual', 'business', 'wholesale', 'vip'], default: 'individual' })
  customerType!: 'individual' | 'business' | 'wholesale' | 'vip';

  @Column({ type: 'enum', enum: ['standard', 'silver', 'gold', 'platinum'], default: 'standard' })
  tier!: 'standard' | 'silver' | 'gold' | 'platinum';

  @Column({ name: 'tax_id', type: 'varchar', length: 100, nullable: true })
  taxId!: string | null;

  @Column({ name: 'tax_exempt', type: 'boolean', default: false })
  taxExempt!: boolean;

  @Column({ name: 'language_code', type: 'char', length: 2, default: 'en' })
  languageCode!: string;

  @Column({ name: 'marketing_opt_in', type: 'boolean', default: false })
  marketingOptIn!: boolean;

  @Column({ name: 'lifetime_value', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  lifetimeValue!: number;

  @Column({ name: 'total_orders', type: 'int', default: 0 })
  totalOrders!: number;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ name: 'credit_limit', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  creditLimit!: number;

  @Column({ name: 'credit_used', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  creditUsed!: number;

  @Column({ name: 'payment_terms', type: 'varchar', length: 100, nullable: true })
  paymentTerms!: string | null;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'blocked'], default: 'active' })
  status!: 'active' | 'inactive' | 'blocked';

  /** CRM account owner (staff user). */
  @Column({ name: 'crm_owner_user_id', type: 'bigint', unsigned: true, nullable: true })
  crmOwnerUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'crm_owner_user_id' })
  crmOwner!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;

  // Relations
  @OneToMany(() => CustomerAddress, (address) => address.customer)
  addresses!: CustomerAddress[];

  @OneToMany(() => Order, (order) => order.customer)
  orders!: Order[];

  @OneToMany(() => Return, (return_) => return_.customer)
  returns!: Return[];
}

