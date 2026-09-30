import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { SocialPost } from '@entities/social/SocialPost.js';
import { MetaGraphError, metaGraphGet, metaGraphPost, metaGraphDelete } from './metaGraph.client.js';
import { isPublicHttpsUrl, probePublicUrl } from './socialMediaUrl.js';

function requireToken(account: SocialAccount): string {
  if (!account.accessToken) {
    throw new MetaGraphError('Account has no Meta access token. Reconnect via Connect Meta.', 400);
  }
  return account.accessToken;
}

function mediaList(post: SocialPost): string[] {
  const raw = post.mediaUrls;
  let urls: string[] = [];
  if (!raw) urls = [];
  else if (Array.isArray(raw)) urls = raw.map(String).filter(Boolean);
  else if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw);
      urls = Array.isArray(parsed) ? parsed.map(String).filter(Boolean) : [raw];
    } catch {
      urls = [raw];
    }
  }
  return urls.map((u) => u.trim()).filter((u) => isPublicHttpsUrl(u));
}

async function requireFetchableMediaUrl(url: string): Promise<string> {
  if (!isPublicHttpsUrl(url)) {
    throw new MetaGraphError(
      'Media URL is not a public https:// address. Upload a file in Composer instead of pasting a local or relative path.',
      400
    );
  }
  const probe = await probePublicUrl(url);
  if (!probe.ok) {
    throw new MetaGraphError(
      `Media URL is not publicly fetchable (HTTP ${probe.status || 'unreachable'}). Meta requires a public HTTPS URL.`,
      400
    );
  }
  return url;
}

function isVideoUrl(url: string, postType?: string): boolean {
  if (postType === 'reel' || postType === 'video') return true;
  return /\.(mp4|mov|webm)(\?|$)/i.test(url);
}

