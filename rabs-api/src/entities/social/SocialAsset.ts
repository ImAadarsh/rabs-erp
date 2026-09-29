import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';

@Entity('social_assets')
export class SocialAsset {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @ManyToOne(() => Organization, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'asset_name', type: 'varchar', length: 255 })
  assetName!: string;

  @Column({ name: 'asset_type', type: 'enum', enum: ['image', 'video', 'gif', 'document'] })
  assetType!: string;

  @Column({ name: 'file_url', type: 'varchar', length: 1000 })
  fileUrl!: string;

  @Column({ name: 'file_size', type: 'int', nullable: true })
  fileSize?: number;

  @Column({ name: 'mime_type', type: 'varchar', length: 100, nullable: true })
  mimeType?: string;

  @Column({ type: 'int', nullable: true })
  width?: number;

  @Column({ type: 'int', nullable: true })
  height?: number;

  @Column({ name: 'duration_seconds', type: 'int', nullable: true })
  durationSeconds?: number;

  @Column({ name: 'alt_text', type: 'varchar', length: 500, nullable: true })
  altText?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  tags?: string;

  @Column({ name: 'usage_rights', type: 'enum', enum: ['owned', 'licensed', 'public_domain', 'user_generated'], default: 'owned' })
  usageRights!: string;

  @Column({ name: 'expiry_date', type: 'date', nullable: true })
  expiryDate?: Date;

  @Column({ name: 'uploaded_by', type: 'bigint', unsigned: true, nullable: true })
  uploadedById?: string | null;

  @ManyToOne(() => User, { nullable: true, onDelete: 'SET NULL' })
  @JoinColumn({ name: 'uploaded_by' })
  uploadedBy?: User;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
