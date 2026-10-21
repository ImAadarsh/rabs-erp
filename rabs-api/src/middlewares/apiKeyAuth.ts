import crypto from 'crypto';
import type { Request } from 'express';
import { AppDataSource } from '@config/data-source.js';

/** IAM API keys look like `zk_<6 hex>.<48 hex>`; only the SHA-256 of the full key is stored. */
export const API_KEY_PREFIX = 'zk_';

export function hashApiKey(raw: string): string {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

/** Scope area -> API module (`/api/<module>`). Areas not listed map to the module of the same name. */
const AREA_MODULES: Record<string, string[]> = {
  users: ['iam'],
  products: ['catalog'],
  catalog: ['catalog'],
  projects: ['pm'],
  accounting: ['finance'],
  reports: ['analytics']
};

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export type ApiKeyAuth = {
  sub: string;
  orgId: string;
  roles: string[];
  apiKey: { id: string; prefix: string | null; scopes: string[] };
};

export class ApiKeyError extends Error {
  constructor(message: string, public status = 401) {
    super(message);
  }
}

/** Extracts a `zk_` key from `Authorization: Bearer zk_...` or `X-Api-Key: zk_...`. */
export function extractApiKey(req: Request): string | null {
  const header = req.headers.authorization;
  if (header?.startsWith('Bearer ') && header.substring(7).trim().startsWith(API_KEY_PREFIX)) return header.substring(7).trim();
  const x = req.headers['x-api-key'];
  const v = Array.isArray(x) ? x[0] : x;
  return v && v.trim().startsWith(API_KEY_PREFIX) ? v.trim() : null;
}

/** Whether `scopes` allow `method` on `/api/<module><subPath>`. IAM keys never reach key/role/auth management. */
export function scopeAllows(scopes: string[], method: string, module: string, subPath: string): boolean {
  if (module === 'iam' && !/^\/users(\/|$)/.test(subPath)) return false;
  if (module === 'iam' && /\/password(\/|$)/.test(subPath)) return false;
  if (scopes.includes('admin:all')) return true;
  const read = READ_METHODS.has(method.toUpperCase());
  return scopes.some((scope) => {
    const [action, area] = scope.split(':');
    if (!area || (action !== 'read' && action !== 'write')) return false;
    if (action === 'read' && !read) return false;
    const modules = AREA_MODULES[area] ?? [area];
    return modules.includes(module);
  });
}

const lastTouched = new Map<string, number>();

/**
 * Validates an IAM API key (hash lookup, active/unexpired, IP allow-list), checks the key's
 * scopes against the requested module + method, and returns the request identity: the key's
 * organisation, acting as the key's creator (or the organisation's first admin).
 */
export async function authenticateApiKey(raw: string, req: Request): Promise<ApiKeyAuth> {
  const [key] = await AppDataSource.query(
    `SELECT id, organization_id, key_prefix, scopes, ip_whitelist, expires_at, status, created_by
       FROM api_keys WHERE key_hash = ? AND deleted_at IS NULL LIMIT 1`,
    [hashApiKey(raw)]
  );
  if (!key) throw new ApiKeyError('Invalid API key');
  if (key.status !== 'active') throw new ApiKeyError('This API key has been revoked');
  if (key.expires_at && new Date(key.expires_at).getTime() < Date.now()) throw new ApiKeyError('This API key has expired');

  const ipList = parseList(key.ip_whitelist);
  if (ipList.length) {
    if (!ipList.includes(clientIp(req))) throw new ApiKeyError('This API key is not allowed from this IP address', 403);
  }

  const scopes = parseList(key.scopes);
  const module = (req.baseUrl.split('/')[2] || '').toLowerCase();
  if (!scopeAllows(scopes, req.method, module, req.path)) {
    throw new ApiKeyError(
      `API key scopes (${scopes.join(', ') || 'none'}) do not allow ${req.method} ${req.baseUrl}${req.path}`,
      403
    );
  }

  let ownerId = key.created_by ? String(key.created_by) : null;
  if (!ownerId) {
    const [owner] = await AppDataSource.query(
      `SELECT u.id FROM users u
         JOIN role_assignments ra ON ra.user_id = u.id JOIN roles r ON r.id = ra.role_id
        WHERE u.organization_id = ? AND u.status = 'active' AND u.deleted_at IS NULL AND r.code IN ('SUPER_ADMIN', 'ADMIN')
        ORDER BY (r.code = 'SUPER_ADMIN') DESC, u.id LIMIT 1`,
      [key.organization_id]
    );
    if (!owner) throw new ApiKeyError('API key has no active owner in its organisation', 403);
    ownerId = String(owner.id);
  }

  const id = String(key.id);
  const now = Date.now();
  if ((lastTouched.get(id) ?? 0) < now - 60_000) {
    lastTouched.set(id, now);
    AppDataSource.query('UPDATE api_keys SET last_used_at = NOW() WHERE id = ?', [id]).catch(() => undefined);
  }

  return {
    sub: ownerId,
    orgId: String(key.organization_id),
    roles: ['API_KEY'],
    apiKey: { id, prefix: key.key_prefix ?? null, scopes }
  };
}

/** Caller IP; behind the local reverse proxy the last X-Forwarded-For hop is the one the proxy saw. */
export function clientIp(req: Request): string {
  const remote = String(req.socket?.remoteAddress || '').replace(/^::ffff:/, '');
  const xff = req.headers['x-forwarded-for'];
  if ((remote === '127.0.0.1' || remote === '::1') && xff) {
    const hops = String(Array.isArray(xff) ? xff.join(',') : xff).split(',').map((s) => s.trim()).filter(Boolean);
    if (hops.length) return hops[hops.length - 1].replace(/^::ffff:/, '');
  }
  return remote;
}

function parseList(v: unknown): string[] {
  if (!v) return [];
  try {
    const parsed = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(parsed) ? parsed.map((s) => String(s).trim()).filter(Boolean) : [];
  } catch {
    return [];
  }
}
