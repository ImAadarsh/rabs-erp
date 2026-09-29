import { Router } from 'express';
import { authMiddleware } from '@middlewares/auth.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles } from '@middlewares/rbac.js';
import { ReportDefinitionController } from '@controllers/analytics/report-definition.controller.js';
import { ScheduledReportController } from '@controllers/analytics/scheduled-report.controller.js';
import { DashboardController } from '@controllers/analytics/dashboard.controller.js';
import { DataExportController } from '@controllers/analytics/data-export.controller.js';

export const analyticsRouter = Router();

// All routes require authentication
analyticsRouter.use(authMiddleware);

// Audit logging for all authenticated routes
analyticsRouter.use(auditMiddleware);

// Base roles for Analytics 
const analyticRoles = ['ADMIN', 'SUPER_ADMIN', 'FINANCE'];

// Report Definitions
analyticsRouter.get('/reports', requireRoles(...analyticRoles), ReportDefinitionController.list);
analyticsRouter.get('/reports/:id', requireRoles(...analyticRoles), ReportDefinitionController.get);
analyticsRouter.post('/reports', requireRoles('ADMIN', 'SUPER_ADMIN'), ReportDefinitionController.create);
analyticsRouter.patch('/reports/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ReportDefinitionController.update);
analyticsRouter.delete('/reports/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ReportDefinitionController.remove);

// Scheduled Reports
analyticsRouter.get('/scheduled-reports', requireRoles(...analyticRoles), ScheduledReportController.list);
analyticsRouter.get('/scheduled-reports/:id', requireRoles(...analyticRoles), ScheduledReportController.get);
analyticsRouter.post('/scheduled-reports', requireRoles('ADMIN', 'SUPER_ADMIN'), ScheduledReportController.create);
analyticsRouter.patch('/scheduled-reports/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ScheduledReportController.update);
analyticsRouter.delete('/scheduled-reports/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), ScheduledReportController.remove);

// Dashboards
analyticsRouter.get('/dashboards', requireRoles(...analyticRoles), DashboardController.list);
analyticsRouter.get('/dashboards/:id', requireRoles(...analyticRoles), DashboardController.get);
analyticsRouter.post('/dashboards', requireRoles(...analyticRoles), DashboardController.create);
analyticsRouter.patch('/dashboards/:id', requireRoles(...analyticRoles), DashboardController.update);
analyticsRouter.delete('/dashboards/:id', requireRoles(...analyticRoles), DashboardController.remove);

// Data Exports
analyticsRouter.get('/exports', requireRoles(...analyticRoles), DataExportController.list);
analyticsRouter.get('/exports/:id', requireRoles(...analyticRoles), DataExportController.get);
analyticsRouter.post('/exports', requireRoles(...analyticRoles), DataExportController.create);
analyticsRouter.patch('/exports/:id', requireRoles(...analyticRoles), DataExportController.update);
analyticsRouter.delete('/exports/:id', requireRoles(...analyticRoles), DataExportController.remove);
