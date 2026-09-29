import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, OneToMany, JoinColumn, CreateDateColumn, UpdateDateColumn, DeleteDateColumn } from 'typeorm';
import { Organization } from './Organization.js';
import type { RoleAssignment } from './RoleAssignment.js';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ type: 'varchar', length: 255, unique: true })
  email!: string;

  @Column({ type: 'varchar', length: 100, nullable: true, unique: true })
  username!: string | null;

  @Column({ name: 'password_hash', type: 'varchar', length: 255, nullable: true })
  passwordHash!: string | null;

  /** Never serialize credentials into API JSON (CRM nests owner/createdBy/etc.). */
  toJSON(): Record<string, unknown> {
    const { passwordHash: _passwordHash, ssoId: _ssoId, ...safe } = this as User & Record<string, unknown>;
    return safe;
  }

  @Column({ name: 'first_name', type: 'varchar', length: 100, nullable: true })
  firstName!: string | null;

  @Column({ name: 'last_name', type: 'varchar', length: 100, nullable: true })
  lastName!: string | null;

  @Column({ name: 'avatar_url', type: 'varchar', length: 500, nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'sso_provider', type: 'enum', enum: ['google', 'microsoft', 'local'], default: 'local' })
  ssoProvider!: 'google' | 'microsoft' | 'local';

  @Column({ name: 'sso_id', type: 'varchar', length: 255, nullable: true })
  ssoId!: string | null;

  @Column({ name: 'email_verified', type: 'boolean', default: false })
  emailVerified!: boolean;

  @Column({ name: 'email_verified_at', type: 'timestamp', nullable: true })
  emailVerifiedAt!: Date | null;

  @Column({ type: 'enum', enum: ['active', 'inactive', 'suspended', 'locked'], default: 'active' })
  status!: 'active' | 'inactive' | 'suspended' | 'locked';

  // Using entity class name string to avoid circular dependency
  // TypeORM will resolve this from the entities array in DataSource
  @OneToMany('RoleAssignment', 'user')
  roleAssignments!: RoleAssignment[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;

  @DeleteDateColumn({ name: 'deleted_at', nullable: true })
  deletedAt!: Date | null;
}


