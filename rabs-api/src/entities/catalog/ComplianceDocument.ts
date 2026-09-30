import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { CatalogItem } from './CatalogItem.js';

@Entity({ name: 'compliance_documents' })
export class ComplianceDocument {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => CatalogItem)
  @JoinColumn({ name: 'catalog_item_id' })
  catalogItem!: CatalogItem;

  @Column({ type: 'enum', enum: ['msds', 'certificate', 'safety_data', 'test_report', 'other'] })
  type!: 'msds' | 'certificate' | 'safety_data' | 'test_report' | 'other';

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'document_url', type: 'varchar', length: 1000 })
  documentUrl!: string;

  @Column({ name: 'document_number', type: 'varchar', length: 100, nullable: true })
  documentNumber!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  issuer!: string | null;

  @Column({ name: 'issued_date', type: 'date', nullable: true })
  issuedDate!: Date | null;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate!: Date | null;

  @Column({ type: 'enum', enum: ['active', 'expired', 'pending'], default: 'active' })
  status!: 'active' | 'expired' | 'pending';

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

