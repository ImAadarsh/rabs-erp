import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import {
  debugMetaToken,
  MetaGraphError,
  META_ADS_SCOPES
} from './metaGraph.client.js';
import { isOrganicMetaAccount, metaAccountKind } from './metaAccount.util.js';

export type MetaCapability = {
  key: string;
  label: string;
  granted: boolean;
  requiredPermissions: string[];
  product?: string;
  notes?: string;
};

export type MetaCapabilities = {
  tokenValid: boolean;
  tokenType?: string;
  scopes: string[];
  grantedPageIds: string[];
  grantedIgIds: string[];
  capabilities: MetaCapability[];
  missingForPublish: string[];
  missingForAds: string[];
  missingForIgInbox: string[];
  missingForIgInsights: string[];
  accounts: Array<{
    id: string;
    platform: string;
    accountName: string;
    accountHandle?: string;
    accountId?: string;
    kind: string;
    hasToken: boolean;
    needsReconnect?: boolean;
    lastSyncedAt?: Date;
    tokenExpiresAt?: Date;
    followerCount?: number;
  }>;
};

function cap(
  key: string,
  label: string,
  granted: boolean,
  requiredPermissions: string[],
  extra?: Partial<MetaCapability>
): MetaCapability {
  return { key, label, granted, requiredPermissions, ...extra };
}

export async function pickPageToken(organizationId: string): Promise<SocialAccount | null> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const accounts = await repo.find({ where: { organizationId, isActive: true } });
  return (
    accounts.find((a) => metaAccountKind(a) === 'page' && a.accessToken) ||
    accounts.find((a) => isOrganicMetaAccount(a) && a.accessToken) ||
    null
  );
}

export async function getMetaCapabilities(organizationId: string): Promise<MetaCapabilities> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const accounts = await repo.find({
    where: { organizationId },
    order: { createdAt: 'DESC' }
  });
  const userRow = accounts.find((a) => metaAccountKind(a) === 'user' && a.accessToken);
  const pageRow = accounts.find((a) => metaAccountKind(a) === 'page' && a.accessToken);
  let scopes: string[] = [];
  let tokenValid = false;
  let tokenType: string | undefined;
  let grantedPageIds: string[] = [];
  let grantedIgIds: string[] = [];

  // Union user + Page token scopes so extra connects (ads / publish) show up.
  for (const acc of [userRow, pageRow]) {
    if (!acc?.accessToken) continue;
    try {
      const debug = await debugMetaToken(acc.accessToken);
      if (debug.isValid) tokenValid = true;
      if (!tokenType) tokenType = debug.type;
      for (const s of debug.scopes) {
        if (!scopes.includes(s)) scopes.push(s);
      }
      if (!grantedPageIds.length) {
        grantedPageIds = debug.granular.find((g) => g.scope === 'pages_show_list')?.target_ids || [];
      }
      if (!grantedIgIds.length) {
        grantedIgIds = debug.granular.find((g) => g.scope === 'instagram_basic')?.target_ids || [];
      }
    } catch (err: any) {
      if (err instanceof MetaGraphError) {
        // Keep going; UI will prompt reconnect if nothing valid
      }
    }
  }

  const has = (name: string) => scopes.includes(name);

  const capabilities: MetaCapability[] = [
    cap('read_pages', 'List Pages & profiles', has('pages_show_list') || has('business_management'), [
      'pages_show_list',
      'business_management'
    ]),
    cap('read_posts', 'Read Page posts', has('pages_read_engagement') || has('pages_show_list'), [
      'pages_read_engagement'
    ]),
    cap('read_ig_media', 'Read Instagram media', has('instagram_basic'), ['instagram_basic']),
    cap('page_inbox', 'Facebook Page inbox', has('pages_messaging'), ['pages_messaging'], {
      product: 'Messenger'
    }),
    cap('page_insights', 'Page insights (views / follows / engagement)', has('pages_read_engagement'), [
      'pages_read_engagement'
    ]),
    cap('publish_facebook', 'Publish to Facebook Pages', has('pages_manage_posts'), ['pages_manage_posts'], {
      product: 'Pages API',
      notes: 'Default Connect does not request this. Use Enable publishing (classic Facebook Login).'
    }),
    cap('publish_instagram', 'Publish to Instagram', has('instagram_content_publish'), [
      'instagram_content_publish'
    ], {
      product: 'Instagram API',
      notes: 'Default Connect does not request this. Use Enable publishing (classic Facebook Login).'
    }),
    cap('ig_inbox', 'Instagram DMs', has('instagram_manage_messages'), ['instagram_manage_messages'], {
      product: 'Instagram API'
    }),
    cap('ig_insights', 'Instagram insights', has('instagram_manage_insights'), ['instagram_manage_insights'], {
      product: 'Instagram API'
    }),
    cap('ads', 'Ads accounts / campaigns', has('ads_read') || has('ads_management'), ['ads_read'], {
      product: 'Marketing API'
    })
  ];

  return {
    tokenValid,
    tokenType,
    scopes,
    grantedPageIds,
    grantedIgIds,
    capabilities,
    missingForPublish: ['pages_manage_posts', 'instagram_content_publish'].filter((s) => !has(s)),
    missingForAds: [...META_ADS_SCOPES].filter((s) => !has(s)),
    missingForIgInbox: has('instagram_manage_messages') ? [] : ['instagram_manage_messages'],
    missingForIgInsights: has('instagram_manage_insights') ? [] : ['instagram_manage_insights'],
    accounts: accounts.map((a) => {
      const meta = (a.metadata || {}) as Record<string, unknown>;
      return {
        id: a.id,
        platform: a.platform,
        accountName: a.accountName,
        accountHandle: a.accountHandle,
        accountId: a.accountId,
        kind: metaAccountKind(a),
        hasToken: Boolean(a.accessToken),
        needsReconnect: Boolean(meta.needsReconnect),
        lastSyncedAt: a.lastSyncedAt,
        tokenExpiresAt: a.tokenExpiresAt,
        followerCount: a.followerCount
      };
    })
  };
}
