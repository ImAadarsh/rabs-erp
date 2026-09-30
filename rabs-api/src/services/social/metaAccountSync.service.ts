import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import {
  debugMetaToken,
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  getGrantedPermissions,
  MetaGraphError,
  META_USER_HANDLE,
  metaGraphGet,
  metaGraphGetAll
} from './metaGraph.client.js';
import { metaAccountKind } from './metaAccount.util.js';

type IgAccount = {
  id: string;
  username?: string;
  name?: string;
  profile_picture_url?: string;
  followers_count?: number;
};

type PageNode = {
  id: string;
  name?: string;
  access_token?: string;
  picture?: { data?: { url?: string } };
  instagram_business_account?: IgAccount;
};

type AdAccountNode = {
  id: string;
  name?: string;
  account_status?: number;
  currency?: string;
  amount_spent?: string;
};

async function upsertAccount(
  repo: ReturnType<typeof AppDataSource.getRepository<SocialAccount>>,
  payload: Partial<SocialAccount> & { organizationId: string; platform: string; accountId?: string; accountHandle?: string }
) {
  const where =
    payload.accountHandle === META_USER_HANDLE
      ? { organizationId: payload.organizationId, platform: 'facebook' as const, accountHandle: META_USER_HANDLE }
      : { organizationId: payload.organizationId, platform: payload.platform as any, accountId: payload.accountId || '' };
  const existing = await repo.findOne({ where });
  if (existing) {
    Object.assign(existing, payload, { connectedAt: existing.connectedAt, metadata: { ...(existing.metadata || {}), ...(payload.metadata || {}) } });
    return repo.save(existing);
  }
  return repo.save(repo.create({ ...payload, connectedAt: new Date() }));
}

