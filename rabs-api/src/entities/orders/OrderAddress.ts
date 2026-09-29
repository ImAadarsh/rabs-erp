import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Order } from './Order.js';

@Entity({ name: 'order_addresses' })
export class OrderAddress {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ name: 'address_type', type: 'enum', enum: ['shipping', 'billing'] })
  addressType!: 'shipping' | 'billing';

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  company!: string | null;

  @Column({ name: 'address_line1', type: 'varchar', length: 255 })
  addressLine1!: string;

  @Column({ name: 'address_line2', type: 'varchar', length: 255, nullable: true })
  addressLine2!: string | null;

  @Column({ type: 'varchar', length: 100 })
  city!: string;

  @Column({ name: 'state_province', type: 'varchar', length: 100, nullable: true })
  stateProvince!: string | null;

  @Column({ name: 'postal_code', type: 'varchar', length: 20 })
  postalCode!: string;

  @Column({ name: 'country_code', type: 'char', length: 2 })
  countryCode!: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

