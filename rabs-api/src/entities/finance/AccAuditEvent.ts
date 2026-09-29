import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, JoinColumn, CreateDateColumn } from 'typeorm';
import { Organization } from '../iam/Organization.js';
import { User } from '../iam/User.js';

@Entity({ name: 'acc_audit_events' })
export class AccAuditEvent {
  @PrimaryGeneratedColumn({ type: 'bigint', unsigned: true })
  id!: string;

  @ManyToOne(() => Organization)
  @JoinColumn({ name: 'organization_id' })
  organization!: Organization;

  @Column({ name: 'organization_id', type: 'bigint', unsigned: true })
  organizationId!: string;

  @Column({ name: 'entity_type', type: 'varchar', length: 80 })
  entityType!: string;

  @Column({ name: 'entity_id', type: 'bigint', unsigned: true })
  entityId!: string;

  @Column({
    type: 'enum',
    enum: ['create', 'update', 'post', 'approve', 'void', 'match', 'reconcile', 'submit', 'dispose', 'import']
  })
  action!:
    | 'create'
    | 'update'
    | 'post'
    | 'approve'
    | 'void'
    | 'match'
    | 'reconcile'
    | 'submit'
    | 'dispose'
    | 'import';

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'actor_user_id' })
  actor!: User | null;

  @Column({ name: 'actor_user_id', type: 'bigint', unsigned: true, nullable: true })
  actorUserId!: string | null;

  @Column({ name: 'payload_json', type: 'json', nullable: true })
  payloadJson!: Record<string, unknown> | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