async function waitForIgContainer(containerId: string, token: string, video: boolean) {
  const attempts = video ? 40 : 8;
  const delayMs = video ? 3000 : 1000;
  for (let i = 0; i < attempts; i += 1) {
    try {
      const status = await metaGraphGet<{ status_code?: string; status?: string }>(
        `/${containerId}`,
        token,
        { fields: 'status_code,status' }
      );
      const code = String(status.status_code || '').toUpperCase();
      if (code === 'FINISHED' || code === 'PUBLISHED') return;
      if (code === 'ERROR' || code === 'EXPIRED') {
        throw new MetaGraphError(status.status || 'Instagram media container failed', 400);
      }
      if (!code && !video) return;
    } catch (err: any) {
      if (err instanceof MetaGraphError && (err.message || '').includes('container failed')) throw err;
      if (!video) return;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
  if (video) {
    throw new MetaGraphError('Instagram is still processing this video. Try publishing again in a minute.', 400);
  }
}

async function publishFacebook(account: SocialAccount, post: SocialPost) {
  const token = requireToken(account);
  const pageId = account.accountId;
  if (!pageId) throw new MetaGraphError('Facebook account is missing page id', 400);

  const medias = mediaList(post);
  const message = [post.content, post.hashtags].filter(Boolean).join('\n\n');
  const link = isPublicHttpsUrl(post.linkUrl) ? String(post.linkUrl).trim() : undefined;

  if (medias.length === 0) {
    if (!message && !link) {
      throw new MetaGraphError('Facebook text posts need a caption (or attach an image).', 400);
    }
    const feedBody: Record<string, string | number | boolean | undefined | null> = {};
    if (message) feedBody.message = message;
    if (link) feedBody.link = link;
    const res = await metaGraphPost<{ id: string }>(`/${pageId}/feed`, token, feedBody);
    return {
      platformPostId: res.id,
      platformPostUrl: `https://facebook.com/${res.id}`
    };
  }

  if (medias.length === 1 && isVideoUrl(medias[0], post.postType)) {
    const videoUrl = await requireFetchableMediaUrl(medias[0]);
    const res = await metaGraphPost<{ id: string }>(`/${pageId}/videos`, token, {
      file_url: videoUrl,
      description: message || undefined
    });
    return {
      platformPostId: res.id,
      platformPostUrl: `https://facebook.com/${res.id}`
    };
  }

  if (medias.length === 1) {
    const photoUrl = await requireFetchableMediaUrl(medias[0]);
    const res = await metaGraphPost<{ id: string; post_id?: string }>(`/${pageId}/photos`, token, {
      url: photoUrl,
      caption: message || undefined,
      published: true
    });
    const id = res.post_id || res.id;
    return {
      platformPostId: id,
      platformPostUrl: `https://facebook.com/${id}`
    };
  }

  // Multi-photo: upload unpublished then create feed with attached_media[n]
  const formBody: Record<string, string | number | boolean | undefined | null> = {};
  if (message) formBody.message = message;
  let i = 0;
  for (const url of medias.slice(0, 10)) {
    const photoUrl = await requireFetchableMediaUrl(url);
    const photo = await metaGraphPost<{ id: string }>(`/${pageId}/photos`, token, {
      url: photoUrl,
      published: false
    });
    formBody[`attached_media[${i}]`] = JSON.stringify({ media_fbid: photo.id });
    i += 1;
  }
  const feed = await metaGraphPost<{ id: string }>(`/${pageId}/feed`, token, formBody);
  return {
    platformPostId: feed.id,
    platformPostUrl: `https://facebook.com/${feed.id}`
  };
}

async function publishInstagram(account: SocialAccount, post: SocialPost) {
  const token = requireToken(account);
  const igUserId = account.accountId;
  if (!igUserId) throw new MetaGraphError('Instagram account is missing IG user id', 400);

  const medias = mediaList(post);
  const caption = [post.content, post.hashtags].filter(Boolean).join('\n\n');

  if (medias.length === 0) {
    throw new MetaGraphError('Instagram requires an image or video', 400);
  }

  if (isVideoUrl(medias[0], post.postType) && medias.length === 1) {
    const videoUrl = await requireFetchableMediaUrl(medias[0]);
    const container = await metaGraphPost<{ id: string }>(`/${igUserId}/media`, token, {
      video_url: videoUrl,
      caption: caption || undefined,
      media_type: 'REELS'
    });
    await waitForIgContainer(container.id, token, true);
    const published = await metaGraphPost<{ id: string }>(`/${igUserId}/media_publish`, token, {
      creation_id: container.id
    });
    return {
      platformPostId: published.id,
      platformPostUrl: `https://www.instagram.com/p/${published.id}/`
    };
  }

  if (medias.length === 1) {
    const imageUrl = await requireFetchableMediaUrl(medias[0]);
    const container = await metaGraphPost<{ id: string }>(`/${igUserId}/media`, token, {
      image_url: imageUrl,
      caption: caption || undefined
    });
    await waitForIgContainer(container.id, token, false);
    const published = await metaGraphPost<{ id: string }>(`/${igUserId}/media_publish`, token, {
      creation_id: container.id
    });
    return {
      platformPostId: published.id,
      platformPostUrl: account.accountHandle
        ? `https://instagram.com/${String(account.accountHandle).replace(/^@/, '')}`
        : `https://www.instagram.com/`
    };
  }

  // Carousel
  const children: string[] = [];
  for (const url of medias.slice(0, 10)) {
    const fetchable = await requireFetchableMediaUrl(url);
    const video = isVideoUrl(fetchable);
    const child = await metaGraphPost<{ id: string }>(`/${igUserId}/media`, token, {
      is_carousel_item: true,
      ...(video ? { video_url: fetchable, media_type: 'VIDEO' } : { image_url: fetchable })
    });
    await waitForIgContainer(child.id, token, video);
    children.push(child.id);
  }
  const container = await metaGraphPost<{ id: string }>(`/${igUserId}/media`, token, {
    media_type: 'CAROUSEL',
    caption: caption || undefined,
    children: children.join(',')
  });
  await waitForIgContainer(container.id, token, false);
  const published = await metaGraphPost<{ id: string }>(`/${igUserId}/media_publish`, token, {
    creation_id: container.id
  });
  return {
    platformPostId: published.id,
    platformPostUrl: `https://www.instagram.com/`
  };
}

export async function publishSocialPost(postId: string): Promise<SocialPost> {
  const postRepo = AppDataSource.getRepository(SocialPost);
  const post = await postRepo.findOne({
    where: { id: postId },
    relations: ['socialAccount']
  });
  if (!post) throw new MetaGraphError('Post not found', 404);
  if (!post.socialAccount) throw new MetaGraphError('Post has no linked social account', 400);

  const account = post.socialAccount;
  if (!['facebook', 'instagram'].includes(account.platform)) {
    throw new MetaGraphError(`Publishing not supported for platform: ${account.platform}`, 400);
  }
  if (account.accountHandle === 'ads') {
    throw new MetaGraphError('Cannot publish organic posts to an ad account. Pick a Page or Instagram account.', 400);
  }

  try {
    const result =
      account.platform === 'instagram'
        ? await publishInstagram(account, post)
        : await publishFacebook(account, post);

    post.platformPostId = result.platformPostId;
    post.platformPostUrl = result.platformPostUrl;
    post.status = 'published';
    post.publishedAt = new Date();
    post.failureReason = undefined;
    return await postRepo.save(post);
  } catch (err: any) {
    post.status = 'failed';
    post.failureReason = err?.message || 'Publish failed';
    await postRepo.save(post);
    throw err;
  }
}

export async function editPublishedPost(postId: string, content: string): Promise<SocialPost> {
  const postRepo = AppDataSource.getRepository(SocialPost);
  const post = await postRepo.findOne({
    where: { id: postId },
    relations: ['socialAccount']
  });
  if (!post) throw new MetaGraphError('Post not found', 404);
  if (!post.platformPostId) throw new MetaGraphError('Post is not published on Meta yet', 400);
  const account = post.socialAccount;
  if (!account?.accessToken) throw new MetaGraphError('Missing Meta token', 400);

  if (account.platform === 'instagram') {
    throw new MetaGraphError(
      'Instagram does not allow full post edits via API after publish. Update locally or delete and republish.',
      400
    );
  }

  await metaGraphPost(`/${post.platformPostId}`, account.accessToken, { message: content });
  post.content = content;
  return await postRepo.save(post);
}

export async function publishNowToAccounts(opts: {
  organizationId: string;
  userId?: string | null;
  accountIds: string[];
  content: string;
  postType?: string;
  mediaUrls?: string[];
  linkUrl?: string;
  hashtags?: string;
}): Promise<
  Array<{
    accountId: string;
    accountName?: string;
    platform?: string;
    ok: boolean;
    post?: SocialPost;
    error?: string;
    missingPermission?: string;
  }>
> {
  const accountRepo = AppDataSource.getRepository(SocialAccount);
  const postRepo = AppDataSource.getRepository(SocialPost);
  const results = [];
  for (const accountId of opts.accountIds) {
    const account = await accountRepo.findOne({ where: { id: accountId, organizationId: opts.organizationId } });
    if (!account) {
      results.push({ accountId, ok: false, error: 'Account not found' });
      continue;
    }
    const mediaUrls = (opts.mediaUrls || []).map((u) => String(u).trim()).filter((u) => isPublicHttpsUrl(u));
    const linkUrl = isPublicHttpsUrl(opts.linkUrl) ? String(opts.linkUrl).trim() : undefined;
    const inferredType =
      opts.postType && opts.postType !== 'text'
        ? opts.postType
        : mediaUrls.length === 0
          ? 'text'
          : mediaUrls.length > 1
            ? 'carousel'
            : /\.(mp4|mov|webm)(\?|$)/i.test(mediaUrls[0])
              ? 'video'
              : 'image';
    const post = postRepo.create({
      organizationId: opts.organizationId,
      socialAccountId: account.id,
      postType: inferredType as any,
      content: opts.content || '',
      mediaUrls: mediaUrls.length ? mediaUrls : undefined,
      linkUrl: linkUrl,
      hashtags: opts.hashtags,
      status: 'draft',
      createdById: opts.userId || undefined
    });
    const saved = await postRepo.save(post);
    try {
      const published = await publishSocialPost(saved.id);
      results.push({
        accountId,
        accountName: account.accountName,
        platform: account.platform,
        ok: true,
        post: published
      });
    } catch (err: any) {
      results.push({
        accountId,
        accountName: account.accountName,
        platform: account.platform,
        ok: false,
        error: err?.message || 'Publish failed',
        missingPermission: err?.missingPermission
      });
    }
  }
  return results;
}

export async function deletePublishedPost(postId: string): Promise<SocialPost> {
  const postRepo = AppDataSource.getRepository(SocialPost);
  const post = await postRepo.findOne({
    where: { id: postId },
    relations: ['socialAccount']
  });
  if (!post) throw new MetaGraphError('Post not found', 404);
  const account = post.socialAccount;
  if (post.platformPostId && account?.accessToken) {
    try {
      await metaGraphDelete(`/${post.platformPostId}`, account.accessToken);
    } catch {
      // Soft-delete locally even if remote delete fails
    }
  }
  post.status = 'deleted';
  return await postRepo.save(post);
}
