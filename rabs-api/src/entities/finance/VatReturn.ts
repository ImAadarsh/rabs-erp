import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { User } from '../iam/User.js';

@Entity({ name: 'vat_returns' })
export class VatReturn {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @Column({ name: 'return_number', type: 'varchar', length: 100 })
  returnNumber!: string;

  @Column({ name: 'period_start', type: 'date' })
  periodStart!: Date;

  @Column({ name: 'period_end', type: 'date' })
  periodEnd!: Date;

  @Column({ 
    name: 'vat_due_sales', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  vatDueSales!: number;

  @Column({ 
    name: 'vat_due_acquisitions', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  vatDueAcquisitions!: number;

  @Column({ 
    name: 'vat_reclaimed', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  vatReclaimed!: number;

  @Column({ 
    name: 'total_value_sales', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  totalValueSales!: number;

  @Column({ 
    name: 'total_value_purchases', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  totalValuePurchases!: number;

  @Column({ 
    name: 'total_value_goods_supplied', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  totalValueGoodsSupplied!: number;

  @Column({ 
    name: 'total_acquisitions', 
    type: 'decimal', 
    precision: 15, 
    scale: 4, 
    default: 0.00 
  })
  totalAcquisitions!: number;

  @Column({ 
    type: 'enum', 
    enum: ['draft', 'submitted', 'accepted', 'rejected'],
    default: 'draft'
  })
  status!: 'draft' | 'submitted' | 'accepted' | 'rejected';

  @Column({ name: 'submitted_at', type: 'timestamp', nullable: true })
  submittedAt!: Date | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'submitted_by' })
  submittedBy!: User | null;

  @Column({ name: 'mtd_reference', type: 'varchar', length: 255, nullable: true })
  mtdReference!: string | null;

  @Column({ name: 'box1', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box1!: number;

  @Column({ name: 'box2', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box2!: number;

  @Column({ name: 'box3', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box3!: number;

  @Column({ name: 'box4', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box4!: number;

  @Column({ name: 'box5', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box5!: number;

  @Column({ name: 'box6', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box6!: number;

  @Column({ name: 'box7', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box7!: number;

  @Column({ name: 'box8', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box8!: number;

  @Column({ name: 'box9', type: 'decimal', precision: 15, scale: 4, default: 0 })
  box9!: number;

  @Column({ name: 'vat_scheme', type: 'varchar', length: 40, nullable: true })
  vatScheme!: string | null;

  @Column({ name: 'export_json', type: 'json', nullable: true })
  exportJson!: Record<string, unknown> | null;

  @Column({ name: 'submission_placeholder', type: 'boolean', default: false })
  submissionPlaceholder!: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

