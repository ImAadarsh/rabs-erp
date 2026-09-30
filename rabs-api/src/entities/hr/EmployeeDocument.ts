import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Employee } from './Employee.js';
import { User } from '../iam/User.js';

@Entity({ name: 'employee_documents' })
export class EmployeeDocument {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Employee)
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({ name: 'document_type', type: 'enum', enum: ['contract', 'offer_letter', 'id', 'passport', 'certificate', 'performance_review', 'warning', 'other'] })
  documentType!: 'contract' | 'offer_letter' | 'id' | 'passport' | 'certificate' | 'performance_review' | 'warning' | 'other';

  @Column({ name: 'document_name', type: 'varchar', length: 255 })
  documentName!: string;

  @Column({ name: 'document_url', type: 'varchar', length: 1000 })
  documentUrl!: string;

  @Column({ name: 'document_number', type: 'varchar', length: 100, nullable: true })
  documentNumber!: string | null;

  @Column({ name: 'issue_date', type: 'date', nullable: true })
  issueDate!: Date | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy!: User | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

