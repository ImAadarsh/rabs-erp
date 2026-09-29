import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { MetaGraphError, metaGraphGet } from './metaGraph.client.js';
import { isOrganicMetaAccount, metaAccountKind, requireAccountToken } from './metaAccount.util.js';

export type GraphFeedItem = {
  id: string;
  platform: 'facebook' | 'instagram';
  accountId: string;
  accountName: string;
  socialAccountId: string;
  message?: string;
  createdTime?: string;
  permalink?: string;
  mediaType: 'text' | 'image' | 'video' | 'reel' | 'carousel' | 'unknown';
  mediaUrl?: string;
  thumbnailUrl?: string;
  likes?: number;
  comments?: number;
  shares?: number;
  mediaProductType?: string;
};

export type GraphFeedPage = {
  data: GraphFeedItem[];
  paging?: { after?: string; before?: string };
  account: { id: string; name: string; platform: string; handle?: string };
};

function classifyFbPost(p: any): GraphFeedItem['mediaType'] {
  const att = p.attachments?.data?.[0];
  const type = String(att?.media_type || att?.type || p.status_type || '').toLowerCase();
  if (type.includes('album') || type.includes('carousel')) return 'carousel';
  if (type.includes('video') || type.includes('reel')) return type.includes('reel') ? 'reel' : 'video';
  if (type.includes('photo') || type.includes('image') || p.full_picture) return 'image';
  if (p.message) return 'text';
  return 'unknown';
}

function classifyIgMedia(m: any): GraphFeedItem['mediaType'] {
  const product = String(m.media_product_type || '').toUpperCase();
  const type = String(m.media_type || '').toUpperCase();
  if (product === 'REELS' || type === 'REELS') return 'reel';
  if (type === 'CAROUSEL_ALBUM') return 'carousel';
  if (type === 'VIDEO') return 'video';
  if (type === 'IMAGE') return 'image';
  return 'unknown';
}

function matchesMediaFilter(item: GraphFeedItem, mediaType?: string): boolean {
  if (!mediaType || mediaType === 'all') return true;
  if (mediaType === 'short' || mediaType === 'shorts' || mediaType === 'reels') return item.mediaType === 'reel';
  return item.mediaType === mediaType;
}

async function loadOrganicAccount(id: string, organizationId: string): Promise<SocialAccount> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const account = await repo.findOne({ where: { id, organizationId } });
  if (!account) throw new MetaGraphError('Social account not found', 404);
  if (!isOrganicMetaAccount(account)) {
    throw new MetaGraphError('Pick a Facebook Page or Instagram account (not an ad account).', 400);
  }
  if (!account.accessToken) {
    throw new MetaGraphError('This account has no Page token. Reconnect Meta and select this asset.', 400);
  }
  return account;
}

export async function fetchGraphFeed(opts: {
  organizationId: string;
  accountId: string;
  after?: string;
  before?: string;
  limit?: number;
  mediaType?: string;
  since?: string;
  until?: string;
}): Promise<GraphFeedPage> {
  const account = await loadOrganicAccount(opts.accountId, opts.organizationId);
  const token = requireAccountToken(account);
  const limit = Math.min(Math.max(opts.limit || 25, 1), 50);
  const fetchLimit = opts.mediaType && opts.mediaType !== 'all' ? 50 : limit;
  const kind = metaAccountKind(account);

  if (kind === 'instagram') {
    const params: Record<string, string | number | undefined> = {
      fields:
        'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url,username',
      limit: fetchLimit,
      after: opts.after,
      before: opts.before
    };
    const res = await metaGraphGet<{ data?: any[]; paging?: { cursors?: { after?: string; before?: string } } }>(
      `/${account.accountId}/media`,
      token,
      params
    );
    const data = (res.data || [])
      .map((m) => {
        const item: GraphFeedItem = {
          id: m.id,
          platform: 'instagram',
          accountId: account.accountId || '',
          accountName: account.accountName,
          socialAccountId: account.id,
          message: m.caption,
          createdTime: m.timestamp,
          permalink: m.permalink,
          mediaType: classifyIgMedia(m),
          mediaUrl: m.media_url,
          thumbnailUrl: m.thumbnail_url || m.media_url,
          likes: m.like_count,
          comments: m.comments_count,
          mediaProductType: m.media_product_type
        };
        return item;
      })
      .filter((item) => matchesMediaFilter(item, opts.mediaType))
      .filter((item) => inDateRange(item.createdTime, opts.since, opts.until));

    return {
      data,
      paging: res.paging?.cursors,
      account: {
        id: account.id,
        name: account.accountName,
        platform: account.platform,
        handle: account.accountHandle
      }
    };
  }

  const params: Record<string, string | number | undefined> = {
    fields:
      'id,message,created_time,permalink_url,full_picture,status_type,is_published,shares,attachments{media_type,type,url,media,subattachments}',
    limit,
    after: opts.after,
    before: opts.before
  };
  if (opts.since) params.since = unixMaybe(opts.since);
  if (opts.until) params.until = unixMaybe(opts.until);

  const res = await metaGraphGet<{ data?: any[]; paging?: { cursors?: { after?: string; before?: string } } }>(
    `/${account.accountId}/posts`,
    token,
    params
  );
  const data = (res.data || [])
    .map((p) => {
      const att = p.attachments?.data?.[0];
      const item: GraphFeedItem = {
        id: p.id,
        platform: 'facebook',
        accountId: account.accountId || '',
        accountName: account.accountName,
        socialAccountId: account.id,
        message: p.message,
        createdTime: p.created_time,
        permalink: p.permalink_url,
        mediaType: classifyFbPost(p),
        mediaUrl: att?.media?.image?.src || att?.url || p.full_picture,
        thumbnailUrl: p.full_picture,
        shares: p.shares?.count
      };
      return item;
    })
    .filter((item) => matchesMediaFilter(item, opts.mediaType));

  return {
    data,
    paging: res.paging?.cursors,
    account: {
      id: account.id,
      name: account.accountName,
      platform: account.platform,
      handle: account.accountHandle
    }
  };
}

