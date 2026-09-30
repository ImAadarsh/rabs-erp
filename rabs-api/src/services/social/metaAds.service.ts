import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { MetaGraphError, metaGraphGet } from './metaGraph.client.js';
import { metaAccountKind } from './metaAccount.util.js';

export type MetaCampaignSummary = {
  id: string;
  name: string;
  status: string;
  objective?: string;
  dailyBudget?: string;
  lifetimeBudget?: string;
  insights?: {
    impressions?: number;
    reach?: number;
    clicks?: number;
    spend?: number;
    cpc?: number;
    ctr?: number;
  };
};

export type AdsPermissionState = {
  granted: boolean;
  message?: string;
  missingPermission?: string;
};

function isAdAccount(account: SocialAccount): boolean {
  return metaAccountKind(account) === 'ads';
}

export async function listAdAccounts(organizationId: string): Promise<{
  accounts: SocialAccount[];
  permission: AdsPermissionState;
}> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const accounts = await repo.find({
    where: { organizationId, isActive: true }
  });
  const ads = accounts.filter(isAdAccount);
  if (ads.length) {
    return { accounts: ads, permission: { granted: true } };
  }
  return {
    accounts: [],
    permission: {
      granted: false,
      message:
        'Ads permissions not granted — reconnect after enabling Marketing API (ads_read). Page tokens cannot list ad accounts.',
      missingPermission: 'ads_read'
    }
  };
}

export async function listCampaignsForAdAccount(socialAccountId: string): Promise<MetaCampaignSummary[]> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const account = await repo.findOne({ where: { id: socialAccountId } });
  if (!account || !isAdAccount(account)) {
    throw new MetaGraphError('Not a Meta ad account', 400, { missingPermission: 'ads_read' });
  }
  if (!account.accessToken || !account.accountId) {
    throw new MetaGraphError('Ad account missing token or id. Reconnect Meta.', 400, {
      missingPermission: 'ads_read'
    });
  }

  const actId = account.accountId.startsWith('act_') ? account.accountId : `act_${account.accountId}`;
  let campaigns: { data?: any[] };
  try {
    campaigns = await metaGraphGet<{ data?: any[] }>(`/${actId}/campaigns`, account.accessToken, {
      fields: 'id,name,status,objective,daily_budget,lifetime_budget,effective_status',
      limit: 50
    });
  } catch (err: any) {
    throw new MetaGraphError(
      err?.message || 'Cannot read campaigns. Enable Marketing API and reconnect with ads_read.',
      err?.status || 400,
      { code: err?.code, missingPermission: 'ads_read' }
    );
  }

  const results: MetaCampaignSummary[] = [];
  for (const c of campaigns.data || []) {
    const summary: MetaCampaignSummary = {
      id: c.id,
      name: c.name,
      status: c.effective_status || c.status,
      objective: c.objective,
      dailyBudget: c.daily_budget,
      lifetimeBudget: c.lifetime_budget
    };
    try {
      const insights = await metaGraphGet<{ data?: any[] }>(`/${c.id}/insights`, account.accessToken, {
        fields: 'impressions,reach,clicks,spend,cpc,ctr',
        date_preset: 'last_30d'
      });
      const row = insights.data?.[0];
      if (row) {
        summary.insights = {
          impressions: Number(row.impressions) || 0,
          reach: Number(row.reach) || 0,
          clicks: Number(row.clicks) || 0,
          spend: Number(row.spend) || 0,
          cpc: Number(row.cpc) || 0,
          ctr: Number(row.ctr) || 0
        };
      }
    } catch {
      // insights optional
    }
    results.push(summary);
  }
  return results;
}

export async function listAdSetsForCampaign(socialAccountId: string, campaignId: string) {
  const account = await requireAdAccount(socialAccountId);
  const res = await metaGraphGet<{ data?: any[] }>(`/${campaignId}/adsets`, account.accessToken!, {
    fields: 'id,name,status,effective_status,daily_budget,lifetime_budget,optimization_goal,targeting',
    limit: 50
  });
  const rows = [];
  for (const s of res.data || []) {
    const item: any = {
      id: s.id,
      name: s.name,
      status: s.effective_status || s.status,
      dailyBudget: s.daily_budget,
      lifetimeBudget: s.lifetime_budget,
      optimizationGoal: s.optimization_goal
    };
    try {
      const insights = await metaGraphGet<{ data?: any[] }>(`/${s.id}/insights`, account.accessToken!, {
        fields: 'impressions,reach,clicks,spend,cpc,ctr',
        date_preset: 'last_30d'
      });
      item.insights = insights.data?.[0] || null;
    } catch {
      item.insights = null;
    }
    rows.push(item);
  }
  return rows;
}

export async function listAdsForAdSet(socialAccountId: string, adsetId: string) {
  const account = await requireAdAccount(socialAccountId);
  const res = await metaGraphGet<{ data?: any[] }>(`/${adsetId}/ads`, account.accessToken!, {
    fields: 'id,name,status,effective_status,creative{id,title,body,thumbnail_url,image_url}',
    limit: 50
  });
  const rows = [];
  for (const a of res.data || []) {
    const item: any = {
      id: a.id,
      name: a.name,
      status: a.effective_status || a.status,
      creative: a.creative || null
    };
    try {
      const insights = await metaGraphGet<{ data?: any[] }>(`/${a.id}/insights`, account.accessToken!, {
        fields: 'impressions,reach,clicks,spend,cpc,ctr,ctr,actions',
        date_preset: 'last_30d'
      });
      item.insights = insights.data?.[0] || null;
    } catch {
      item.insights = null;
    }
    rows.push(item);
  }
  return rows;
}

async function requireAdAccount(socialAccountId: string): Promise<SocialAccount> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const account = await repo.findOne({ where: { id: socialAccountId } });
  if (!account || !isAdAccount(account) || !account.accessToken) {
    throw new MetaGraphError(
      'Ads permissions not granted — reconnect after enabling Marketing API (ads_read).',
      400,
      { missingPermission: 'ads_read' }
    );
  }
  return account;
}
