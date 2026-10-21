import { Router, type Request, type Response, type NextFunction } from 'express';
import { AuthController } from '@controllers/iam/auth.controller.js';
import { UsersController } from '@controllers/iam/users.controller.js';
import { RolesController } from '@controllers/iam/roles.controller.js';
import { ApiKeysController } from '@controllers/iam/apiKeys.controller.js';
import { AuditController } from '@controllers/iam/audit.controller.js';
import { OrganizationsController } from '@controllers/iam/organizations.controller.js';
import { BusinessUnitsController } from '@controllers/iam/businessUnits.controller.js';
import { LocationsController } from '@controllers/iam/locations.controller.js';
import { UploadController } from '@controllers/iam/upload.controller.js';
import { authMiddleware } from '@middlewares/auth.js';
import { AppDataSource } from '@config/data-source.js';
import { auditMiddleware } from '@middlewares/audit.js';
import { requireRoles, deniedRoutesForRoles, type RoleGuard } from '@middlewares/rbac.js';
import { BootstrapController } from '@controllers/iam/bootstrap.controller.js';
import { uploadSingle, uploadMultiple } from '@middlewares/upload.js';

export const iamRouter = Router();

function requireRolesOrSelf(...roleCodes: string[]): RoleGuard {
  const byRole = requireRoles(...roleCodes);
  const guard: RoleGuard = (req: Request, res: Response, next: NextFunction): void => {
    const auth = (req as any).auth as { sub: string; apiKey?: unknown } | undefined;
    if (auth && !auth.apiKey && String(auth.sub) === String(req.params.id)) {
      next();
      return;
    }
    byRole(req, res, next);
  };
  guard.__roles = roleCodes;
  guard.__orSelf = true;
  return guard;
}

// Auth
iamRouter.post('/auth/login', AuthController.login);
iamRouter.post('/auth/refresh', AuthController.refresh);
iamRouter.get('/auth/google/url', AuthController.googleAuthUrl);
iamRouter.get('/auth/google/callback', AuthController.googleCallback);

// Bootstrap (dev-only, token protected via BOOTSTRAP_TOKEN)
iamRouter.post('/bootstrap', BootstrapController.seed);

// All routes below require authentication
iamRouter.use(authMiddleware);

// Audit logging for all authenticated routes
iamRouter.use(auditMiddleware);

// Current user's roles + allowed panel pages
iamRouter.get('/me', AuthController.me);
// API routes the caller's roles are refused by (panels hide those actions)
iamRouter.get('/me/api-access', (req: Request, res: Response) => {
  const roles: string[] = (req as any).auth?.roles || [];
  res.json({ data: { roles, denied: deniedRoutesForRoles(roles) } });
});

// Name/email list of active colleagues for pickers (assignees, managers, employee links)
iamRouter.get('/user-options', async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).auth?.orgId;
    const rows: any[] = await AppDataSource.query(
      `SELECT id, email, first_name, last_name FROM users
        WHERE organization_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY first_name, last_name, email`,
      [orgId]
    );
    res.json({
      data: rows.map((u) => ({ id: String(u.id), email: u.email, firstName: u.first_name, lastName: u.last_name }))
    });
  } catch (err: any) {
    res.status(500).json({ error: { message: err?.message || 'Failed to load users' } });
  }
});

// Users
iamRouter.get('/users', requireRoles('ADMIN', 'SUPER_ADMIN'), UsersController.list);
iamRouter.get('/users/:id', requireRolesOrSelf('ADMIN', 'SUPER_ADMIN'), UsersController.get);
iamRouter.post('/users', requireRoles('ADMIN', 'SUPER_ADMIN'), UsersController.create);
iamRouter.patch('/users/:id', requireRolesOrSelf('ADMIN', 'SUPER_ADMIN'), UsersController.update);
iamRouter.delete('/users/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), UsersController.remove);
iamRouter.patch('/users/:id/password', UsersController.changePassword); // Any authenticated user can change their own password
iamRouter.post('/users/:id/password', UsersController.setPassword); // Set initial password for SSO users
iamRouter.post('/users/:id/reset-password', requireRoles('ADMIN', 'SUPER_ADMIN'), UsersController.adminResetPassword);

// Roles
iamRouter.get('/roles', requireRoles('ADMIN', 'SUPER_ADMIN'), RolesController.list);
iamRouter.post('/roles', requireRoles('SUPER_ADMIN'), RolesController.create);
iamRouter.patch('/roles/:id', requireRoles('SUPER_ADMIN'), RolesController.update);
iamRouter.post('/roles/assign', requireRoles('ADMIN', 'SUPER_ADMIN'), RolesController.assign);
iamRouter.post('/roles/unassign', requireRoles('ADMIN', 'SUPER_ADMIN'), RolesController.unassign);

// API Keys
iamRouter.get('/api-keys', requireRoles('SUPER_ADMIN'), ApiKeysController.list);
iamRouter.post('/api-keys', requireRoles('SUPER_ADMIN'), ApiKeysController.create);
iamRouter.patch('/api-keys/:id', requireRoles('SUPER_ADMIN'), ApiKeysController.update);
iamRouter.delete('/api-keys/:id', requireRoles('SUPER_ADMIN'), ApiKeysController.remove);

// Audit Logs
iamRouter.get('/audit-logs', requireRoles('ADMIN', 'SUPER_ADMIN'), AuditController.list);

// Organizations
iamRouter.get('/organizations', OrganizationsController.list); // All authenticated users can view (their own or all if super admin)
iamRouter.get('/organizations/:id', OrganizationsController.get); // All authenticated users can view (their own or any if super admin)
iamRouter.post('/organizations', requireRoles('SUPER_ADMIN'), uploadSingle('logo'), OrganizationsController.create); // Only super admin can create
iamRouter.patch('/organizations/:id', uploadSingle('logo'), OrganizationsController.update); // Admin can update own, super admin can update any
iamRouter.delete('/organizations/:id', requireRoles('SUPER_ADMIN'), OrganizationsController.remove); // Soft delete; body { confirmName }

// Business Units
iamRouter.get('/business-units', BusinessUnitsController.list); // All authenticated users can view (filtered by org)
iamRouter.get('/business-units/:id', BusinessUnitsController.get);
iamRouter.post('/business-units', requireRoles('ADMIN', 'SUPER_ADMIN'), BusinessUnitsController.create); // Admin can create for their org, super admin for any
iamRouter.patch('/business-units/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BusinessUnitsController.update);
iamRouter.delete('/business-units/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), BusinessUnitsController.remove);

// Locations
iamRouter.get('/locations', LocationsController.list); // All authenticated users can view (filtered by org)
iamRouter.get('/locations/:id', LocationsController.get);
iamRouter.post('/locations', requireRoles('ADMIN', 'SUPER_ADMIN'), LocationsController.create); // Admin can create for their org, super admin for any
iamRouter.patch('/locations/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), LocationsController.update);
iamRouter.delete('/locations/:id', requireRoles('ADMIN', 'SUPER_ADMIN'), LocationsController.remove);

// File Uploads
iamRouter.post('/upload', authMiddleware, uploadSingle('file'), UploadController.upload);
iamRouter.post('/upload/multiple', authMiddleware, uploadMultiple('files'), UploadController.uploadMultiple);


