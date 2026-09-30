'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { Home, Briefcase, Plus, CalendarDays, HardHat, BarChart3, Settings, Search, LogOut, LayoutGrid, Loader2 } from 'lucide-react';
import clsx from 'clsx';
import { BrandWordmark } from '@/components/brand-wordmark';
import { useSession } from '@/hooks/use-session';
import { clearSession } from '@/lib/auth';
import { rabs, errMsg, type RabsMeta } from '@/lib/rabs-api';
import { StatusBadge } from './ui';

type MetaCtx = { meta: RabsMeta | null; can: (cap: string) => boolean; reload: () => Promise<void> };
const Ctx = createContext<MetaCtx>({ meta: null, can: () => false, reload: async () => {} });
export const useRabs = () => useContext(Ctx);

type NavItem = { href: string; label: string; icon: typeof Home; cap?: string; match?: (p: string) => boolean };

const NAV: NavItem[] = [
  { href: '/rabs', label: 'Home', icon: Home, match: (p) => p === '/rabs' },
  { href: '/rabs/jobs', label: 'Jobs', icon: Briefcase, match: (p) => p.startsWith('/rabs/jobs') },
  { href: '/rabs/new', label: 'New enquiry', icon: Plus, cap: 'customers' },
  { href: '/rabs/diary', label: 'Diary', icon: CalendarDays, cap: 'appointments' },
  { href: '/rabs/work', label: 'My work', icon: HardHat, cap: 'fieldwork' },
  { href: '/rabs/reports', label: 'Reports', icon: BarChart3, cap: 'reports' },
  { href: '/rabs/admin', label: 'Admin', icon: Settings, cap: 'admin' }
];

