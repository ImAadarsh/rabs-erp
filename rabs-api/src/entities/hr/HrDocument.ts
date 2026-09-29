import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn
} from 'typeorm';
import { Employee } from './Employee.js';
import { User } from '../iam/User.js';

@Entity({ name: 'hr_documents' })
export class HrDocument {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    name: 'doc_category',
    type: 'enum',
    enum: ['contract', 'handbook', 'policy', 'id', 'certificate', 'other'],
    default: 'other'
  })
  docCategory!: 'contract' | 'handbook' | 'policy' | 'id' | 'certificate' | 'other';

  @Column({ name: 'document_name', type: 'varchar', length: 255 })
  documentName!: string;

  @Column({ name: 's3_key', type: 'varchar', length: 500, nullable: true })
  s3Key!: string | null;

  @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
  documentUrl!: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate!: string | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: string | null;

  @Column({ name: 'uploaded_by', type: 'bigint', unsigned: true, nullable: true })
  uploadedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy!: User | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
