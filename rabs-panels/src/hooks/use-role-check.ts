import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from './use-session';
import { toast } from 'sonner';

/**
 * Hook to check if user has required roles.
 * Redirects to /modules if user doesn't have required roles.
 * Redirects to /login only when hydration is done and there is no session.
 */
export function useRoleCheck(requiredRoles: string[], redirectTo = '/modules') {
  const { session, hydrated } = useSession();
  const router = useRouter();
  const [hasAccess, setHasAccess] = useState(false);

  // Stabilize array identity so the effect doesn't re-fire every render
  const rolesKey = useMemo(
    () => requiredRoles.map((r) => r.toUpperCase()).sort().join('|'),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [requiredRoles.join('|')]
  );

  useEffect(() => {
    if (!hydrated) return;

    if (!session?.accessToken) {
      router.replace('/login');
      setHasAccess(false);
      return;
    }

    const userRoles = session.user?.roles || [];
    const roleCodes = userRoles
      .map((r: any) => (typeof r === 'string' ? r : r?.code || r?.name || ''))
      .map((r: string) => r.toUpperCase());

    const needed = rolesKey ? rolesKey.split('|') : [];
    const hasRequiredRole =
      roleCodes.includes('SUPER_ADMIN') || needed.some((role) => roleCodes.includes(role));

    if (!hasRequiredRole) {
      toast.error('You do not have permission to access this page. Please contact an administrator.');
      setHasAccess(false);
      router.replace(redirectTo);
      return;
    }

    setHasAccess(true);
  }, [hydrated, session, rolesKey, router, redirectTo]);

  return { hasAccess, hydrated };
}
