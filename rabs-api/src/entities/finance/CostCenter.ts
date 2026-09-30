import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { BusinessUnit } from '../iam/BusinessUnit.js';
import { User } from '../iam/User.js';
import { JournalLine } from './JournalLine.js';
import { BudgetLine } from './BudgetLine.js';

@Entity({ name: 'cost_centers' })
export class CostCenter {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'text', nullable: true })
  description!: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'manager_id' })
  manager!: User | null;

  @Column({ 
    type: 'enum', 
    enum: ['active', 'inactive', 'closed'], 
    default: 'active' 
  })
  status!: 'active' | 'inactive' | 'closed';

  @OneToMany(() => JournalLine, (journalLine) => journalLine.costCenter)
  journalLines!: JournalLine[];

  @OneToMany(() => BudgetLine, (budgetLine) => budgetLine.costCenter)
  budgetLines!: BudgetLine[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}

