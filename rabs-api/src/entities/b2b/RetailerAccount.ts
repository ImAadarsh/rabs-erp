import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { Customer } from '../orders/Customer.js';

@Entity({ name: 'retailer_accounts' })
export class RetailerAccount {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @ManyToOne(() => Customer)
  @JoinColumn({ name: 'customer_id' })
  customer!: Customer;

  @Column({ type: 'varchar', length: 255 })
  email!: string;

  @Column({ name: 'password_hash', type: 'varchar', length: 255 })
  passwordHash!: string;

  /** Never serialize credentials into API JSON. */
  toJSON(): Record<string, unknown> {
    const { passwordHash: _passwordHash, ...safe } = this as RetailerAccount & Record<string, unknown>;
    return safe;
  }

  @Column({ type: 'enum', enum: ['active', 'invited', 'disabled'], default: 'active' })
  status!: 'active' | 'invited' | 'disabled';

  @Column({ name: 'last_login_at', type: 'timestamp', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
