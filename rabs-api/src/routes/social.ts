import { Router } from 'express';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';
import { SocialAccountController } from '@controllers/social/social-account.controller.js';
import { SocialPostController } from '@controllers/social/social-post.controller.js';
import { CreatorController } from '@controllers/social/creator.controller.js';
import { SocialMessageController } from '@controllers/social/social-message.controller.js';
import { MetaController } from '@controllers/social/meta.controller.js';
import { uploadSocialMedia } from '@middlewares/upload.js';

export const socialRouter = Router();

const socialRoles = ['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER'] as const;
const inboxRoles = ['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER', 'CS_AGENT'] as const;

// ---- Public Meta endpoints (no auth) ----
socialRouter.get('/meta/callback', MetaController.oauthCallback);
socialRouter.post('/meta/callback', MetaController.oauthCallback);
socialRouter.get('/meta/webhook', MetaController.webhookVerify);
socialRouter.post('/meta/webhook', MetaController.webhookReceive);

// All other routes require authentication
socialRouter.use(authMiddleware);
socialRouter.use(auditMiddleware);

// Meta integration
socialRouter.get('/meta/status', requireRoles(...socialRoles), MetaController.status);
socialRouter.get('/meta/connect', requireRoles(...socialRoles), MetaController.connect);
socialRouter.get('/meta/capabilities', requireRoles(...socialRoles), MetaController.capabilities);
socialRouter.post('/meta/sync', requireRoles(...socialRoles), MetaController.syncFromMeta);
socialRouter.get('/meta/feed', requireRoles(...socialRoles), MetaController.feed);
socialRouter.get('/meta/feed/:accountId/posts/:postId', requireRoles(...socialRoles), MetaController.feedPost);
socialRouter.get('/meta/inbox', requireRoles(...inboxRoles), MetaController.inbox);
socialRouter.get('/meta/inbox/:threadId', requireRoles(...inboxRoles), MetaController.thread);
socialRouter.get('/meta/insights', requireRoles(...socialRoles), MetaController.insights);
socialRouter.get('/meta/ads', requireRoles(...socialRoles), MetaController.listAds);
socialRouter.get(
  '/meta/ads/:accountId/campaigns',
  requireRoles(...socialRoles),
  MetaController.listCampaigns
);
socialRouter.get(
  '/meta/ads/:accountId/campaigns/:campaignId/adsets',
  requireRoles(...socialRoles),
  MetaController.listAdSets
);
socialRouter.get(
  '/meta/ads/:accountId/adsets/:adsetId/ads',
  requireRoles(...socialRoles),
  MetaController.listAdsInSet
);
socialRouter.post(
  '/posts/publish-now',
  requireRoles(...socialRoles),
  uploadSocialMedia,
  MetaController.publishNow
);
socialRouter.post('/posts/sync-insights', requireRoles(...socialRoles), MetaController.syncAllInsights);
socialRouter.post('/posts/:id/publish', requireRoles(...socialRoles), MetaController.publishPost);
socialRouter.post('/posts/:id/edit-remote', requireRoles(...socialRoles), MetaController.editPost);
socialRouter.post('/posts/:id/delete-remote', requireRoles(...socialRoles), MetaController.deleteRemotePost);
socialRouter.post('/posts/:id/sync-insights', requireRoles(...socialRoles), MetaController.syncInsights);
socialRouter.post('/messages/reply', requireRoles(...inboxRoles), MetaController.replyMessage);

// Social Accounts
socialRouter.get('/accounts', requireRoles(...socialRoles), SocialAccountController.list);
socialRouter.get('/accounts/:id', requireRoles(...socialRoles), SocialAccountController.get);
socialRouter.post('/accounts', requireRoles(...socialRoles), SocialAccountController.create);
socialRouter.patch('/accounts/:id', requireRoles(...socialRoles), SocialAccountController.update);
socialRouter.delete('/accounts/:id', requireRoles('SUPER_ADMIN'), SocialAccountController.remove);

// Social Posts
socialRouter.get('/posts', requireRoles(...socialRoles), SocialPostController.list);
socialRouter.get('/posts/:id', requireRoles(...socialRoles), SocialPostController.get);
socialRouter.post('/posts', requireRoles(...socialRoles), SocialPostController.create);
socialRouter.patch('/posts/:id', requireRoles(...socialRoles), SocialPostController.update);
socialRouter.delete('/posts/:id', requireRoles('SUPER_ADMIN'), SocialPostController.remove);

// Creators (Influencers)
socialRouter.get('/creators', requireRoles(...socialRoles), CreatorController.list);
socialRouter.get('/creators/:id', requireRoles(...socialRoles), CreatorController.get);
socialRouter.post('/creators', requireRoles(...socialRoles), CreatorController.create);
socialRouter.patch('/creators/:id', requireRoles(...socialRoles), CreatorController.update);
socialRouter.delete('/creators/:id', requireRoles('SUPER_ADMIN'), CreatorController.remove);

// Social Messages
socialRouter.get('/messages', requireRoles(...inboxRoles), SocialMessageController.list);
socialRouter.get('/messages/:id', requireRoles(...inboxRoles), SocialMessageController.get);
socialRouter.post('/messages', requireRoles(...inboxRoles), SocialMessageController.create);
socialRouter.patch('/messages/:id', requireRoles(...inboxRoles), SocialMessageController.update);
socialRouter.delete('/messages/:id', requireRoles('SUPER_ADMIN'), SocialMessageController.remove);
