import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity({ name: 'crm_settings' })
export class CrmSettings {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'auto_assign_leads', type: 'boolean', default: true })
  autoAssignLeads!: boolean;

  @Column({ name: 'auto_followup_on_lead', type: 'boolean', default: true })
  autoFollowupOnLead!: boolean;

  @Column({ name: 'last_assigned_user_id', type: 'bigint', unsigned: true, nullable: true })
  lastAssignedUserId!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'last_assigned_user_id' })
  lastAssignedUser!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
