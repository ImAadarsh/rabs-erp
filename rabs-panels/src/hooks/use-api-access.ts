import { useCallback, useEffect, useState } from 'react';
import { getMyApiAccess } from '@/lib/api';
import { useSession } from './use-session';

type Access = { denied: string[][]; failed: boolean };

let cacheKey: string | null = null;
let cachePromise: Promise<Access> | null = null;

function splitRoute(route: string): string[] {
  const [method, path = ''] = route.trim().split(/\s+/, 2);
  return [method.toUpperCase(), ...path.replace(/\?.*$/, '').split('/').filter(Boolean)];
}

function loadAccess(key: string): Promise<Access> {
  if (cachePromise && cacheKey === key) return cachePromise;
  cacheKey = key;
  cachePromise = getMyApiAccess()
    .then((res) => ({ denied: (res.data?.denied || []).map(splitRoute), failed: false }))
    // Older API without the endpoint: fall back to showing everything (the API still enforces).
    .catch(() => ({ denied: [], failed: true }));
  return cachePromise;
}

function matches(pattern: string[], target: string[]): boolean {
  if (pattern.length !== target.length || pattern[0] !== target[0]) return false;
  for (let i = 1; i < pattern.length; i += 1) {
    if (pattern[i].startsWith(':') || target[i].startsWith(':')) continue;
    if (pattern[i] !== target[i]) return false;
  }
  return true;
}

/**
 * Which API routes the signed-in user's roles may call, from GET /api/iam/me/api-access.
 * `can('DELETE', '/api/crm/canned-responses/:id')` is false while loading and for refused routes,
 * so create/edit/delete buttons stay hidden unless the API would accept the request.
 */
export function useApiAccess() {
  const { session, hydrated } = useSession();
  const key = session?.accessToken ? `${session.user?.id ?? ''}|${(session.user?.roles || []).join(',')}` : null;
  const [access, setAccess] = useState<Access | null>(null);

  useEffect(() => {
    if (!hydrated || !key) return;
    let cancelled = false;
    void loadAccess(key).then((a) => { if (!cancelled) setAccess(a); });
    return () => { cancelled = true; };
  }, [hydrated, key]);

  const can = useCallback(
    (method: string, path: string) => {
      if (!access) return false;
      const target = splitRoute(`${method} ${path.startsWith('/api/') ? path : `/api${path.startsWith('/') ? '' : '/'}${path}`}`);
      return !access.denied.some((d) => matches(d, target));
    },
    [access]
  );

  return { can, ready: access !== null };
}
