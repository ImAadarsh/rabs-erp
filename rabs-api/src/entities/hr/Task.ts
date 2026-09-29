import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { Location } from '../iam/Location.js';

@Entity({ name: 'tasks' })
export class Task {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 500 })
  title!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'task_type', type: 'enum', enum: ['order', 'project', 'maintenance', 'support', 'other'], default: 'other' })
  taskType!: 'order' | 'project' | 'maintenance' | 'support' | 'other';

  @Column({ type: 'enum', enum: ['low', 'medium', 'high', 'urgent'], default: 'medium' })
  priority!: 'low' | 'medium' | 'high' | 'urgent';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_to' })
  assignedTo!: User | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'assigned_by' })
  assignedBy!: User | null;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @ManyToOne(() => Location, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location!: Location | null;

  @Column({ name: 'related_entity_type', type: 'varchar', length: 100, nullable: true })
  relatedEntityType!: string | null;

  @Column({ name: 'related_entity_id', type: 'bigint', unsigned: true, nullable: true })
  relatedEntityId!: string | null;

  @Column({ name: 'due_date', type: 'date', nullable: true })
  dueDate!: Date | null;

  @Column({ name: 'estimated_hours', type: 'decimal', precision: 5, scale: 2, nullable: true })
  estimatedHours!: number | null;

  @Column({ name: 'actual_hours', type: 'decimal', precision: 5, scale: 2, nullable: true })
  actualHours!: number | null;

  @Column({ type: 'enum', enum: ['pending', 'in_progress', 'blocked', 'completed', 'cancelled'], default: 'pending' })
  status!: 'pending' | 'in_progress' | 'blocked' | 'completed' | 'cancelled';

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt!: Date | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

