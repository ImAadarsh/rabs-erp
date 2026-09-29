import { AppDataSource } from '@config/data-source.js';
import { CrmSettings } from '@entities/crm/CrmSettings.js';

export async function getOrCreateCrmSettings(organizationId: string): Promise<CrmSettings> {
  const repo = AppDataSource.getRepository(CrmSettings);
  let settings = await repo.findOne({ where: { organizationId } });
  if (!settings) {
    settings = await repo.save(
      repo.create({
        organizationId,
        autoAssignLeads: true,
        autoFollowupOnLead: true,
        lastAssignedUserId: null
      })
    );
  }
  return settings;
}
