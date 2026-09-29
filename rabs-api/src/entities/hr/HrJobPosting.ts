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

@Entity({ name: 'hr_job_postings' })
export class HrJobPosting {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255 })
  title!: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  department!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  location!: string | null;

  @Column({
    name: 'employment_type',
    type: 'enum',
    enum: ['full_time', 'part_time', 'contract', 'temporary', 'intern'],
    default: 'full_time'
  })
  employmentType!: 'full_time' | 'part_time' | 'contract' | 'temporary' | 'intern';

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @Column({
    type: 'enum',
    enum: ['draft', 'open', 'closed', 'filled', 'cancelled'],
    default: 'draft'
  })
  status!: 'draft' | 'open' | 'closed' | 'filled' | 'cancelled';

  @Column({ name: 'posted_at', type: 'date', nullable: true })
  postedAt!: string | null;

  @Column({ name: 'closes_at', type: 'date', nullable: true })
  closesAt!: string | null;

  @Column({ name: 'created_by', type: 'bigint', unsigned: true, nullable: true })
  createdById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
