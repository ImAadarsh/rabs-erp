import { Request } from 'express';
import { z } from 'zod';

/** MySQL tinyint columns come back as 0/1; clients often echo them straight back. */
export const boolish = z.preprocess((v) => {
  if (v === 1 || v === '1' || v === 'true') return true;
  if (v === 0 || v === '0' || v === 'false') return false;
  return v;
}, z.boolean());

/** Empty → null; otherwise must be an absolute http(s) URL or a root-relative path. */
export const optionalDocUrl = z.preprocess(
  (v) => (typeof v === 'string' && v.trim() === '' ? null : v),
  z
    .string()
    .max(1000)
    .refine((v) => /^https?:\/\/\S+$/i.test(v) || /^\/\S+$/.test(v), {
      message: 'must be a valid URL (upload a file or paste a link starting with https://)'
    })
    .optional()
    .nullable()
);

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

/** HR staff roles — HR_MANAGER already used on legacy routes; HR_ADMIN seeded in 015. */
export const HR_STAFF_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN'] as const;
export const HR_WRITE_ROLES = ['ADMIN', 'SUPER_ADMIN', 'HR_ADMIN'] as const;
export const HR_PAYROLL_ROLES = ['ADMIN', 'SUPER_ADMIN', 'FINANCE', 'HR_MANAGER', 'HR_ADMIN'] as const;
