import { AppDataSource } from '@config/data-source.js';
import { AccAuditEvent } from '@entities/finance/AccAuditEvent.js';

export type AccAuditAction =
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

/** Append-only accounting audit — never update/delete rows. */
export async function appendAccAudit(input: {
  organizationId: string;
  entityType: string;
  entityId: string;
  action: AccAuditAction;
  actorUserId?: string | null;
  payload?: Record<string, unknown> | null;
}): Promise<void> {
  const repo = AppDataSource.getRepository(AccAuditEvent);
  await repo.save(
    repo.create({
      organizationId: input.organizationId,
      entityType: input.entityType,
      entityId: input.entityId,
      action: input.action,
      actorUserId: input.actorUserId ?? null,
      payloadJson: input.payload ?? null
    })
  );
}
