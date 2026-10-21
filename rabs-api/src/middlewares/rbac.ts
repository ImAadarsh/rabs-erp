import { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { env } from '@config/env.js';
import type { AuthPayload } from '@middlewares/auth.js';
import { resolveAllowedPages, pageRoot } from '@services/iam/pageAccess.service.js';

export type RoleGuard = ((req: Request, res: Response, next: NextFunction) => void) & {
  /** Role codes the guard admits; read by routeAccess introspection. */
  __roles?: string[];
  /** Also admits the user whose id is the `:id` route param. */
  __orSelf?: boolean;
};

export function requireRoles(...roleCodes: string[]): RoleGuard {
  const guard: RoleGuard = (req, res, next) => {
    const auth = (req as any).auth as { roles: string[]; apiKey?: { scopes: string[] } } | undefined;
    if (!auth) {
      res.status(401).json({ error: { message: 'Unauthorized' } });
      return;
    }
    if (auth.apiKey) {
      // Module scope was checked by authMiddleware; super-admin-only routes also need admin:all.
      const superOnly = roleCodes.every((r) => r === 'SUPER_ADMIN');
      if (superOnly && !auth.apiKey.scopes.includes('admin:all')) {
        res.status(403).json({ error: { message: 'This endpoint needs an API key with the admin:all scope' } });
        return;
      }
      next();
      return;
    }
    const has = (auth.roles || []).some((r) => roleCodes.includes(r));
    if (!has) {
      res.status(403).json({ error: { message: 'Forbidden' } });
      return;
    }
    next();
  };
  guard.__roles = roleCodes;
  return guard;
}

type RouterLike = { stack: any[] };
let apiRouters: Record<string, RouterLike> = {};

/** Called once from app.ts with the routers mounted under /api/<module>. */
export function registerApiRouters(routers: Record<string, RouterLike>): void {
  apiRouters = routers;
}

export type RouteRule = { method: string; path: string; roles: string[] | null; orSelf?: boolean };

let cachedRules: RouteRule[] | null = null;

/**
 * Every staff route with the roles its `requireRoles` guard admits (`null` = any signed-in user).
 * Built from the live Express stacks so the panels can hide actions the API would refuse.
 */
export function apiRouteRules(): RouteRule[] {
  if (cachedRules) return cachedRules;
  const rules: RouteRule[] = [];
  for (const [mod, router] of Object.entries(apiRouters)) {
    let routerRoles: string[] | null = null;
    for (const layer of router.stack) {
      const handle = layer.handle as RoleGuard;
      if (!layer.route) {
        if (handle?.__roles) routerRoles = handle.__roles;
        continue;
      }
      const paths: string[] = (Array.isArray(layer.route.path) ? layer.route.path : [layer.route.path]).filter(
        (p: unknown) => typeof p === 'string'
      );
      let roles = routerRoles;
      let orSelf = false;
      for (const l of layer.route.stack as any[]) {
        const h = l.handle as RoleGuard;
        if (h?.__roles) {
          roles = roles ? roles.filter((r) => h.__roles!.includes(r)) : h.__roles;
          if (h.__orSelf) orSelf = true;
        }
      }
      for (const method of Object.keys(layer.route.methods || {})) {
        if (method === '_all') continue;
        for (const p of paths) rules.push({ method: method.toUpperCase(), path: `/api/${mod}${p}`, roles, orSelf: orSelf || undefined });
      }
    }
  }
  cachedRules = rules;
  return rules;
}

/** Routes (as "METHOD /api/path/:param") whose role guard refuses all of the given roles. */
export function deniedRoutesForRoles(roleCodes: string[]): string[] {
  if (roleCodes.includes('SUPER_ADMIN')) return [];
  return apiRouteRules()
    .filter((r) => r.roles && !r.orSelf && !r.roles.some((x) => roleCodes.includes(x)))
    .map((r) => `${r.method} ${r.path}`);
}

/**
 * API prefix -> panel modules (page key roots) whose pages call it. Granting any page in one of
 * these modules grants the API prefix. Cross-module entries exist because pages use other
 * modules' endpoints for pickers (e.g. order forms load catalog items and warehouses).
 */
const API_PAGE_ROOTS: Record<string, string[]> = {
  catalog: ['catalog', 'b2b', 'inventory', 'orders'],
  inventory: ['inventory', 'catalog', 'b2b', 'orders', 'fulfillment'],
  orders: ['orders', 'accounting', 'crm', 'finance', 'fulfillment', 'projects', 'b2b'],
  finance: ['finance', 'accounting', 'hr', 'orders'],
  crm: ['crm'],
  hr: ['hr'],
  marketing: ['marketing', 'b2b'],
  social: ['social'],
  analytics: ['analytics'],
  pm: ['projects', 'marketing'],
  fulfillment: ['fulfillment', 'orders'],
  iam: ['iam']
};

/** Callbacks / webhooks / public endpoints never carry a staff session. */
const PUBLIC_PATH = /\/(webhooks?|callback|public)(\/|$)/;

/** IAM endpoints every signed-in user needs (profile, shared org/BU/location pickers, uploads). */
function isSharedIamPath(req: Request, subPath: string, userId: string): boolean {
  if (/^\/(auth|bootstrap|me|upload|user-options)(\/|$)/.test(subPath)) return true;
  if (req.method === 'GET' && /^\/(organizations|business-units|locations)(\/|$)/.test(subPath)) return true;
  const self = subPath.match(/^\/users\/([^/]+)/);
  return !!self && self[1] === String(userId);
}

/**
 * Enforces role page permissions per API module. Mounted on /api before the module routers.
 * Requests without a valid staff JWT pass through untouched (the routers still authenticate),
 * so B2B / POS / API-key / webhook traffic is unaffected. /api/b2b, /api/pos and
 * /api/integrations are never checked here.
 */
export function requirePageAccess(req: Request, res: Response, next: NextFunction): void {
  const [, mod = '', ...rest] = req.path.split('/');
  const roots = API_PAGE_ROOTS[mod];
  if (!roots || PUBLIC_PATH.test(req.path)) {
    next();
    return;
  }
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) {
    next();
    return;
  }
  let auth: AuthPayload;
  try {
    auth = jwt.verify(header.substring(7), env.JWT_ACCESS_SECRET) as AuthPayload;
  } catch {
    next();
    return;
  }
  if (!auth?.sub || auth.roles?.includes('SUPER_ADMIN')) {
    next();
    return;
  }
  if (mod === 'iam' && isSharedIamPath(req, `/${rest.join('/')}`, auth.sub)) {
    next();
    return;
  }
  resolveAllowedPages(auth.sub, auth.roles || [])
    .then((pages) => {
      if (!pages || pages.some((p) => roots.includes(pageRoot(p)))) {
        next();
        return;
      }
      res.status(403).json({
        error: { message: 'No access: your role has no pages in this module. Ask an administrator to grant page access.' }
      });
    })
    .catch(next);
}
