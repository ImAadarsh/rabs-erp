import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Order } from '../orders/Order.js';

@Entity({ name: 'order_shipments' })
export class OrderShipment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Index()
  @ManyToOne(() => Order)
  @JoinColumn({ name: 'order_id' })
  order!: Order;

  @Column({ type: 'varchar', length: 64, default: 'DHL' })
  carrier!: string;

  @Column({ name: 'service_code', type: 'varchar', length: 32, nullable: true })
  serviceCode!: string | null;

  @Index()
  @Column({ name: 'tracking_number', type: 'varchar', length: 64, nullable: true })
  trackingNumber!: string | null;

  @Column({ name: 'label_url', type: 'varchar', length: 1000, nullable: true })
  labelUrl!: string | null;

  @Column({ name: 'label_s3_key', type: 'varchar', length: 500, nullable: true })
  labelS3Key!: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'created', 'label_ready', 'in_transit', 'delivered', 'cancelled', 'failed'],
    default: 'draft'
  })
  status!: 'draft' | 'created' | 'label_ready' | 'in_transit' | 'delivered' | 'cancelled' | 'failed';

  @Column({ name: 'carrier_status', type: 'varchar', length: 255, nullable: true })
  carrierStatus!: string | null;

  @Column({ name: 'weight_kg', type: 'decimal', precision: 10, scale: 3, nullable: true })
  weightKg!: number | null;

  @Column({ name: 'pieces', type: 'int', default: 1 })
  pieces!: number;

  @Column({ name: 'planned_pickup_at', type: 'timestamp', nullable: true })
  plannedPickupAt!: Date | null;

  @Column({ name: 'dispatched_at', type: 'timestamp', nullable: true })
  dispatchedAt!: Date | null;

  @Column({ name: 'delivered_at', type: 'timestamp', nullable: true })
  deliveredAt!: Date | null;

  @Column({ name: 'cancelled_at', type: 'timestamp', nullable: true })
  cancelledAt!: Date | null;

  @Column({ name: 'last_error', type: 'text', nullable: true })
  lastError!: string | null;

  @Column({ name: 'raw_create_response', type: 'json', nullable: true })
  rawCreateResponse!: Record<string, unknown> | null;

  @Column({ name: 'raw_tracking', type: 'json', nullable: true })
  rawTracking!: Record<string, unknown> | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
