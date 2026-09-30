import { In } from 'typeorm';
import { AppDataSource } from '@config/data-source.js';
import { CrmTag } from '@entities/crm/CrmTag.js';
import { CrmTaggable } from '@entities/crm/CrmTaggable.js';

export type CrmTagEntityType = 'account' | 'lead' | 'deal';

export async function listTagsForEntities(
  entityType: CrmTagEntityType,
  entityIds: string[]
): Promise<Map<string, CrmTag[]>> {
  const map = new Map<string, CrmTag[]>();
  if (!entityIds.length) return map;
  const rows = await AppDataSource.getRepository(CrmTaggable).find({
    where: { entityType, entityId: In(entityIds) },
    relations: ['tag']
  });
  for (const row of rows) {
    const list = map.get(row.entityId) || [];
    if (row.tag) list.push(row.tag);
    map.set(row.entityId, list);
  }
  return map;
}

export async function attachTag(opts: {
  organizationId: string;
  entityType: CrmTagEntityType;
  entityId: string;
  tagId?: string;
  name?: string;
  color?: string | null;
}): Promise<{ tag: CrmTag; link: CrmTaggable }> {
  const tagRepo = AppDataSource.getRepository(CrmTag);
  const linkRepo = AppDataSource.getRepository(CrmTaggable);

  let tag: CrmTag | null = null;
  if (opts.tagId) {
    tag = await tagRepo.findOne({ where: { id: opts.tagId, organizationId: opts.organizationId } });
  } else if (opts.name) {
    const name = opts.name.trim();
    tag = await tagRepo.findOne({ where: { organizationId: opts.organizationId, name } });
    if (!tag) {
      tag = await tagRepo.save(
        tagRepo.create({
          organizationId: opts.organizationId,
          name,
          color: opts.color ?? null
        })
      );
    }
  }
  if (!tag) {
    throw Object.assign(new Error('tagId or name required'), { status: 400 });
  }

  let link = await linkRepo.findOne({
    where: { tagId: tag.id, entityType: opts.entityType, entityId: opts.entityId }
  });
  if (!link) {
    link = await linkRepo.save(
      linkRepo.create({
        tagId: tag.id,
        entityType: opts.entityType,
        entityId: opts.entityId
      })
    );
  }
  return { tag, link };
}

export async function detachTag(opts: {
  entityType: CrmTagEntityType;
  entityId: string;
  tagId: string;
}): Promise<boolean> {
  const linkRepo = AppDataSource.getRepository(CrmTaggable);
  const link = await linkRepo.findOne({
    where: { tagId: opts.tagId, entityType: opts.entityType, entityId: opts.entityId }
  });
  if (!link) return false;
  await linkRepo.remove(link);
  return true;
}
