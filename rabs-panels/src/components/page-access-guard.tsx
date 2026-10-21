'use client';

import type { ReactNode } from 'react';
import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ShieldOff } from 'lucide-react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { useSession } from '@/hooks/use-session';
import { getSession, setSession } from '@/lib/auth';
import { getMyAccess } from '@/lib/api';
import { allowedPagesFromSession, canAccessPath, firstAllowedPath } from '@/lib/page-access';

// Once per full page load: picks up role page-permission edits made after login.
let accessRefreshed = false;

/** Renders a 403 screen instead of any panel page the user's roles do not grant. */
export function PageAccessGuard({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { session, hydrated } = useSession();

  useEffect(() => {
    if (!hydrated || !session?.accessToken || accessRefreshed) return;
    accessRefreshed = true;
    getMyAccess()
      .then(({ data }) => {
        const current = getSession();
        if (!current) return;
        const pages = data.pages ?? null;
        if (JSON.stringify(current.user.pages) === JSON.stringify(pages)) return;
        setSession(current.accessToken, current.refreshToken, { ...current.user, pages });
      })
      .catch(() => {
        accessRefreshed = false;
      });
  }, [hydrated, session?.accessToken]);

  if (!hydrated || !session?.accessToken) return <>{children}</>;
  const allowed = allowedPagesFromSession(session);
  if (canAccessPath(pathname, allowed)) return <>{children}</>;

  const root = (pathname || '/').split('/')[1] || '';
  const fallback = firstAllowedPath(allowed, root) ?? firstAllowedPath(allowed);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="No access" />
        <main className="flex-1 p-4 md:p-6">
          <div className="max-w-xl mx-auto mt-16 rounded-2xl border border-border bg-card p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-red-500/10 text-red-500">
              <ShieldOff size={28} />
            </div>
            <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">403</p>
            <h2 className="mt-1 text-2xl font-bold tracking-tight">No access</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Your role does not include this page. Ask an administrator to grant it under IAM → Roles → Edit Pages.
            </p>
            <div className="mt-6 flex flex-wrap justify-center gap-3">
              <Link href="/modules" className="btn btn-outline">Module Hub</Link>
              {fallback && <Link href={fallback} className="btn btn-primary">Go to an allowed page</Link>}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
