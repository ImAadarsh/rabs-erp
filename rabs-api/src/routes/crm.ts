import { Router } from 'express';
import { TicketsController } from '@controllers/crm/tickets.controller.js';
import { CannedResponsesController } from '@controllers/crm/cannedResponses.controller.js';
import { CustomerTiersController } from '@controllers/crm/customerTiers.controller.js';
import { PipelinesController, StagesController } from '@controllers/crm/pipelines.controller.js';
import { LeadsController } from '@controllers/crm/leads.controller.js';
import { DealsController } from '@controllers/crm/deals.controller.js';
import { ActivitiesController } from '@controllers/crm/activities.controller.js';
import { AccountsController } from '@controllers/crm/accounts.controller.js';
import { TagsController } from '@controllers/crm/tags.controller.js';
import { CrmDashboardController } from '@controllers/crm/dashboard.controller.js';
import { IntegrationKeysController } from '@controllers/crm/integrationKeys.controller.js';
import { ContactsController } from '@controllers/crm/contacts.controller.js';
import { ForecastController } from '@controllers/crm/forecast.controller.js';
import { CrmSettingsController } from '@controllers/crm/settings.controller.js';
import { authMiddleware } from '@middlewares/auth.js';
import { requireRoles } from '@middlewares/rbac.js';
import { CRM_STAFF_ROLES } from '@services/crm/crmScope.js';

export const crmRouter = Router();

const staff = [...CRM_STAFF_ROLES];

// All CRM routes require authentication
crmRouter.use(authMiddleware);

// Dashboard + forecast
crmRouter.get('/dashboard', requireRoles(...staff), CrmDashboardController.get);
crmRouter.get('/forecast', requireRoles(...staff), ForecastController.get);

// Settings (auto-assign / follow-up) + assignable staff for owner dropdowns
crmRouter.get('/settings', requireRoles(...staff), CrmSettingsController.get);
crmRouter.patch('/settings', requireRoles('ADMIN', 'SUPER_ADMIN'), CrmSettingsController.update);
crmRouter.get('/assignable-users', requireRoles(...staff), CrmSettingsController.listAssignableUsers);

// Contacts
crmRouter.get('/contacts', requireRoles(...staff), ContactsController.list);
crmRouter.post('/contacts', requireRoles(...staff), ContactsController.create);
crmRouter.get('/contacts/:id', requireRoles(...staff), ContactsController.get);
crmRouter.patch('/contacts/:id', requireRoles(...staff), ContactsController.update);
crmRouter.delete('/contacts/:id', requireRoles(...staff), ContactsController.remove);

// Leads
crmRouter.get('/leads', requireRoles(...staff), LeadsController.list);
crmRouter.post('/leads', requireRoles(...staff), LeadsController.create);
crmRouter.post('/leads/bulk-assign', requireRoles(...staff), LeadsController.bulkAssign);
crmRouter.get('/leads/:id', requireRoles(...staff), LeadsController.get);
crmRouter.patch('/leads/:id', requireRoles(...staff), LeadsController.update);
crmRouter.post('/leads/:id/convert', requireRoles(...staff), LeadsController.convert);
crmRouter.post('/leads/:id/sync-to-marketing', requireRoles(...staff), LeadsController.syncToMarketing);
crmRouter.post('/leads/:id/tags', requireRoles(...staff), LeadsController.attachTag);
crmRouter.delete('/leads/:id/tags/:tagId', requireRoles(...staff), LeadsController.detachTag);

// Integration API keys (staff manage; external systems use /api/integrations/leads)
crmRouter.get('/integration-keys', requireRoles('ADMIN', 'SUPER_ADMIN'), IntegrationKeysController.list);
crmRouter.post('/integration-keys', requireRoles('ADMIN', 'SUPER_ADMIN'), IntegrationKeysController.create);
crmRouter.post(
  '/integration-keys/:id/regenerate',
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  IntegrationKeysController.regenerate
);
crmRouter.post(
  '/integration-keys/:id/deactivate',
  requireRoles('ADMIN', 'SUPER_ADMIN'),
  IntegrationKeysController.deactivate
);

