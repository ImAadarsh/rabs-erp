import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Customer } from '../orders/Customer.js';

@Entity({ name: 'b2b_notification_preferences' })
export class B2bNotificationPreference {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ name: 'price_alerts', type: 'boolean', default: true })
  priceAlerts!: boolean;

  @Column({ name: 'stock_sms', type: 'boolean', default: true })
  stockSms!: boolean;

  @Column({ name: 'order_updates', type: 'boolean', default: true })
  orderUpdates!: boolean;

  @Column({ name: 'credit_alerts', type: 'boolean', default: true })
  creditAlerts!: boolean;

  @Column({ type: 'boolean', default: false })
  marketing!: boolean;

  @Column({ name: 'channel_email', type: 'boolean', default: true })
  channelEmail!: boolean;

  @Column({ name: 'channel_sms', type: 'boolean', default: false })
  channelSms!: boolean;

  @Column({ name: 'channel_whatsapp', type: 'boolean', default: false })
  channelWhatsapp!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
