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

@Entity({ name: 'hr_rtw_documents' })
export class HrRtwDocument {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'employee_id', type: 'bigint', unsigned: true })
  employeeId!: string;

  @ManyToOne(() => Employee, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'employee_id' })
  employee!: Employee;

  @Column({
    name: 'doc_type',
    type: 'enum',
    enum: ['passport', 'brp', 'share_code_check', 'visa', 'birth_certificate', 'other'],
    default: 'other'
  })
  docType!: 'passport' | 'brp' | 'share_code_check' | 'visa' | 'birth_certificate' | 'other';

  @Column({ name: 'document_name', type: 'varchar', length: 255 })
  documentName!: string;

  @Column({ name: 's3_key', type: 'varchar', length: 500, nullable: true })
  s3Key!: string | null;

  @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
  documentUrl!: string | null;

  @Column({ name: 'verified_at', type: 'datetime', nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'verified_by', type: 'bigint', unsigned: true, nullable: true })
  verifiedById!: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'verified_by' })
  verifiedBy!: User | null;

  @Column({ name: 'expires_at', type: 'date', nullable: true })
  expiresAt!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
