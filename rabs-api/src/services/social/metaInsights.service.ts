import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { SocialPost } from '@entities/social/SocialPost.js';
import { MetaGraphError, metaGraphGet } from './metaGraph.client.js';
import { isOrganicMetaAccount, metaAccountKind, requireAccountToken } from './metaAccount.util.js';

/** Metrics confirmed working on this app with pages_read_engagement (Graph v26). */
export const PAGE_INSIGHT_METRICS = [
  'page_media_view',
  'page_post_engagements',
  'page_follows',
  'page_views_total',
  'page_daily_follows',
  'page_daily_follows_unique',
  'page_actions_post_reactions_total',
  'page_video_views',
  'page_total_actions',
  'page_posts_impressions_organic'
] as const;

export type InsightPoint = { endTime: string; value: number };
export type InsightSeries = { name: string; period: string; points: InsightPoint[]; error?: string };

export type AccountInsights = {
  account: { id: string; name: string; platform: string; handle?: string; followerCount?: number };
  preset: string;
  series: InsightSeries[];
  locked?: { message: string; missingPermission?: string };
  profile?: Record<string, unknown>;
};

function presetToSinceUntil(preset: string): { since: string; until: string } {
  const p = preset || 'last_28d';
  const days = p === 'last_7d' ? 7 : p === 'last_90d' || p === 'last_90' ? 90 : 28;
  const until = Math.floor(Date.now() / 1000);
  const since = until - days * 86400;
  return { since: String(since), until: String(until) };
}

async function loadAccount(id: string, organizationId: string): Promise<SocialAccount> {
  const repo = AppDataSource.getRepository(SocialAccount);
  const account = await repo.findOne({ where: { id, organizationId } });
  if (!account) throw new MetaGraphError('Social account not found', 404);
  if (!isOrganicMetaAccount(account)) {
    throw new MetaGraphError('Insights are for Pages and Instagram accounts.', 400);
  }
  if (!account.accessToken) {
    throw new MetaGraphError('Account has no Meta token. Reconnect Meta.', 400);
  }
  return account;
}

export async function fetchAccountInsights(opts: {
  organizationId: string;
  accountId: string;
  preset?: string;
}): Promise<AccountInsights> {
  const account = await loadAccount(opts.accountId, opts.organizationId);
  const token = requireAccountToken(account);
  const preset = opts.preset || 'last_28d';
  const range = presetToSinceUntil(preset);
  const kind = metaAccountKind(account);

  const result: AccountInsights = {
    account: {
      id: account.id,
      name: account.accountName,
      platform: account.platform,
      handle: account.accountHandle,
      followerCount: account.followerCount
    },
    preset,
    series: []
  };

  if (kind === 'instagram') {
    try {
      const profile = await metaGraphGet<any>(`/${account.accountId}`, token, {
        fields: 'id,username,name,followers_count,follows_count,media_count,biography'
      });
      result.profile = {
        username: profile.username,
        followers: profile.followers_count,
        follows: profile.follows_count,
        mediaCount: profile.media_count,
        biography: profile.biography
      };
      account.followerCount = profile.followers_count || account.followerCount;
      await AppDataSource.getRepository(SocialAccount).save(account);
    } catch (err: any) {
      result.profile = { error: err?.message };
    }

    const igMetrics = ['impressions', 'reach', 'follower_count', 'profile_views', 'website_clicks'];
    const series: InsightSeries[] = [];
    let locked: AccountInsights['locked'];
    for (const metric of igMetrics) {
      try {
        const res = await metaGraphGet<{ data?: any[] }>(`/${account.accountId}/insights`, token, {
          metric,
          period: 'day',
          ...range
        });
        for (const row of res.data || []) {
          series.push({
            name: row.name,
            period: row.period || 'day',
            points: (row.values || []).map((v: any) => ({
              endTime: v.end_time,
              value: Number(v.value) || 0
            }))
          });
        }
      } catch (err: any) {
        if (!locked && (err?.code === 10 || String(err?.message || '').includes('instagram_manage_insights'))) {
          locked = {
            message:
              err?.message ||
              'Instagram insights require instagram_manage_insights (Instagram API product + reconnect).',
            missingPermission: 'instagram_manage_insights'
          };
        }
        series.push({ name: metric, period: 'day', points: [], error: err?.message });
      }
    }
    result.series = series.filter((s) => s.points.length > 0);
    if (locked) result.locked = locked;
    if (!result.series.length && !result.locked) {
      result.locked = {
        message:
          'Instagram insights are not granted for this token. Add the Instagram product and instagram_manage_insights, then reconnect.',
        missingPermission: 'instagram_manage_insights'
      };
    }
    return result;
  }

  try {
    const profile = await metaGraphGet<any>(`/${account.accountId}`, token, {
      fields: 'id,name,fan_count,followers_count,link,about'
    });
    result.profile = {
      fanCount: profile.fan_count,
      followers: profile.followers_count,
      link: profile.link,
      about: profile.about
    };
    if (profile.followers_count || profile.fan_count) {
      account.followerCount = profile.followers_count || profile.fan_count || 0;
      await AppDataSource.getRepository(SocialAccount).save(account);
    }
  } catch {
    // profile extras optional
  }

  const series: InsightSeries[] = [];
  for (const metric of PAGE_INSIGHT_METRICS) {
    try {
      const res = await metaGraphGet<{ data?: any[] }>(`/${account.accountId}/insights`, token, {
        metric,
        period: 'day',
        ...range
      });
      const rows = res.data || [];
      if (!rows.length) {
        series.push({ name: metric, period: 'day', points: [] });
      }
      for (const row of rows) {
        series.push({
          name: row.name,
          period: row.period || 'day',
          points: (row.values || []).map((v: any) => ({
            endTime: v.end_time,
            value: Number(v.value) || 0
          }))
        });
      }
    } catch (err: any) {
      series.push({ name: metric, period: 'day', points: [], error: err?.message });
    }
  }
  result.series = series.filter((s) => s.points.length > 0);
  if (!result.series.length) {
    const firstErr = series.find((s) => s.error);
    result.series = series;
    if (firstErr?.error && series.every((s) => !s.points.length)) {
      result.locked = result.locked || {
        message: firstErr.error,
        missingPermission: firstErr.error.includes('read_insights') ? 'read_insights' : undefined
      };
    }
  }
  return result;
}