export function RabsShell({ children }: { children: ReactNode }) {
  const { session, hydrated } = useSession();
  const router = useRouter();
  const pathname = usePathname() || '/rabs';
  const [meta, setMeta] = useState<RabsMeta | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setMeta(await rabs.get<RabsMeta>('/meta'));
      setError(null);
    } catch (e) {
      setError(errMsg(e));
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (!session) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    load();
  }, [hydrated, session, router, pathname, load]);

  const can = useCallback((cap: string) => !!meta?.me.permissions.includes(cap), [meta]);
  const printView = pathname.endsWith('/print');

  if (!hydrated || !session) return null;
  if (printView) return <Ctx.Provider value={{ meta, can, reload: load }}>{children}</Ctx.Provider>;

  const items = NAV.filter((n) => !n.cap || can(n.cap));
  const fieldOnly = !!meta && !can('customers') && can('fieldwork');
  const bottom = fieldOnly ? items.filter((n) => ['/rabs', '/rabs/work', '/rabs/jobs'].includes(n.href)) : items.filter((n) => ['/rabs', '/rabs/jobs', '/rabs/new', '/rabs/diary', '/rabs/work'].includes(n.href)).slice(0, 5);
  const isActive = (n: NavItem) => (n.match ? n.match(pathname) : pathname.startsWith(n.href));

  return (
    <Ctx.Provider value={{ meta, can, reload: load }}>
      <div className="min-h-screen bg-muted/40 dark:bg-background">
        {/* Desktop side nav */}
        <aside className="hidden md:flex fixed inset-y-0 left-0 w-60 flex-col bg-card border-r border-border z-30">
          <Link href="/rabs" className="h-16 flex items-center px-5 border-b border-border">
            <BrandWordmark tone="onLight" size="sm" />
          </Link>
          <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
            {items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={clsx(
                  'flex items-center gap-3 h-11 px-3 rounded-xl text-sm font-semibold transition',
                  isActive(n) ? 'bg-brand text-white shadow-sm shadow-brand/30' : 'text-foreground/80 hover:bg-muted'
                )}
              >
                <n.icon size={18} />
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="p-3 border-t border-border space-y-1">
            <Link href="/modules" className="flex items-center gap-3 h-10 px-3 rounded-xl text-sm text-muted-foreground hover:bg-muted">
              <LayoutGrid size={16} /> All ERP modules
            </Link>
            <UserBox />
          </div>
        </aside>

        <div className="md:pl-60">
          <TopBar fieldOnly={fieldOnly} />
          <main className="px-3 md:px-6 py-4 md:py-6 pb-28 md:pb-10 max-w-6xl mx-auto">
            {error ? (
              <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 p-4 text-sm">
                {error}{' '}
                <button className="underline font-semibold" onClick={load}>
                  Try again
                </button>
              </div>
            ) : !meta ? (
              <div className="flex items-center justify-center py-24 text-muted-foreground gap-2">
                <Loader2 className="h-5 w-5 animate-spin" /> Loading…
              </div>
            ) : (
              children
            )}
          </main>
        </div>

        {/* Mobile bottom nav */}
        <nav className="md:hidden fixed bottom-0 inset-x-0 z-30 bg-card/95 backdrop-blur border-t border-border pb-[env(safe-area-inset-bottom)]">
          <div className="grid" style={{ gridTemplateColumns: `repeat(${bottom.length}, minmax(0, 1fr))` }}>
            {bottom.map((n) => {
              const active = isActive(n);
              const isNew = n.href === '/rabs/new';
              return (
                <Link key={n.href} href={n.href} className="flex flex-col items-center justify-center h-16 gap-0.5">
                  {isNew ? (
                    <span className="h-11 w-11 -mt-5 rounded-full bg-brand text-white flex items-center justify-center shadow-lg shadow-brand/40">
                      <Plus size={24} />
                    </span>
                  ) : (
                    <n.icon size={22} className={active ? 'text-brand' : 'text-muted-foreground'} />
                  )}
                  <span className={clsx('text-[11px] font-medium', active ? 'text-brand' : 'text-muted-foreground')}>{isNew ? 'New' : n.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </Ctx.Provider>
  );
}

function UserBox() {
  const { session } = useSession();
  const router = useRouter();
  const { meta } = useRabs();
  const name = [session?.user.firstName, session?.user.lastName].filter(Boolean).join(' ') || session?.user.email;
  return (
    <div className="flex items-center gap-2 px-3 py-2">
      <div className="h-9 w-9 rounded-full bg-brand/15 text-brand font-bold flex items-center justify-center text-sm">{(name || '?').slice(0, 1).toUpperCase()}</div>
      <div className="min-w-0 flex-1">
        <div className="text-sm font-semibold truncate">{name}</div>
        <div className="text-[11px] text-muted-foreground truncate">{meta?.me.roles.join(', ')}</div>
      </div>
      <button
        onClick={() => {
          clearSession();
          router.replace('/login');
        }}
        className="p-2 rounded-lg hover:bg-muted text-muted-foreground"
        aria-label="Log out"
        title="Log out"
      >
        <LogOut size={16} />
      </button>
    </div>
  );
}

function TopBar({ fieldOnly }: { fieldOnly: boolean }) {
  const router = useRouter();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [res, setRes] = useState<{ jobs: any[]; customersWithoutJobs: any[] } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [showUser, setShowUser] = useState(false);

  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    if (q.trim().length < 2) {
      setRes(null);
      return;
    }
    timer.current = setTimeout(async () => {
      setLoading(true);
      try {
        setRes(await rabs.get('/search', { q: q.trim() }));
      } catch {
        setRes(null);
      } finally {
        setLoading(false);
      }
    }, 250);
  }, [q]);

  const go = (href: string) => {
    setOpen(false);
    setQ('');
    router.push(href);
  };

  return (
    <header className="sticky top-0 z-20 bg-card/90 backdrop-blur border-b border-border">
      <div className="h-16 flex items-center gap-3 px-3 md:px-6 max-w-6xl mx-auto">
        <Link href="/rabs" className="md:hidden shrink-0">
          <BrandWordmark tone="onLight" size="sm" />
        </Link>
        <div className="relative flex-1">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && res?.jobs?.[0]) go(`/rabs/jobs/${res.jobs[0].id}`);
              if (e.key === 'Escape') setOpen(false);
            }}
            placeholder={fieldOnly ? 'Search my jobs' : 'Search name, phone, postcode, job / quote / invoice no.'}
            className="w-full h-11 rounded-xl border border-border bg-background pl-10 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand/40"
            aria-label="Search"
          />
          {open && q.trim().length >= 2 && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
              <div className="absolute z-40 mt-2 w-full max-h-[70vh] overflow-y-auto rounded-2xl border border-border bg-card shadow-2xl">
                {loading && !res && <div className="p-4 text-sm text-muted-foreground">Searching…</div>}
                {res && res.jobs.length === 0 && res.customersWithoutJobs.length === 0 && <div className="p-4 text-sm text-muted-foreground">No matches for “{q}”.</div>}
                {res?.jobs.map((j) => (
                  <button key={j.id} onClick={() => go(`/rabs/jobs/${j.id}`)} className="w-full text-left px-4 py-3 hover:bg-muted border-b border-border/60 last:border-0">
                    <div className="flex items-center justify-between gap-2">
                      <div className="font-semibold truncate">
                        {j.customerName} <span className="text-muted-foreground font-normal">· {j.jobNumber}</span>
                      </div>
                      <StatusBadge size="sm" label={j.statusLabel} color={j.statusColor} textColor={j.statusTextColor} />
                    </div>
                    <div className="text-xs text-muted-foreground truncate">
                      {[j.customerPhone, j.address, j.quoteNumber, j.invoiceNumber].filter(Boolean).join(' · ')}
                    </div>
                  </button>
                ))}
                {res?.customersWithoutJobs.map((c) => (
                  <button key={c.id} onClick={() => go(`/rabs/new?customer=${c.id}`)} className="w-full text-left px-4 py-3 text-sm border-t border-border/60 hover:bg-muted">
                    {c.name} · <span className="text-muted-foreground">{c.phone || c.address}</span>
                    <span className="block text-xs text-brand font-semibold">No job yet — start a new enquiry</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        <div className="relative md:hidden">
          <button onClick={() => setShowUser((v) => !v)} className="h-11 w-11 rounded-xl border border-border flex items-center justify-center" aria-label="Menu">
            <Settings size={18} />
          </button>
          {showUser && (
            <>
              <div className="fixed inset-0 z-30" onClick={() => setShowUser(false)} />
              <div className="absolute right-0 mt-2 w-64 z-40 rounded-2xl border border-border bg-card shadow-2xl py-2">
                <MobileMenu onNavigate={() => setShowUser(false)} />
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function MobileMenu({ onNavigate }: { onNavigate: () => void }) {
  const { can } = useRabs();
  const items = NAV.filter((n) => !n.cap || can(n.cap));
  return (
    <div>
      {items.map((n) => (
        <Link key={n.href} href={n.href} onClick={onNavigate} className="flex items-center gap-3 px-4 h-11 text-sm hover:bg-muted">
          <n.icon size={16} /> {n.label}
        </Link>
      ))}
      <Link href="/modules" onClick={onNavigate} className="flex items-center gap-3 px-4 h-11 text-sm hover:bg-muted text-muted-foreground">
        <LayoutGrid size={16} /> All ERP modules
      </Link>
      <div className="border-t border-border mt-1 pt-1">
        <UserBox />
      </div>
    </div>
  );
}
