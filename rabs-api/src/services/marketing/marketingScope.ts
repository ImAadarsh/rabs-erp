import { Request } from 'express';

export function orgIdFromReq(req: Request): string | undefined {
  return (
    (req.query.organizationId as string) ||
    req.body?.organizationId ||
    (req as any).auth?.orgId ||
    (req as any).user?.organizationId
  );
}

export function userIdFromReq(req: Request): string | undefined {
  return (req as any).auth?.sub || (req as any).user?.id;
}

export function isSuperAdmin(req: Request): boolean {
  const roles: string[] = (req as any).auth?.roles || [];
  return roles.includes('SUPER_ADMIN');
}

export function assertOrgAccess(req: Request, rowOrgId: string | undefined | null): void {
  if (!rowOrgId) return;
  if (isSuperAdmin(req)) return;
  const orgId = orgIdFromReq(req);
  if (orgId && String(rowOrgId) !== String(orgId)) {
    throw Object.assign(new Error('Forbidden'), { status: 403 });
  }
}

export function slugCode(input: string, max = 40): string {
  return String(input || 'item')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max) || 'ITEM';
}
