import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity('dashboards')
export class Dashboard {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint' })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'user_id', type: 'bigint', nullable: true })
  userId?: string;

  @ManyToOne(() => User, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'dashboard_name', type: 'varchar', length: 255 })
  dashboardName!: string;

  @Column({
    name: 'dashboard_type',
    type: 'enum',
    enum: ['executive', 'operations', 'sales', 'finance', 'warehouse', 'custom']
  })
  dashboardType!: 'executive' | 'operations' | 'sales' | 'finance' | 'warehouse' | 'custom';

  @Column({ type: 'json' })
  layout!: any;

  @Column({ type: 'json' })
  widgets!: any;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault!: boolean;

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
