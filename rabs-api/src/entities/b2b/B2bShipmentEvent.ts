import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { B2bShipment } from './B2bShipment.js';

@Entity({ name: 'b2b_shipment_events' })
export class B2bShipmentEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => B2bShipment, (s) => s.events, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'shipment_id' })
  shipment!: B2bShipment;

  @Column({ type: 'varchar', length: 64 })
  status!: string;

  @Column({ type: 'varchar', length: 500 })
  message!: string;

  @Column({ name: 'created_by_user_id', type: 'bigint', unsigned: true, nullable: true })
  createdByUserId!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
