import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity('report_definitions')
export class ReportDefinition {
  @PrimaryGeneratedColumn('increment')
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint' })
  organizationId!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'report_name', type: 'varchar', length: 255 })
  reportName!: string;

  @Column({ name: 'report_code', type: 'varchar', length: 50 })
  reportCode!: string;

  @Column({
    name: 'report_category',
    type: 'enum',
    enum: ['sales', 'inventory', 'finance', 'operations', 'hr', 'marketing', 'customer', 'executive']
  })
  reportCategory!: 'sales' | 'inventory' | 'finance' | 'operations' | 'hr' | 'marketing' | 'customer' | 'executive';

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ name: 'query_template', type: 'text', nullable: true })
  queryTemplate?: string;

  @Column({ type: 'json', nullable: true })
  parameters?: any;

  @Column({ name: 'output_format', type: 'enum', enum: ['pdf', 'excel', 'csv', 'html', 'json'], default: 'pdf' })
  outputFormat!: 'pdf' | 'excel' | 'csv' | 'html' | 'json';

  @Column({ name: 'is_public', type: 'boolean', default: false })
  isPublic!: boolean;

  @Column({ name: 'created_by', type: 'bigint', nullable: true })
  createdById?: string;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
