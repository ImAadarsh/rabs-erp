export type Session = {
  accessToken: string;
  refreshToken: string;
  user: {
    id: string;
    email: string;
    firstName?: string;
    lastName?: string;
    organizationId: string;
    roles: string[];
  };
};

const KEY = 'zaam_session';
export const SESSION_EVENT = 'zaam:session-changed';

function notifySessionChanged() {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new Event(SESSION_EVENT));
}

export function setSession(accessToken: string, refreshToken: string, user: Session['user']) {
  const s: Session = { accessToken, refreshToken, user };
  if (typeof window !== 'undefined') {
    localStorage.setItem(KEY, JSON.stringify(s));
    notifySessionChanged();
  }
}

/** Update only the access token after a successful refresh. */
export function updateAccessToken(accessToken: string) {
  const current = getSession();
  if (!current) return;
  setSession(accessToken, current.refreshToken, current.user);
}

export function getSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Session;
    if (!parsed?.accessToken || !parsed?.refreshToken || !parsed?.user?.id) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function clearSession() {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(KEY);
  notifySessionChanged();
}