// Pipelines & stages
crmRouter.get('/pipelines', requireRoles(...staff), PipelinesController.list);
crmRouter.post('/pipelines', requireRoles(...staff), PipelinesController.create);
crmRouter.patch('/pipelines/:id', requireRoles(...staff), PipelinesController.update);
crmRouter.get('/stages', requireRoles(...staff), StagesController.list);
crmRouter.post('/stages', requireRoles(...staff), StagesController.create);
crmRouter.patch('/stages/:id', requireRoles(...staff), StagesController.update);
crmRouter.delete('/stages/:id', requireRoles(...staff), StagesController.remove);

// Deals
crmRouter.get('/deals', requireRoles(...staff), DealsController.list);
crmRouter.post('/deals', requireRoles(...staff), DealsController.create);
crmRouter.get('/deals/:id', requireRoles(...staff), DealsController.get);
crmRouter.patch('/deals/:id', requireRoles(...staff), DealsController.update);
crmRouter.post('/deals/:id/move', requireRoles(...staff), DealsController.move);
crmRouter.post('/deals/:id/tags', requireRoles(...staff), DealsController.attachTag);
crmRouter.delete('/deals/:id/tags/:tagId', requireRoles(...staff), DealsController.detachTag);

// Activities
crmRouter.get('/activities', requireRoles(...staff), ActivitiesController.list);
crmRouter.post('/activities', requireRoles(...staff), ActivitiesController.create);
crmRouter.patch('/activities/:id', requireRoles(...staff), ActivitiesController.update);

// Accounts (ERP customers + CRM enrichment)
crmRouter.get('/accounts', requireRoles(...staff), AccountsController.list);
crmRouter.get('/accounts/:customerId', requireRoles(...staff), AccountsController.get);
crmRouter.patch('/accounts/:customerId', requireRoles(...staff), AccountsController.patch);
crmRouter.get('/accounts/:customerId/timeline', requireRoles(...staff), AccountsController.timeline);
crmRouter.get('/accounts/:customerId/notes', requireRoles(...staff), AccountsController.listNotes);
crmRouter.post('/accounts/:customerId/notes', requireRoles(...staff), AccountsController.createNote);
crmRouter.post('/accounts/:customerId/tags', requireRoles(...staff), AccountsController.attachTag);
crmRouter.delete('/accounts/:customerId/tags/:tagId', requireRoles(...staff), AccountsController.detachTag);

// Tags catalog
crmRouter.get('/tags', requireRoles(...staff), TagsController.list);
crmRouter.post('/tags', requireRoles(...staff), TagsController.create);

// Tickets (existing)
crmRouter.get('/tickets', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE', 'SALES_REP'), TicketsController.list);
crmRouter.get('/tickets/:id', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE', 'SALES_REP'), TicketsController.get);
crmRouter.post('/tickets', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), TicketsController.create);
crmRouter.patch('/tickets/:id', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), TicketsController.update);
crmRouter.post('/tickets/:id/messages', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), TicketsController.addMessage);
crmRouter.post('/tickets/:id/assign', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), TicketsController.assign);

// Canned Responses
crmRouter.get('/canned-responses', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), CannedResponsesController.list);
crmRouter.get('/canned-responses/:id', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), CannedResponsesController.get);
crmRouter.post('/canned-responses', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), CannedResponsesController.create);
crmRouter.patch('/canned-responses/:id', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), CannedResponsesController.update);
crmRouter.delete('/canned-responses/:id', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN'), CannedResponsesController.remove);
crmRouter.post('/canned-responses/:id/usage', requireRoles('CS_AGENT', 'ADMIN', 'SUPER_ADMIN', 'CUSTOMER_SERVICE'), CannedResponsesController.incrementUsage);

// Customer Tiers
crmRouter.get('/customer-tiers', requireRoles('ADMIN', 'SUPER_ADMIN'), CustomerTiersController.list);
crmRouter.get('/customer-tiers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CustomerTiersController.get);
crmRouter.post('/customer-tiers', requireRoles('ADMIN', 'SUPER_ADMIN'), CustomerTiersController.create);
crmRouter.patch('/customer-tiers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CustomerTiersController.update);
crmRouter.delete('/customer-tiers/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), CustomerTiersController.remove);
