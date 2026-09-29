import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { PriceList } from '../catalog/PriceList.js';
import { Warehouse } from '../inventory/Warehouse.js';

@Entity({ name: 'b2b_portal_settings' })
export class B2bPortalSettings {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;

  @Column({ name: 'publish_mode', type: 'enum', enum: ['all_active', 'mapped_only'], default: 'all_active' })
  publishMode!: 'all_active' | 'mapped_only';

  @ManyToOne(() => PriceList, { nullable: true })
  @JoinColumn({ name: 'default_price_list_id' })
  defaultPriceList!: PriceList | null;

  @ManyToOne(() => Warehouse, { nullable: true })
  @JoinColumn({ name: 'default_warehouse_id' })
  defaultWarehouse!: Warehouse | null;

  @Column({ name: 'assigned_rep_name', type: 'varchar', length: 255, nullable: true })
  assignedRepName!: string | null;

  @Column({ name: 'assigned_rep_phone', type: 'varchar', length: 50, nullable: true })
  assignedRepPhone!: string | null;

  @Column({ name: 'assigned_rep_email', type: 'varchar', length: 255, nullable: true })
  assignedRepEmail!: string | null;

  @Column({ name: 'bank_transfer_instructions', type: 'text', nullable: true })
  bankTransferInstructions!: string | null;

  @Column({ name: 'referral_reward_amount', type: 'decimal', precision: 15, scale: 4, default: 100 })
  referralRewardAmount!: number;

  @Column({ name: 'payment_provider_notes', type: 'text', nullable: true })
  paymentProviderNotes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
