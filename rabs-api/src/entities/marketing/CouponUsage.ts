import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Coupon } from './Coupon.js';
import { Order } from '@entities/orders/Order.js';
import { Customer } from '@entities/orders/Customer.js';

@Entity('coupon_usage')
export class CouponUsage {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'coupon_id', type: 'bigint', unsigned: true })
  couponId!: string;

  @ManyToOne(() => Coupon, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'coupon_id' })
  coupon!: Coupon;

  @Column({ name: 'order_id', type: 'bigint', unsigned: true })
  orderId!: string;

  @ManyToOne(() => Order, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ name: 'customer_id', type: 'bigint', unsigned: true })
  customerId!: string;

  @ManyToOne(() => Customer, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4 })
  discountAmount!: number;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @CreateDateColumn({ name: 'used_at' })
  usedAt!: Date;
}
