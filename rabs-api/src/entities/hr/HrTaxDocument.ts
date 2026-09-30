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

@Entity({ name: 'hr_tax_documents' })
export class HrTaxDocument {
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
    enum: ['P45', 'P60', 'P11D', 'other']
  })
  docType!: 'P45' | 'P60' | 'P11D' | 'other';

  @Column({ name: 'tax_year', type: 'varchar', length: 9 })
  taxYear!: string;

  @Column({ name: 's3_key', type: 'varchar', length: 500, nullable: true })
  s3Key!: string | null;

  @Column({ name: 'document_url', type: 'varchar', length: 1000, nullable: true })
  documentUrl!: string | null;

  @Column({ name: 'issued_at', type: 'date', nullable: true })
  issuedAt!: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  notes!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
