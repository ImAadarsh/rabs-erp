import { Router } from 'express';
import { B2bAuthController } from '@controllers/b2b/b2bAuth.controller.js';
import { B2bPortalController } from '@controllers/b2b/b2bPortal.controller.js';
import { B2bAdminController } from '@controllers/b2b/b2bAdmin.controller.js';
import { B2bSupportController } from '@controllers/b2b/b2bSupport.controller.js';
import { b2bAuthMiddleware } from '@middlewares/b2bAuth.js';
import { authMiddleware } from '@middlewares/auth.js';
import { requireRoles } from '@middlewares/rbac.js';

export const b2bRouter = Router();

b2bRouter.post('/auth/login', B2bAuthController.login);
b2bRouter.post('/auth/refresh', B2bAuthController.refresh);

b2bRouter.get('/me', b2bAuthMiddleware, B2bPortalController.me);
b2bRouter.patch('/me', b2bAuthMiddleware, B2bPortalController.updateMe);
b2bRouter.post('/me/password', b2bAuthMiddleware, B2bPortalController.changePassword);

b2bRouter.get('/catalog/products', b2bAuthMiddleware, B2bPortalController.products);
b2bRouter.get('/catalog/products/by-barcode/:code', b2bAuthMiddleware, B2bPortalController.productByBarcode);
b2bRouter.get('/catalog/categories', b2bAuthMiddleware, B2bPortalController.categories);
b2bRouter.get('/catalog/export', b2bAuthMiddleware, B2bPortalController.catalogExport);

b2bRouter.get('/orders', b2bAuthMiddleware, B2bPortalController.orders);
b2bRouter.get('/orders/:id', b2bAuthMiddleware, B2bPortalController.orderById);
b2bRouter.post('/orders', b2bAuthMiddleware, B2bPortalController.createOrder);
b2bRouter.post('/coupons/validate', b2bAuthMiddleware, B2bPortalController.validateCoupon);

b2bRouter.get('/payments/methods', b2bAuthMiddleware, B2bPortalController.paymentMethods);
b2bRouter.post('/payments/intent', b2bAuthMiddleware, B2bPortalController.paymentIntent);
b2bRouter.post('/payments/trade-credit', b2bAuthMiddleware, B2bPortalController.tradeCredit);

b2bRouter.get('/branches', b2bAuthMiddleware, B2bPortalController.branches);
b2bRouter.post('/branches', b2bAuthMiddleware, B2bPortalController.createBranch);
b2bRouter.patch('/branches/:id', b2bAuthMiddleware, B2bPortalController.updateBranch);
b2bRouter.delete('/branches/:id', b2bAuthMiddleware, B2bPortalController.deleteBranch);

b2bRouter.get('/buyers', b2bAuthMiddleware, B2bPortalController.buyers);
b2bRouter.post('/buyers', b2bAuthMiddleware, B2bPortalController.createBuyer);
b2bRouter.patch('/buyers/:id', b2bAuthMiddleware, B2bPortalController.updateBuyer);
b2bRouter.delete('/buyers/:id', b2bAuthMiddleware, B2bPortalController.deleteBuyer);

b2bRouter.get('/wallet', b2bAuthMiddleware, B2bPortalController.wallet);
b2bRouter.get('/wallet/ledger', b2bAuthMiddleware, B2bPortalController.ledger);
b2bRouter.get('/wallet/statement', b2bAuthMiddleware, B2bPortalController.statement);
b2bRouter.get('/wallet/credit-requests', b2bAuthMiddleware, B2bPortalController.creditRequests);
b2bRouter.post('/wallet/credit-requests', b2bAuthMiddleware, B2bPortalController.creditRequest);

b2bRouter.get('/shipping/options', b2bAuthMiddleware, B2bPortalController.shippingOptions);
b2bRouter.get('/shipments', b2bAuthMiddleware, B2bPortalController.shipments);

b2bRouter.get('/notifications', b2bAuthMiddleware, B2bPortalController.notifications);
b2bRouter.post('/notifications/read-all', b2bAuthMiddleware, B2bPortalController.markAllNotificationsRead);
b2bRouter.post('/notifications/:id/read', b2bAuthMiddleware, B2bPortalController.markNotificationRead);
b2bRouter.get('/notifications/preferences', b2bAuthMiddleware, B2bPortalController.notificationPreferences);
b2bRouter.patch('/notifications/preferences', b2bAuthMiddleware, B2bPortalController.updateNotificationPreferences);

b2bRouter.get('/referrals/me', b2bAuthMiddleware, B2bPortalController.referral);
b2bRouter.get('/referrals', b2bAuthMiddleware, B2bPortalController.referrals);
b2bRouter.post('/referrals/invite', b2bAuthMiddleware, B2bPortalController.createReferralInvite);

b2bRouter.get('/support/tickets', b2bAuthMiddleware, B2bSupportController.list);
b2bRouter.post('/support/tickets', b2bAuthMiddleware, B2bSupportController.create);
b2bRouter.get('/support/tickets/:id', b2bAuthMiddleware, B2bSupportController.get);
b2bRouter.post('/support/tickets/:id/messages', b2bAuthMiddleware, B2bSupportController.addMessage);

const staff = [authMiddleware, requireRoles('ADMIN', 'SUPER_ADMIN', 'SALES_REP')] as const;
b2bRouter.get('/admin/dashboard', ...staff, B2bAdminController.dashboard);
b2bRouter.get('/admin/settings', ...staff, B2bAdminController.getSettings);
b2bRouter.patch('/admin/settings', ...staff, B2bAdminController.updateSettings);
b2bRouter.get('/admin/products', ...staff, B2bAdminController.products);
b2bRouter.post('/admin/products/publish', ...staff, B2bAdminController.publish);
b2bRouter.post('/admin/products/unpublish', ...staff, B2bAdminController.unpublish);
b2bRouter.get('/admin/retailers', ...staff, B2bAdminController.retailers);
b2bRouter.post('/admin/retailers', ...staff, B2bAdminController.createRetailer);
b2bRouter.patch('/admin/retailers/:id', ...staff, B2bAdminController.updateRetailer);
b2bRouter.get('/admin/orders', ...staff, B2bAdminController.orders);
b2bRouter.get('/admin/shipments', ...staff, B2bAdminController.shipments);
b2bRouter.patch('/admin/shipments/:id', ...staff, B2bAdminController.updateShipment);
b2bRouter.get('/admin/shipping-methods', ...staff, B2bAdminController.shippingMethods);
b2bRouter.post('/admin/shipping-methods', ...staff, B2bAdminController.upsertShippingMethod);
b2bRouter.get('/admin/credit-requests', ...staff, B2bAdminController.creditRequests);
b2bRouter.patch('/admin/credit-requests/:id', ...staff, B2bAdminController.reviewCreditRequest);
b2bRouter.get('/admin/notifications', ...staff, B2bAdminController.notifications);
b2bRouter.post('/admin/notifications', ...staff, B2bAdminController.createNotification);
b2bRouter.get('/admin/referrals', ...staff, B2bAdminController.referrals);
b2bRouter.patch('/admin/referrals/:id', ...staff, B2bAdminController.updateReferral);
b2bRouter.get('/admin/payments', ...staff, B2bAdminController.payments);