function metricValue(insights: any[], name: string): number {
  const row = insights.find((m) => m.name === name);
  const values = row?.values;
  if (!Array.isArray(values) || !values.length) return 0;
  const v = values[values.length - 1]?.value;
  return typeof v === 'number' ? v : Number(v) || 0;
}

export async function syncPostInsights(postId: string) {
  const postRepo = AppDataSource.getRepository(SocialPost);
  const post = await postRepo.findOne({
    where: { id: postId },
    relations: ['socialAccount']
  });
  if (!post) throw new MetaGraphError('Post not found', 404);
  if (!post.platformPostId) throw new MetaGraphError('Post has no platform_post_id to sync', 400);
  const account = post.socialAccount;
  if (!account?.accessToken) throw new MetaGraphError('Missing Meta token on account', 400);

  if (account.platform === 'facebook') {
    try {
      const obj = await metaGraphGet<{
        id: string;
        shares?: { count?: number };
      }>(`/${post.platformPostId}`, account.accessToken, {
        fields: 'id,shares'
      });
      post.shares = obj.shares?.count || post.shares || 0;
    } catch {
      // object fields may require pages_read_user_content
    }

    for (const metric of ['post_media_view', 'post_total_media_view_unique', 'post_clicks']) {
      try {
        const insights = await metaGraphGet<{ data?: any[] }>(
          `/${post.platformPostId}/insights`,
          account.accessToken,
          { metric }
        );
        const data = insights.data || [];
        if (metric === 'post_media_view') post.impressions = metricValue(data, 'post_media_view');
        if (metric === 'post_total_media_view_unique') post.reach = metricValue(data, 'post_total_media_view_unique');
        if (metric === 'post_clicks') post.clicks = metricValue(data, 'post_clicks');
      } catch {
        // metric may be invalid for this post
      }
    }
    if (post.reach > 0 && post.clicks) {
      post.engagementRate = Number(((post.clicks / post.reach) * 100).toFixed(4));
    }
  } else if (account.platform === 'instagram') {
    const obj = await metaGraphGet<{
      id: string;
      like_count?: number;
      comments_count?: number;
      permalink?: string;
    }>(`/${post.platformPostId}`, account.accessToken, {
      fields: 'id,like_count,comments_count,permalink'
    });
    post.likes = obj.like_count || 0;
    post.comments = obj.comments_count || 0;
    if (obj.permalink) post.platformPostUrl = obj.permalink;

    try {
      const insights = await metaGraphGet<{ data?: any[] }>(
        `/${post.platformPostId}/insights`,
        account.accessToken,
        { metric: 'reach,views,saved,total_interactions' }
      );
      const data = insights.data || [];
      post.impressions = metricValue(data, 'views') || metricValue(data, 'impressions');
      post.reach = metricValue(data, 'reach');
      const engagement = metricValue(data, 'total_interactions') || metricValue(data, 'engagement');
      if (post.reach > 0) {
        post.engagementRate = Number(((engagement / post.reach) * 100).toFixed(4));
      }
    } catch {
      // IG insights availability varies by media type / permission
    }
  } else {
    throw new MetaGraphError(`Insights not supported for ${account.platform}`, 400);
  }

  return await postRepo.save(post);
}

export async function syncAllPublishedInsights(organizationId: string): Promise<{ synced: number; failed: number }> {
  const postRepo = AppDataSource.getRepository(SocialPost);
  const posts = await postRepo.find({
    where: { organizationId, status: 'published' },
    relations: ['socialAccount']
  });
  let synced = 0;
  let failed = 0;
  for (const p of posts) {
    if (!p.platformPostId) continue;
    try {
      await syncPostInsights(p.id);
      synced += 1;
    } catch {
      failed += 1;
    }
  }
  return { synced, failed };
}
