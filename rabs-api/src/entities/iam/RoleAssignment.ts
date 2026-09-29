import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Column } from 'typeorm';
import type { User } from './User.js';
import { Role } from './Role.js';
import { BusinessUnit } from './BusinessUnit.js';
import { Location } from './Location.js';

@Entity({ name: 'role_assignments' })
export class RoleAssignment {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  // Using entity class name string to avoid circular dependency
  // TypeORM will resolve this from the entities array in DataSource
  @ManyToOne('User')
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @ManyToOne(() => Role)
  @JoinColumn({ name: 'role_id' })
  role!: Role;

  @ManyToOne(() => BusinessUnit, { nullable: true })
  @JoinColumn({ name: 'business_unit_id' })
  businessUnit!: BusinessUnit | null;

  @ManyToOne(() => Location, { nullable: true })
  @JoinColumn({ name: 'location_id' })
  location!: Location | null;

  @Column({ name: 'valid_from', type: 'date', nullable: true })
  validFrom!: string | null;

  @Column({ name: 'valid_until', type: 'date', nullable: true })
  validUntil!: string | null;
}