export async function syncMetaAccountsFromCode(opts: {
  code: string;
  organizationId: string;
  userId: string;
  /** User's Meta Business Manager (may differ from META_BUSINESS_ID). */
  selectedBusinessId?: string;
}): Promise<{ facebook: number; instagram: number; ads: number; granted: string[]; declined: string[] }> {
  const short = await exchangeCodeForToken(opts.code);
  let userToken = short.access_token;
  let expiresIn = short.expires_in;
  try {
    const long = await exchangeForLongLivedToken(short.access_token);
    userToken = long.access_token;
    expiresIn = long.expires_in ?? expiresIn;
  } catch {
    // Keep short-lived token if exchange fails (still usable briefly)
  }

  // Diagnose which permissions the user actually granted vs declined.
  let granted: string[] = [];
  let declined: string[] = [];
  try {
    const perms = await getGrantedPermissions(userToken);
    granted = perms.granted;
    declined = perms.declined;
  } catch {
    // Non-fatal: continue with whatever assets we can read
  }

  const tokenExpiresAt = expiresIn ? new Date(Date.now() + expiresIn * 1000) : undefined;
  const repo = AppDataSource.getRepository(SocialAccount);

  try {
    const me = await metaGraphGet<{ id: string; name?: string }>('/me', userToken, { fields: 'id,name' });
    if (me.id) {
      await upsertAccount(repo, {
        organizationId: opts.organizationId,
        platform: 'facebook',
        accountName: me.name || 'Meta user',
        accountHandle: META_USER_HANDLE,
        accountId: me.id,
        accessToken: userToken,
        tokenExpiresAt,
        isActive: true,
        isVerified: true,
        lastSyncedAt: new Date(),
        connectedById: opts.userId,
        metadata: {
          tokenType: 'user',
          granted,
          declined,
          ...(opts.selectedBusinessId ? { metaBusinessId: opts.selectedBusinessId } : {})
        }
      });
    }
  } catch {
    // User token row is helpful for ads/sync but not required for Pages
  }

  const pages = await metaGraphGetAll<PageNode>('/me/accounts', userToken, {
    fields:
      'id,name,access_token,picture{url},instagram_business_account{id,username,name,profile_picture_url,followers_count}',
    limit: 100
  });

  let facebook = 0;
  let instagram = 0;
  let ads = 0;

  for (const page of pages) {
    if (!page.id || !page.access_token) continue;

    const existingPage = await repo.findOne({
      where: {
        organizationId: opts.organizationId,
        platform: 'facebook',
        accountId: page.id
      }
    });

    const pagePayload: Partial<SocialAccount> = {
      organizationId: opts.organizationId,
      platform: 'facebook',
      accountName: page.name || `Facebook Page ${page.id}`,
      accountHandle: page.name,
      accountId: page.id,
      profileUrl: `https://facebook.com/${page.id}`,
      accessToken: page.access_token,
      tokenExpiresAt,
      isActive: true,
      isVerified: true,
      lastSyncedAt: new Date(),
      connectedById: opts.userId,
      connectedAt: existingPage?.connectedAt || new Date(),
      metadata: {
        ...(existingPage?.metadata || {}),
        tokenType: 'page',
        pageId: page.id,
        userTokenStored: false,
        ...(opts.selectedBusinessId ? { metaBusinessId: opts.selectedBusinessId } : {})
      }
    };

    if (existingPage) {
      Object.assign(existingPage, pagePayload);
      await repo.save(existingPage);
    } else {
      await repo.save(repo.create(pagePayload));
    }
    facebook += 1;

    const ig = page.instagram_business_account;
    if (ig?.id) {
      const existingIg = await repo.findOne({
        where: {
          organizationId: opts.organizationId,
          platform: 'instagram',
          accountId: ig.id
        }
      });

      const igPayload: Partial<SocialAccount> = {
        organizationId: opts.organizationId,
        platform: 'instagram',
        accountName: ig.name || ig.username || `Instagram ${ig.id}`,
        accountHandle: ig.username ? `@${ig.username}` : undefined,
        accountId: ig.id,
        profileUrl: ig.username ? `https://instagram.com/${ig.username}` : undefined,
        accessToken: page.access_token,
        tokenExpiresAt,
        followerCount: ig.followers_count || 0,
        isActive: true,
        isVerified: true,
        lastSyncedAt: new Date(),
        connectedById: opts.userId,
        connectedAt: existingIg?.connectedAt || new Date(),
        metadata: {
          ...(existingIg?.metadata || {}),
          tokenType: 'page_for_ig',
          pageId: page.id,
          igUserId: ig.id,
          profilePictureUrl: ig.profile_picture_url
        }
      };

      if (existingIg) {
        Object.assign(existingIg, igPayload);
        await repo.save(existingIg);
      } else {
        await repo.save(repo.create(igPayload));
      }
      instagram += 1;
    }
  }

  try {
    const adsRes = await metaGraphGet<{ data?: AdAccountNode[] }>('/me/adaccounts', userToken, {
      fields: 'id,name,account_status,currency,amount_spent',
      limit: 100
    });

    for (const ad of adsRes.data || []) {
      if (!ad.id) continue;
      const existingAd = await repo.findOne({
        where: {
          organizationId: opts.organizationId,
          platform: 'facebook',
          accountId: ad.id
        }
      });

      const adPayload: Partial<SocialAccount> = {
        organizationId: opts.organizationId,
        platform: 'facebook',
        accountName: ad.name || ad.id,
        accountHandle: 'ads',
        accountId: ad.id,
        profileUrl: undefined,
        accessToken: userToken,
        tokenExpiresAt,
        isActive: ad.account_status === 1,
        isVerified: true,
        lastSyncedAt: new Date(),
        connectedById: opts.userId,
        connectedAt: existingAd?.connectedAt || new Date(),
        metadata: {
          ...(existingAd?.metadata || {}),
          tokenType: 'user_ads',
          adAccountId: ad.id,
          currency: ad.currency,
          amountSpent: ad.amount_spent,
          accountStatus: ad.account_status
        }
      };

      if (existingAd) {
        Object.assign(existingAd, adPayload);
        await repo.save(existingAd);
      } else {
        await repo.save(repo.create(adPayload));
      }
      ads += 1;
    }
  } catch {
    // Ads permission may be missing — Pages/IG sync still succeeds
  }

  // If nothing was linked, surface a precise reason (usually a consent/asset-grant issue).
  if (facebook === 0 && instagram === 0 && ads === 0) {
    const declinedNote = declined.length ? ` Declined permissions: ${declined.join(', ')}.` : '';
    throw new MetaGraphError(
      'No Facebook Pages, Instagram accounts, or ad accounts were granted to RABS. ' +
        'During Business Login, select the business assets and enable every requested permission. ' +
        'If the assets still cannot be granted, the app likely needs Advanced Access / App Review for those permissions.' +
        declinedNote,
      400
    );
  }

  return { facebook, instagram, ads, granted, declined };
}

