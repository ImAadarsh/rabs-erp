import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Order } from '../orders/Order.js';
import { Customer } from '../orders/Customer.js';
import { B2bShipmentEvent } from './B2bShipmentEvent.js';

@Entity({ name: 'b2b_shipments' })
export class B2bShipment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'varchar', length: 100, nullable: true })
  carrier!: string | null;

  @Column({ name: 'tracking_number', type: 'varchar', length: 255, nullable: true })
  trackingNumber!: string | null;

  @Column({
    type: 'enum',
    enum: ['pending', 'picking', 'packed', 'dispatched', 'in_transit', 'delivered', 'cancelled'],
    default: 'pending'
  })
  status!: 'pending' | 'picking' | 'packed' | 'dispatched' | 'in_transit' | 'delivered' | 'cancelled';

  @Column({ name: 'shipping_method_code', type: 'varchar', length: 64, nullable: true })
  shippingMethodCode!: string | null;

  @Column({ name: 'shipping_method_name', type: 'varchar', length: 255, nullable: true })
  shippingMethodName!: string | null;

  @Column({ name: 'estimated_delivery_at', type: 'timestamp', nullable: true })
  estimatedDeliveryAt!: Date | null;

  @Column({ name: 'dispatched_at', type: 'timestamp', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @OneToMany(() => B2bShipmentEvent, (e) => e.shipment)
  events!: B2bShipmentEvent[];
}
