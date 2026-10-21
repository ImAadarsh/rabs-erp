import { AppDataSource } from '@config/data-source.js';
import { RoleAssignment } from '@entities/iam/RoleAssignment.js';

/**
 * Page permissions live in `roles.permissions.pages` as panel page keys
 * (e.g. "finance.invoices" for /finance/invoices, "dashboard" for /dashboard).
 *
 * `null` means unrestricted. A user is unrestricted when they are SUPER_ADMIN, have no role
 * assignments, or hold ANY role without page permissions configured (missing or empty list):
 * such roles predate page permissions and must keep their current access.
 */
export type AllowedPages = string[] | null;

const TTL_MS = 60_000;
const cache = new Map<string, { pages: AllowedPages; expires: number }>();

export function clearPageAccessCache(userId?: string): void {
  if (userId) cache.delete(String(userId));
  else cache.clear();
}

export async function resolveAllowedPages(userId: string, roleCodes: string[] = []): Promise<AllowedPages> {
  if (roleCodes.includes('SUPER_ADMIN')) return null;
  const key = String(userId);
  const hit = cache.get(key);
  if (hit && hit.expires > Date.now()) return hit.pages;

  const assignments = await AppDataSource.getRepository(RoleAssignment).find({
    where: { user: { id: key } },
    relations: ['role']
  });

  let pages: AllowedPages = null;
  if (assignments.length > 0 && !assignments.some((a) => a.role?.code === 'SUPER_ADMIN')) {
    const union = new Set<string>();
    let unrestricted = false;
    for (const a of assignments) {
      const rolePages = a.role?.permissions?.pages;
      if (!Array.isArray(rolePages) || rolePages.length === 0) {
        unrestricted = true;
        break;
      }
      rolePages.forEach((p: unknown) => {
        if (typeof p === 'string' && p) union.add(p);
      });
    }
    pages = unrestricted ? null : Array.from(union);
  }

  cache.set(key, { pages, expires: Date.now() + TTL_MS });
  return pages;
}

/** Top-level panel module of a page key ("finance.invoices" -> "finance"). */
export function pageRoot(pageKey: string): string {
  return pageKey.split('.')[0];
}