export async function refreshMetaAccountsFromStoredTokens(organizationId: string): Promise<{
  refreshed: number;
  discovered: number;
  ads: number;
  errors: string[];
}> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const accounts = await repo.find({ where: { organizationId } });
  const pageWithToken = accounts.find((a) => metaAccountKind(a) === 'page' && a.accessToken);
  const userRow = accounts.find((a) => metaAccountKind(a) === 'user' && a.accessToken);
  const errors: string[] = [];
  let refreshed = 0;
  let discovered = 0;
  let ads = 0;

  const token = userRow?.accessToken || pageWithToken?.accessToken;
  if (!token) {
    throw new MetaGraphError('No stored Meta token. Use Connect Meta first.', 400);
  }

  let grantedPageIds: string[] = [];
  let grantedIgIds: string[] = [];
  try {
    const debug = await debugMetaToken(token);
    grantedPageIds = debug.granular.find((g) => g.scope === 'pages_show_list')?.target_ids || [];
    grantedIgIds = debug.granular.find((g) => g.scope === 'instagram_basic')?.target_ids || [];
  } catch (err: any) {
    errors.push(err?.message || 'debug_token failed');
  }

  for (const account of accounts.filter((a) => a.accessToken && (metaAccountKind(a) === 'page' || metaAccountKind(a) === 'instagram'))) {
    try {
      if (metaAccountKind(account) === 'instagram') {
        const ig = await metaGraphGet<any>(`/${account.accountId}`, account.accessToken!, {
          fields: 'id,username,name,followers_count,profile_picture_url'
        });
        account.accountName = ig.name || ig.username || account.accountName;
        account.accountHandle = ig.username ? `@${ig.username}` : account.accountHandle;
        account.followerCount = ig.followers_count || account.followerCount;
        account.profileUrl = ig.username ? `https://instagram.com/${ig.username}` : account.profileUrl;
        account.metadata = {
          ...(account.metadata || {}),
          profilePictureUrl: ig.profile_picture_url,
          needsReconnect: false
        };
      } else {
        const page = await metaGraphGet<any>(`/${account.accountId}`, account.accessToken!, {
          fields: 'id,name,fan_count,followers_count,link,instagram_business_account{id,username,name,followers_count,profile_picture_url}'
        });
        account.accountName = page.name || account.accountName;
        account.followerCount = page.followers_count || page.fan_count || account.followerCount;
        account.profileUrl = page.link || account.profileUrl;
        account.metadata = { ...(account.metadata || {}), needsReconnect: false };
        const ig = page.instagram_business_account;
        if (ig?.id) {
          await upsertAccount(repo, {
            organizationId,
            platform: 'instagram',
            accountName: ig.name || ig.username || `Instagram ${ig.id}`,
            accountHandle: ig.username ? `@${ig.username}` : undefined,
            accountId: ig.id,
            accessToken: account.accessToken,
            isActive: true,
            isVerified: true,
            lastSyncedAt: new Date(),
            followerCount: ig.followers_count || 0,
            profileUrl: ig.username ? `https://instagram.com/${ig.username}` : undefined,
            metadata: { tokenType: 'page_for_ig', pageId: account.accountId, igUserId: ig.id, profilePictureUrl: ig.profile_picture_url }
          });
        }
      }
      account.lastSyncedAt = new Date();
      await repo.save(account);
      refreshed += 1;
    } catch (err: any) {
      errors.push(`${account.accountName}: ${err?.message || 'refresh failed'}`);
    }
  }

  const knownIds = new Set(accounts.map((a) => a.accountId).filter(Boolean) as string[]);
  for (const pageId of grantedPageIds) {
    if (knownIds.has(pageId)) continue;
    try {
      const page = await metaGraphGet<any>(`/${pageId}`, token, {
        fields: 'id,name,link,instagram_business_account{id,username,name}'
      });
      await upsertAccount(repo, {
        organizationId,
        platform: 'facebook',
        accountName: page.name || `Facebook Page ${pageId}`,
        accountHandle: page.name,
        accountId: pageId,
        profileUrl: page.link,
        isActive: false,
        isVerified: false,
        lastSyncedAt: new Date(),
        metadata: { tokenType: 'page', pageId, needsReconnect: true }
      });
      knownIds.add(pageId);
      discovered += 1;
    } catch (err: any) {
      errors.push(`page ${pageId}: ${err?.message || 'discover failed'}`);
    }
  }

  for (const igId of grantedIgIds) {
    if (knownIds.has(igId)) continue;
    try {
      const ig = await metaGraphGet<any>(`/${igId}`, token, { fields: 'id,username,name,followers_count' });
      await upsertAccount(repo, {
        organizationId,
        platform: 'instagram',
        accountName: ig.name || ig.username || `Instagram ${igId}`,
        accountHandle: ig.username ? `@${ig.username}` : undefined,
        accountId: igId,
        isActive: false,
        isVerified: false,
        lastSyncedAt: new Date(),
        followerCount: ig.followers_count || 0,
        metadata: { tokenType: 'page_for_ig', igUserId: igId, needsReconnect: true }
      });
      knownIds.add(igId);
      discovered += 1;
    } catch (err: any) {
      errors.push(`ig ${igId}: ${err?.message || 'discover failed'}`);
    }
  }

  if (userRow?.accessToken) {
    try {
      const adsRes = await metaGraphGet<{ data?: AdAccountNode[] }>('/me/adaccounts', userRow.accessToken, {
        fields: 'id,name,account_status,currency,amount_spent',
        limit: 100
      });
      for (const ad of adsRes.data || []) {
        if (!ad.id) continue;
        await upsertAccount(repo, {
          organizationId,
          platform: 'facebook',
          accountName: ad.name || ad.id,
          accountHandle: 'ads',
          accountId: ad.id,
          accessToken: userRow.accessToken,
          isActive: ad.account_status === 1,
          isVerified: true,
          lastSyncedAt: new Date(),
          metadata: {
            tokenType: 'user_ads',
            adAccountId: ad.id,
            currency: ad.currency,
            amountSpent: ad.amount_spent,
            accountStatus: ad.account_status,
            needsReconnect: false
          }
        });
        ads += 1;
      }
    } catch (err: any) {
      errors.push(err?.message || 'adaccounts failed');
    }
  }

  return { refreshed, discovered, ads, errors };
}
