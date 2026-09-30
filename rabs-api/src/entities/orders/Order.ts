import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { User } from '../iam/User.js';
import { Customer } from './Customer.js';
import { OrderLine } from './OrderLine.js';
import { OrderAddress } from './OrderAddress.js';
import { OrderNote } from './OrderNote.js';
import { OrderSplit } from './OrderSplit.js';
import { Return } from './Return.js';
import { ChannelConnection } from '../catalog/ChannelConnection.js';

@Entity({ name: 'orders' })
export class Order {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @Column({ name: 'order_number', type: 'varchar', length: 100, unique: true })
  orderNumber!: string;

  @Column({ type: 'enum', enum: ['amazon', 'ebay', 'tiktok', 'etsy', 'shopify', 'woocommerce', 'wix', 'b2b_portal', 'pos', 'phone', 'email', 'other'] })
  channel!: 'amazon' | 'ebay' | 'tiktok' | 'etsy' | 'shopify' | 'woocommerce' | 'wix' | 'b2b_portal' | 'pos' | 'phone' | 'email' | 'other';

  @Column({ name: 'channel_order_id', type: 'varchar', length: 255, nullable: true })
  channelOrderId!: string | null;

  @Column({ name: 'channel_order_number', type: 'varchar', length: 255, nullable: true })
  channelOrderNumber!: string | null;

  /** The POS till or web store this order was pulled from. */
  @ManyToOne(() => ChannelConnection, { nullable: true })
  @JoinColumn({ name: 'channel_connection_id' })
  channelConnection!: ChannelConnection | null;

  @ManyToOne(() => Customer, { nullable: true })
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer | null;

  @Column({ name: 'customer_email', type: 'varchar', length: 255, nullable: true })
  customerEmail!: string | null;

  @Column({ name: 'customer_phone', type: 'varchar', length: 50, nullable: true })
  customerPhone!: string | null;

  @Column({ name: 'order_date', type: 'datetime' })
  orderDate!: Date;

  @Column({ type: 'char', length: 3, default: 'GBP' })
  currency!: string;

  @Column({ type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  subtotal!: number;

  @Column({ name: 'discount_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  discountAmount!: number;

  @Column({ name: 'shipping_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  shippingAmount!: number;

  @Column({ name: 'tax_amount', type: 'decimal', precision: 15, scale: 4, default: 0.00 })
  taxAmount!: number;

  @Column({ type: 'decimal', precision: 15, scale: 4 })
  total!: number;

  @Column({ name: 'payment_status', type: 'enum', enum: ['pending', 'authorized', 'partially_paid', 'paid', 'refunded', 'failed'], default: 'pending' })
  paymentStatus!: 'pending' | 'authorized' | 'partially_paid' | 'paid' | 'refunded' | 'failed';

  @Column({ name: 'fulfillment_status', type: 'enum', enum: ['pending', 'processing', 'partially_fulfilled', 'fulfilled', 'cancelled'], default: 'pending' })
  fulfillmentStatus!: 'pending' | 'processing' | 'partially_fulfilled' | 'fulfilled' | 'cancelled';

  @Column({ name: 'shipping_method', type: 'varchar', length: 255, nullable: true })
  shippingMethod!: string | null;

  @Column({ name: 'requested_delivery_date', type: 'date', nullable: true })
  requestedDeliveryDate!: Date | null;

  @Column({ name: 'gift_message', type: 'text', nullable: true })
  giftMessage!: string | null;

  @Column({ name: 'internal_notes', type: 'text', nullable: true })
  internalNotes!: string | null;

  @Column({ name: 'customer_notes', type: 'text', nullable: true })
  customerNotes!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ name: 'fraud_score', type: 'decimal', precision: 5, scale: 2, nullable: true })
  fraudScore!: number | null;

  @Column({ name: 'fraud_status', type: 'enum', enum: ['clear', 'review', 'flagged', 'blocked'], default: 'clear' })
  fraudStatus!: 'clear' | 'review' | 'flagged' | 'blocked';

  @Column({ type: 'varchar', length: 500, nullable: true })
  tags!: string | null;

  @Column({ type: 'enum', enum: ['pending', 'confirmed', 'processing', 'completed', 'cancelled', 'refunded', 'on_hold'], default: 'pending' })
  status!: 'pending' | 'confirmed' | 'processing' | 'completed' | 'cancelled' | 'refunded' | 'on_hold';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  // Relations
  @OneToMany(() => OrderLine, (line) => line.order)
  lines!: OrderLine[];

  @OneToMany(() => OrderAddress, (address) => address.order)
  addresses!: OrderAddress[];

  @OneToMany(() => OrderNote, (note) => note.order)
  notes!: OrderNote[];

  @OneToMany(() => OrderSplit, (split) => split.parentOrder)
  splits!: OrderSplit[];

  @OneToMany(() => Return, (return_) => return_.order)
  returns!: Return[];
}

