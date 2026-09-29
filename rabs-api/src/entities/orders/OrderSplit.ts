import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Order } from './Order.js';
import { Warehouse } from '../inventory/Warehouse.js';

@Entity({ name: 'order_splits' })
export class OrderSplit {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Order)
  @JoinColumn({ name: 'parent_order_id' })
  parentOrder!: Order;

  @Column({ name: 'child_order_number', type: 'varchar', length: 100 })
  childOrderNumber!: string;

  @ManyToOne(() => Warehouse)
  @JoinColumn({ name: 'warehouse_id' })
  warehouse!: Warehouse;

  @Column({ name: 'split_reason', type: 'varchar', length: 500, nullable: true })
  splitReason!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}

