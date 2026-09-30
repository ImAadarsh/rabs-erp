import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from './Organization.js';
import { User } from './User.js';

@Entity({ name: 'api_keys' })
export class ApiKey {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'name', type: 'varchar', length: 255 })
  name!: string;

  @Column({ name: 'key_hash', type: 'varchar', length: 255, unique: true })
  keyHash!: string;

  @Column({ name: 'key_prefix', type: 'varchar', length: 20, nullable: true })
  keyPrefix!: string | null;

  @Column({ type: 'json', nullable: true })
  scopes!: any | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'created_by' })
  createdBy!: User | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamp' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamp' })
  updatedAt!: Date;
}


