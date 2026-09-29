import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn
} from 'typeorm';
import { CrmTag } from './CrmTag.js';

@Entity({ name: 'crm_taggables' })
export class CrmTaggable {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @Column({ name: 'tag_id', type: 'bigint', unsigned: true })
  tagId!: string;

  @ManyToOne(() => CrmTag, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'tag_id' })
  tag!: CrmTag;

  @Column({ name: 'entity_type', type: 'enum', enum: ['account', 'lead', 'deal'] })
  entityType!: 'account' | 'lead' | 'deal';

  @Column({ name: 'entity_id', type: 'bigint', unsigned: true })
  entityId!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