export async function fetchGraphPostDetail(opts: {
  organizationId: string;
  accountId: string;
  postId: string;
}): Promise<GraphFeedItem & { insights?: Record<string, number>; graphError?: string }> {
  const account = await loadOrganicAccount(opts.accountId, opts.organizationId);
  const token = requireAccountToken(account);
  const kind = metaAccountKind(account);

  if (kind === 'instagram') {
    const m = await metaGraphGet<any>(`/${opts.postId}`, token, {
      fields:
        'id,caption,media_type,media_product_type,permalink,timestamp,like_count,comments_count,thumbnail_url,media_url,username'
    });
    const item: GraphFeedItem & { insights?: Record<string, number> } = {
      id: m.id,
      platform: 'instagram',
      accountId: account.accountId || '',
      accountName: account.accountName,
      socialAccountId: account.id,
      message: m.caption,
      createdTime: m.timestamp,
      permalink: m.permalink,
      mediaType: classifyIgMedia(m),
      mediaUrl: m.media_url,
      thumbnailUrl: m.thumbnail_url || m.media_url,
      likes: m.like_count,
      comments: m.comments_count,
      mediaProductType: m.media_product_type
    };
    try {
      const insights = await metaGraphGet<{ data?: any[] }>(`/${opts.postId}/insights`, token, {
        metric: 'likes,comments,shares,saved,reach,views,total_interactions'
      });
      item.insights = Object.fromEntries(
        (insights.data || []).map((row) => [row.name, Number(row.values?.[row.values.length - 1]?.value) || 0])
      );
    } catch (err: any) {
      (item as any).graphError = err?.message;
    }
    return item;
  }

  const p = await metaGraphGet<any>(`/${opts.postId}`, token, {
    fields: 'id,message,created_time,permalink_url,full_picture,status_type,shares,attachments{media_type,type,url,media}'
  });
  const att = p.attachments?.data?.[0];
  const item: GraphFeedItem & { insights?: Record<string, number>; graphError?: string } = {
    id: p.id,
    platform: 'facebook',
    accountId: account.accountId || '',
    accountName: account.accountName,
    socialAccountId: account.id,
    message: p.message,
    createdTime: p.created_time,
    permalink: p.permalink_url,
    mediaType: classifyFbPost(p),
    mediaUrl: att?.media?.image?.src || att?.url || p.full_picture,
    thumbnailUrl: p.full_picture,
    shares: p.shares?.count
  };

  const insightMetrics = [
    'post_media_view',
    'post_total_media_view_unique',
    'post_clicks',
    'post_reactions_by_type_total',
    'post_activity_by_action_type'
  ];
  const insights: Record<string, number> = {};
  for (const metric of insightMetrics) {
    try {
      const res = await metaGraphGet<{ data?: any[] }>(`/${opts.postId}/insights`, token, { metric });
      for (const row of res.data || []) {
        const v = row.values?.[row.values.length - 1]?.value;
        insights[row.name] = typeof v === 'number' ? v : Number(v) || 0;
      }
    } catch {
      // metric not available for this post / token
    }
  }
  if (Object.keys(insights).length) item.insights = insights;
  return item;
}

function unixMaybe(isoOrUnix: string): string {
  if (/^\d+$/.test(isoOrUnix)) return isoOrUnix;
  const t = Date.parse(isoOrUnix);
  return Number.isFinite(t) ? String(Math.floor(t / 1000)) : isoOrUnix;
}

function inDateRange(iso: string | undefined, since?: string, until?: string): boolean {
  if (!iso) return true;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return true;
  if (since && t < Date.parse(since) && !/^\d+$/.test(since)) return false;
  if (until && t > Date.parse(until) && !/^\d+$/.test(until)) return false;
  return true;
}
