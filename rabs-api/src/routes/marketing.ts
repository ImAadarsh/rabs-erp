import { Router } from 'express';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';
import { SegmentController } from '@controllers/marketing/segment.controller.js';
import { CampaignController } from '@controllers/marketing/campaign.controller.js';
import { CouponController } from '@controllers/marketing/coupon.controller.js';
import { AffiliateController } from '@controllers/marketing/affiliate.controller.js';
import { MarketingDashboardController } from '@controllers/marketing/dashboard.controller.js';
import { EmailCampaignsController } from '@controllers/marketing/emailCampaigns.controller.js';
import { EmailConnectorsController } from '@controllers/marketing/emailConnectors.controller.js';
import { EmailWebhooksController } from '@controllers/marketing/emailWebhooks.controller.js';

export const marketingRouter = Router();

const rw = ['ADMIN', 'SUPER_ADMIN', 'MARKETING'] as const;
const del = ['ADMIN', 'SUPER_ADMIN', 'MARKETING'] as const;

// Public affiliate click tracking (no auth)
marketingRouter.get('/affiliates/track', AffiliateController.trackClick);
marketingRouter.post('/affiliates/track', AffiliateController.trackClick);

// Public SendGrid Event Webhook (verified via secret / signature)
marketingRouter.post('/webhooks/sendgrid', EmailWebhooksController.sendgrid);

// Authenticated routes
marketingRouter.use(authMiddleware);
marketingRouter.use(auditMiddleware);

// Dashboard
marketingRouter.get('/dashboard', requireRoles(...rw), MarketingDashboardController.get);

// Email connectors (multi-provider)
marketingRouter.get('/email-connectors', requireRoles(...rw), EmailConnectorsController.list);
marketingRouter.post('/email-connectors/test', requireRoles(...rw), EmailConnectorsController.testDraft);
marketingRouter.post('/email-connectors', requireRoles(...rw), EmailConnectorsController.create);
marketingRouter.get('/email-connectors/:id', requireRoles(...rw), EmailConnectorsController.get);
marketingRouter.patch('/email-connectors/:id', requireRoles(...rw), EmailConnectorsController.update);
marketingRouter.delete('/email-connectors/:id', requireRoles(...del), EmailConnectorsController.remove);
marketingRouter.post('/email-connectors/:id/test', requireRoles(...rw), EmailConnectorsController.test);

// Segments
marketingRouter.get('/segments', requireRoles(...rw), SegmentController.list);
marketingRouter.get('/segments/:id', requireRoles(...rw), SegmentController.get);
marketingRouter.post('/segments', requireRoles(...rw), SegmentController.create);
marketingRouter.patch('/segments/:id', requireRoles(...rw), SegmentController.update);
marketingRouter.delete('/segments/:id', requireRoles(...del), SegmentController.remove);
marketingRouter.get('/segments/:id/members', requireRoles(...rw), SegmentController.listMembers);
marketingRouter.post('/segments/:id/members', requireRoles(...rw), SegmentController.addMembers);
marketingRouter.delete('/segments/:id/members/:customerId', requireRoles(...rw), SegmentController.removeMember);
marketingRouter.post('/segments/:id/recalculate', requireRoles(...rw), SegmentController.recalculate);

// Marketing email campaigns (provider-agnostic) — static paths before :id
marketingRouter.get('/email-campaigns', requireRoles(...rw), EmailCampaignsController.list);
marketingRouter.post('/email-campaigns', requireRoles(...rw), EmailCampaignsController.create);
marketingRouter.get('/email-campaigns/:id', requireRoles(...rw), EmailCampaignsController.get);
marketingRouter.patch('/email-campaigns/:id', requireRoles(...rw), EmailCampaignsController.update);
marketingRouter.delete('/email-campaigns/:id', requireRoles(...del), EmailCampaignsController.remove);
marketingRouter.get('/email-campaigns/:id/sends', requireRoles(...rw), EmailCampaignsController.listSends);
marketingRouter.post('/email-campaigns/:id/send', requireRoles(...rw), EmailCampaignsController.send);

// Campaigns (static paths before :id)
marketingRouter.get('/campaigns', requireRoles(...rw), CampaignController.list);
marketingRouter.get('/campaigns/sends/:sendId/logs', requireRoles(...rw), CampaignController.listLogs);
marketingRouter.get('/campaigns/:id', requireRoles(...rw), CampaignController.get);
marketingRouter.post('/campaigns', requireRoles(...rw), CampaignController.create);
marketingRouter.patch('/campaigns/:id', requireRoles(...rw), CampaignController.update);
marketingRouter.delete('/campaigns/:id', requireRoles(...del), CampaignController.remove);
marketingRouter.get('/campaigns/:id/sends', requireRoles(...rw), CampaignController.listSends);
marketingRouter.post('/campaigns/:id/send', requireRoles(...rw), CampaignController.send);

// Coupons
marketingRouter.get('/coupons', requireRoles(...rw), CouponController.list);
marketingRouter.get('/coupons/usage', requireRoles(...rw), CouponController.listUsage);
marketingRouter.post('/coupons/validate', requireRoles(...rw), CouponController.validate);
marketingRouter.get('/coupons/:id', requireRoles(...rw), CouponController.get);
marketingRouter.get('/coupons/:id/usage', requireRoles(...rw), CouponController.listUsage);
marketingRouter.post('/coupons', requireRoles(...rw), CouponController.create);
marketingRouter.patch('/coupons/:id', requireRoles(...rw), CouponController.update);
marketingRouter.delete('/coupons/:id', requireRoles(...del), CouponController.remove);

// Affiliates
marketingRouter.get('/affiliates', requireRoles(...rw), AffiliateController.list);
marketingRouter.get('/affiliates/clicks', requireRoles(...rw), AffiliateController.listClicks);
marketingRouter.get('/affiliates/conversions', requireRoles(...rw), AffiliateController.listConversions);
marketingRouter.get('/affiliates/payouts', requireRoles(...rw), AffiliateController.listPayouts);
marketingRouter.patch('/affiliates/payouts/:payoutId', requireRoles(...rw), AffiliateController.updatePayout);
marketingRouter.get('/affiliates/:id', requireRoles(...rw), AffiliateController.get);
marketingRouter.post('/affiliates', requireRoles(...rw), AffiliateController.create);
marketingRouter.patch('/affiliates/:id', requireRoles(...rw), AffiliateController.update);
marketingRouter.delete('/affiliates/:id', requireRoles(...del), AffiliateController.remove);
marketingRouter.get('/affiliates/:id/links', requireRoles(...rw), AffiliateController.listLinks);
marketingRouter.post('/affiliates/:id/links', requireRoles(...rw), AffiliateController.createLink);
marketingRouter.get('/affiliates/:id/clicks', requireRoles(...rw), AffiliateController.listClicks);
marketingRouter.get('/affiliates/:id/conversions', requireRoles(...rw), AffiliateController.listConversions);
marketingRouter.get('/affiliates/:id/payouts', requireRoles(...rw), AffiliateController.listPayouts);
marketingRouter.post('/affiliates/:id/payouts', requireRoles(...rw), AffiliateController.createPayout);
