import { NextFunction, Request, Response } from 'express';
import { AppDataSource } from '@config/data-source.js';
import { AuditLog } from '@entities/iam/AuditLog.js';
import { Organization } from '@entities/iam/Organization.js';
import { User } from '@entities/iam/User.js';
import { AuthPayload } from './auth.js';
import { v4 as uuidv4 } from 'uuid';

// Helper to extract entity info from route
function extractEntityInfo(path: string, method: string): { entityType: string | null; entityId: string | null } {
  // Pattern: /api/iam/users/:id -> entityType: 'user', entityId: id
  const segments = path.split('/').filter(Boolean);
  const iamIndex = segments.indexOf('iam');
  
  if (iamIndex === -1 || iamIndex === segments.length - 1) {
    return { entityType: null, entityId: null };
  }

  const resource = segments[iamIndex + 1];
  const idParam = segments[iamIndex + 2];

  // Map resource names to entity types
  const entityTypeMap: Record<string, string> = {
    'users': 'user',
    'roles': 'role',
    'api-keys': 'api_key',
    'audit-logs': 'audit_log'
  };

  const entityType = entityTypeMap[resource] || resource;
  const entityId = idParam && !isNaN(Number(idParam)) ? idParam : null;

  return { entityType, entityId };
}

// Helper to determine action from method and path
function determineAction(method: string, path: string): string {
  const segments = path.split('/').filter(Boolean);
  const resource = segments[segments.indexOf('iam') + 1] || 'unknown';

  const actionMap: Record<string, string> = {
    'GET': 'read',
    'POST': 'create',
    'PATCH': 'update',
    'PUT': 'update',
    'DELETE': 'delete'
  };

  const baseAction = actionMap[method] || method.toLowerCase();
  
  // Special cases
  if (path.includes('/auth/login')) return 'auth.login';
  if (path.includes('/auth/refresh')) return 'auth.refresh';
  if (path.includes('/auth/google')) return 'auth.google';
  if (path.includes('/password')) return 'user.change_password';
  if (path.includes('/assign')) return 'role.assign';

  return `${resource}.${baseAction}`;
}

// Helper to get IP address
function getIpAddress(req: Request): string {
  return (
    (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
    (req.headers['x-real-ip'] as string) ||
    req.socket.remoteAddress ||
    'unknown'
  );
}

export function auditMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Skip audit for health checks and static assets
  if (req.path === '/health' || req.path.startsWith('/_next/')) {
    return next();
  }

  // Generate request ID for tracking
  const requestId = uuidv4();
  (req as any).requestId = requestId;

  // Store original end function
  const originalEnd = res.end;
  const startTime = Date.now();

  // Override end to capture response
  res.end = function (chunk?: any, encoding?: any, cb?: () => void) {
    // Restore original end
    res.end = originalEnd;

    // Call original end first
    const result = originalEnd.call(res, chunk, encoding, cb);

    // Log asynchronously (don't block response)
    setImmediate(async () => {
      try {
        const auth = (req as any).auth as AuthPayload | undefined;
        
        // Skip if no auth (public endpoints like login)
        if (!auth) {
          return;
        }

        const action = determineAction(req.method, req.path);
        const { entityType, entityId } = extractEntityInfo(req.path, req.method);
        
        // Get organization and user
        const orgRepo = AppDataSource.getRepository(Organization);
        const userRepo = AppDataSource.getRepository(User);
        const auditRepo = AppDataSource.getRepository(AuditLog);

        const organization = await orgRepo.findOne({ where: { id: auth.orgId } });
        if (!organization) {
          return; // Skip if org not found
        }

        const user = await userRepo.findOne({ where: { id: auth.sub } });

        // Prepare changes/metadata
        const changes: any = {};
        const metadata: any = {
          method: req.method,
          path: req.path,
          statusCode: res.statusCode,
          duration: Date.now() - startTime
        };

        // Capture request body for create/update operations (sanitize sensitive data)
        if (['POST', 'PATCH', 'PUT'].includes(req.method) && req.body) {
          const sanitizedBody = { ...req.body };
          // Remove sensitive fields
          if (sanitizedBody.password) delete sanitizedBody.password;
          if (sanitizedBody.passwordHash) delete sanitizedBody.passwordHash;
          if (sanitizedBody.currentPassword) delete sanitizedBody.currentPassword;
          if (sanitizedBody.newPassword) delete sanitizedBody.newPassword;
          changes.request = sanitizedBody;
        }

        // Capture query params
        if (Object.keys(req.query).length > 0) {
          metadata.query = req.query;
        }

        // Create audit log
        const auditLog = auditRepo.create({
          organization,
          user: user || null,
          apiKey: null, // TODO: Extract from request if API key auth is used
          action,
          entityType,
          entityId,
          ipAddress: getIpAddress(req),
          userAgent: req.headers['user-agent'] || null,
          requestId,
          changes: Object.keys(changes).length > 0 ? changes : null,
          metadata: Object.keys(metadata).length > 0 ? metadata : null
        });

        await auditRepo.save(auditLog);
      } catch (error) {
        // Don't fail the request if audit logging fails
        console.error('Audit logging error:', error);
      }
    });

    return result;
  };

  next();
}

