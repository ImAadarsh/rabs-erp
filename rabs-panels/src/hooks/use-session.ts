'use client';

import { useEffect, useState } from 'react';
import { getSession, SESSION_EVENT, type Session } from '@/lib/auth';

/**
 * Reads the session from localStorage and keeps React state in sync when
 * login / logout / token refresh updates it.
 */
export function useSession() {
  const [session, setSessionState] = useState<Session | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const sync = () => {
      setSessionState(getSession());
      setHydrated(true);
    };

    sync();

    window.addEventListener(SESSION_EVENT, sync);
    window.addEventListener('storage', sync);
    // Re-check when the tab becomes visible again (API may have refreshed elsewhere)
    const onVisibility = () => {
      if (document.visibilityState === 'visible') sync();
    };
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      window.removeEventListener(SESSION_EVENT, sync);
      window.removeEventListener('storage', sync);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { session, hydrated };
}
