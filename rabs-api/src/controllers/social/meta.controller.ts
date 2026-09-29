import { Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@config/env.js';
import {
  assertMetaConfigured,
  buildMetaOAuthUrl,
  MetaGraphError,
  extraScopesForIntent,
  META_ADS_SCOPES,
  META_PUBLISH_SCOPES,
  metaErrorBody,
  resolveMetaOAuthScopes,
  sanitizeSocialAccount
} from '@services/social/metaGraph.client.js';
import {
  refreshMetaAccountsFromStoredTokens,
  syncMetaAccountsFromCode
} from '@services/social/metaAccountSync.service.js';
import {
  deletePublishedPost,
  editPublishedPost,
  publishNowToAccounts,
  publishSocialPost
} from '@services/social/metaPublish.service.js';
import { fetchAccountInsights, syncAllPublishedInsights, syncPostInsights } from '@services/social/metaInsights.service.js';
import { fetchMetaInbox, fetchMetaThread, ingestWebhookPayload, sendMetaMessage } from '@services/social/metaMessaging.service.js';
import {
  listAdAccounts,
  listAdSetsForCampaign,
  listAdsForAdSet,
  listCampaignsForAdAccount
} from '@services/social/metaAds.service.js';
import { fetchGraphFeed, fetchGraphPostDetail } from '@services/social/metaFeed.service.js';
import { getMetaCapabilities } from '@services/social/metaCapabilities.service.js';
import { AppDataSource } from '@config/data-source.js';
import { SocialAccount } from '@entities/social/SocialAccount.js';
import { uploadSocialPostMedia } from '@utils/storage.js';
import { isPublicHttpsUrl } from '@services/social/socialMediaUrl.js';
import { z } from 'zod';

type AuthPayload = { sub: string; orgId: string; roles: string[] };

function sendMetaError(res: Response, error: any) {
  const status = error instanceof MetaGraphError ? error.status : 500;
  res.status(status).json(metaErrorBody(error));
}

function getAuth(req: Request): AuthPayload {
  const auth = (req as any).auth as AuthPayload | undefined;
  if (!auth?.sub || !auth?.orgId) {
    throw new MetaGraphError('Unauthorized', 401);
  }
  return auth;
}

function panelsRedirect(path: string, params: Record<string, string>) {
  const base = env.FRONTEND_URL.replace(/\/$/, '');
  const u = new URL(`${base}${path.startsWith('/') ? path : `/${path}`}`);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

export class MetaController {
  /** GET /api/social/meta/connect — returns OAuth URL */
  static async connect(req: Request, res: Response) {
    try {
      assertMetaConfigured();
      const auth = getAuth(req);
      const state = jwt.sign(
        { typ: 'meta_oauth', orgId: auth.orgId, userId: auth.sub },
        env.JWT_ACCESS_SECRET,
        { expiresIn: '30m' }
      );
      const intent = String(req.query.intent || 'default');
      const extraScopes = extraScopesForIntent(intent);
      const authUrl = buildMetaOAuthUrl(state, {
        extraScopes,
        rerequest: extraScopes.length > 0
      });
      res.json({
        data: {
          authUrl,
          redirectUri: env.META_REDIRECT_URI,
          oauthScopes: resolveMetaOAuthScopes(extraScopes),
          intent,
          extraScopes,
          dialog: 'facebook_login',
          configIdConfigured: Boolean(env.META_LOGIN_CONFIG_ID),
          configIdInDialog: false,
          webhookUrl: `${env.META_API_PUBLIC_URL.replace(/\/$/, '')}/api/social/meta/webhook`
        }
      });
    } catch (error: any) {
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  /** GET/POST /api/social/meta/callback — Meta OAuth redirect (public) */
  static async oauthCallback(req: Request, res: Response) {
    const src: Record<string, unknown> = {
      ...(typeof req.query === 'object' && req.query ? req.query : {}),
      ...(typeof req.body === 'object' && req.body ? req.body : {})
    };
    const code = src.code;
    const state = src.state;
    const error = src.error;
    const error_description = src.error_description || src.error_message;
    const selectedBusinessId =
      typeof src.selected_business_id === 'string' ? src.selected_business_id : undefined;

    console.info('[meta-oauth-callback]', {
      method: req.method,
      hasCode: Boolean(code),
      hasState: Boolean(state),
      error: error ? String(error) : undefined,
      errorDescription: error_description ? String(error_description) : undefined,
      selectedBusinessId: selectedBusinessId || undefined
    });

    if (error) {
      res.redirect(
        panelsRedirect('/social/accounts', {
          meta: 'error',
          message: String(error_description || error)
        })
      );
      return;
    }
    if (!code || typeof code !== 'string' || !state || typeof state !== 'string') {
      res.redirect(
        panelsRedirect('/social/accounts', {
          meta: 'error',
          message: 'Missing authorization code'
        })
      );
      return;
    }
    try {
      const payload = jwt.verify(state, env.JWT_ACCESS_SECRET) as {
        typ?: string;
        orgId: string;
        userId: string;
      };
      if (payload.typ !== 'meta_oauth' || !payload.orgId || !payload.userId) {
        throw new MetaGraphError('Invalid OAuth state', 400);
      }
      const counts = await syncMetaAccountsFromCode({
        code,
        organizationId: payload.orgId,
        userId: payload.userId,
        selectedBusinessId
      });
      res.redirect(
        panelsRedirect('/social/accounts', {
          meta: 'connected',
          facebook: String(counts.facebook),
          instagram: String(counts.instagram),
          ads: String(counts.ads),
          declined: (counts.declined || []).join(',')
        })
      );
    } catch (err: any) {
      console.error('Meta OAuth callback error:', err?.message || err);
      res.redirect(
        panelsRedirect('/social/accounts', {
          meta: 'error',
          message: err?.message || 'Meta connect failed'
        })
      );
    }
  }

  /** GET webhook verification */
  static async webhookVerify(req: Request, res: Response) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];
    if (mode === 'subscribe' && token && token === env.META_WEBHOOK_VERIFY_TOKEN) {
      res.status(200).send(String(challenge || ''));
      return;
    }
    res.status(403).json({ error: { message: 'Webhook verification failed' } });
  }

  /** POST webhook events */
  static async webhookReceive(req: Request, res: Response) {
    try {
      // Always 200 quickly so Meta doesn't retry aggressively
      const result = await ingestWebhookPayload(req.body);
      res.status(200).json({ success: true, ...result });
    } catch (err) {
      console.error('Meta webhook error:', err);
      res.status(200).json({ success: false });
    }
  }

  static async listAccountsSanitized(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const repo = AppDataSource.getRepository(SocialAccount);
      const items = await repo.find({
        where: { organizationId: auth.orgId },
        order: { createdAt: 'DESC' }
      });
      res.json({ data: items.map((a) => sanitizeSocialAccount(a as any)) });
    } catch (error: any) {
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  static async publishPost(req: Request, res: Response) {
    try {
      const post = await publishSocialPost(req.params.id);
      res.json({ data: post });
    } catch (error: any) {
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  static async editPost(req: Request, res: Response) {
    try {
      const body = z.object({ content: z.string().min(1) }).parse(req.body);
      const post = await editPublishedPost(req.params.id, body.content);
      res.json({ data: post });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  static async deleteRemotePost(req: Request, res: Response) {
    try {
      const post = await deletePublishedPost(req.params.id);
      res.json({ data: post });
    } catch (error: any) {
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  static async syncInsights(req: Request, res: Response) {
    try {
      const post = await syncPostInsights(req.params.id);
      res.json({ data: post });
    } catch (error: any) {
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  static async syncAllInsights(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const result = await syncAllPublishedInsights(auth.orgId);
      res.json({ data: result });
    } catch (error: any) {
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  static async replyMessage(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const body = z
        .object({
          socialAccountId: z.string(),
          recipientId: z.string().min(1),
          messageText: z.string().min(1)
        })
        .parse(req.body);
      const msg = await sendMetaMessage({ ...body, userId: auth.sub });
      res.status(201).json({ data: msg });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      const status = error instanceof MetaGraphError ? error.status : 500;
      res.status(status).json({ error: { message: error.message } });
    }
  }

  static async listAds(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const { accounts, permission } = await listAdAccounts(auth.orgId);
      res.json({
        data: accounts.map((a) => sanitizeSocialAccount(a as any)),
        permission
      });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async listCampaigns(req: Request, res: Response) {
    try {
      const campaigns = await listCampaignsForAdAccount(req.params.accountId);
      res.json({ data: campaigns });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async listAdSets(req: Request, res: Response) {
    try {
      const data = await listAdSetsForCampaign(req.params.accountId, req.params.campaignId);
      res.json({ data });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async listAdsInSet(req: Request, res: Response) {
    try {
      const data = await listAdsForAdSet(req.params.accountId, req.params.adsetId);
      res.json({ data });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async capabilities(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const data = await getMetaCapabilities(auth.orgId);
      res.json({ data });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async syncFromMeta(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const data = await refreshMetaAccountsFromStoredTokens(auth.orgId);
      res.json({ data });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async feed(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const data = await fetchGraphFeed({
        organizationId: auth.orgId,
        accountId: String(req.query.accountId || ''),
        after: req.query.after ? String(req.query.after) : undefined,
        before: req.query.before ? String(req.query.before) : undefined,
        limit: req.query.limit ? Number(req.query.limit) : 25,
        mediaType: req.query.mediaType ? String(req.query.mediaType) : undefined,
        since: req.query.since ? String(req.query.since) : undefined,
        until: req.query.until ? String(req.query.until) : undefined
      });
      res.json({ data: data.data, paging: data.paging, account: data.account });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async feedPost(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const data = await fetchGraphPostDetail({
        organizationId: auth.orgId,
        accountId: req.params.accountId,
        postId: req.params.postId
      });
      res.json({ data });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async inbox(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const data = await fetchMetaInbox({
        organizationId: auth.orgId,
        accountId: req.query.accountId ? String(req.query.accountId) : undefined,
        platform: req.query.platform ? String(req.query.platform) : undefined
      });
      res.json({ data: data.conversations, unreadTotal: data.unreadTotal, igLocked: data.igLocked });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async thread(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const data = await fetchMetaThread({
        organizationId: auth.orgId,
        accountId: String(req.query.accountId || req.params.accountId || ''),
        threadId: req.params.threadId
      });
      res.json({ data });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async insights(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const data = await fetchAccountInsights({
        organizationId: auth.orgId,
        accountId: String(req.query.accountId || ''),
        preset: req.query.preset ? String(req.query.preset) : 'last_28d'
      });
      res.json({ data });
    } catch (error: any) {
      sendMetaError(res, error);
    }
  }

  static async publishNow(req: Request, res: Response) {
    try {
      const auth = getAuth(req);
      const files = (Array.isArray(req.files) ? req.files : []) as Express.Multer.File[];

      const rawIds = req.body?.accountIds;
      let accountIds: string[] = [];
      if (Array.isArray(rawIds)) accountIds = rawIds.map(String);
      else if (typeof rawIds === 'string') {
        try {
          const parsed = JSON.parse(rawIds);
          accountIds = Array.isArray(parsed) ? parsed.map(String) : [rawIds];
        } catch {
          accountIds = rawIds.split(',').map((s: string) => s.trim()).filter(Boolean);
        }
      }

      const rawMedia = req.body?.mediaUrls;
      let extraUrls: string[] = [];
      if (Array.isArray(rawMedia)) extraUrls = rawMedia.map(String);
      else if (typeof rawMedia === 'string' && rawMedia.trim()) {
        try {
          const parsed = JSON.parse(rawMedia);
          extraUrls = Array.isArray(parsed) ? parsed.map(String) : [rawMedia];
        } catch {
          extraUrls = rawMedia.split(/[\n,]+/).map((s: string) => s.trim()).filter(Boolean);
        }
      }

      const content = String(req.body?.content ?? '');
      const postType = req.body?.postType ? String(req.body.postType) : undefined;
      const hashtags = req.body?.hashtags ? String(req.body.hashtags) : undefined;
      const linkUrl = req.body?.linkUrl ? String(req.body.linkUrl) : undefined;

      if (!accountIds.length) {
        return res.status(400).json({ error: { message: 'Select at least one destination account' } });
      }

      const invalidExtras = extraUrls.map((u) => u.trim()).filter((u) => u && !isPublicHttpsUrl(u));
      if (invalidExtras.length && files.length === 0) {
        return res.status(400).json({
          error: {
            message:
              'url should represent a valid URL. Paste only full https:// links, or upload the image/video file instead.'
          }
        });
      }

      const uploadedUrls: string[] = [];
      for (const file of files) {
        const result = await uploadSocialPostMedia({ file, organizationId: auth.orgId });
        uploadedUrls.push(result.url);
      }

      const mediaUrls = [...uploadedUrls, ...extraUrls.map((u) => u.trim())].filter((u) => isPublicHttpsUrl(u));
      const safeLink = isPublicHttpsUrl(linkUrl) ? String(linkUrl).trim() : undefined;

      if (!content.trim() && mediaUrls.length === 0) {
        return res.status(400).json({
          error: { message: 'Add a caption or attach an image/video' }
        });
      }

      const data = await publishNowToAccounts({
        organizationId: auth.orgId,
        userId: auth.sub,
        accountIds,
        content: content.trim(),
        postType: postType as any,
        mediaUrls: mediaUrls.length ? mediaUrls : undefined,
        linkUrl: safeLink,
        hashtags
      });
      res.json({ data });
    } catch (error: any) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({ error: { message: error.errors[0].message } });
      }
      const msg = String(error?.message || '');
      if (/^S3 |AWS S3 is not configured|not publicly readable|File size exceeds|File type /i.test(msg)) {
        return res.status(400).json({ error: { message: msg } });
      }
      sendMetaError(res, error);
    }
  }

  static async status(_req: Request, res: Response) {
    res.json({
      data: {
        configured: Boolean(env.META_APP_ID && env.META_APP_SECRET),
        appId: env.META_APP_ID || null,
        businessId: env.META_BUSINESS_ID || null,
        configIdConfigured: Boolean(env.META_LOGIN_CONFIG_ID),
        configIdInDialog: false,
        oauthScopes: resolveMetaOAuthScopes(),
        adsScopes: [...META_ADS_SCOPES],
        publishScopes: [...META_PUBLISH_SCOPES],
        dialog: 'facebook_login',
        redirectUri: env.META_REDIRECT_URI,
        webhookUrl: `${env.META_API_PUBLIC_URL.replace(/\/$/, '')}/api/social/meta/webhook`,
        graphVersion: env.META_GRAPH_VERSION
      }
    });
  }
}
