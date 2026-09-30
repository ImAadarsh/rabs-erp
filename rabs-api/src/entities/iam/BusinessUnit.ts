import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Organization } from './Organization.js';
import { Location } from './Location.js';

@Entity({ name: 'business_units' })
export class BusinessUnit {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'parent_id' })
  parent!: BusinessUnit | null;

  @Column({ type: 'varchar', length: 50 })
  code!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'enum', enum: ['wholesale', 'retail', 'ecommerce', '3pl', 'food_beverage', 'other'] })
  type!: 'wholesale' | 'retail' | 'ecommerce' | '3pl' | 'food_beverage' | 'other';

  @Column({ type: 'enum', enum: ['active', 'inactive', 'suspended'], default: 'active' })
  status!: 'active' | 'inactive' | 'suspended';

  @Column({ type: 'json', nullable: true })
  settings!: Record<string, any> | null;

  @OneToMany(() => Location, (location) => location.businessUnit)
  locations!: Location[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}


