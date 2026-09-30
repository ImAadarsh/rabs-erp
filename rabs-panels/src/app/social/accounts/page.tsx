'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { Facebook, RefreshCw } from 'lucide-react';
import { SocialPage } from '@/components/social/social-page';
import { PlatformTag } from '@/components/social/platform-tag';
import { PermissionLock } from '@/components/social/permission-lock';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getMetaCapabilities, getMetaConnectUrl, getMetaStatus, syncMetaAccounts } from '@/lib/api';

export default function SocialAccountsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [caps, setCaps] = useState<any>(null);
  const [status, setStatus] = useState<any>(null);
  const [syncing, setSyncing] = useState(false);
  const [connecting, setConnecting] = useState(false);

  const load = async () => {
    const [c, s] = await Promise.all([
      getMetaCapabilities().catch(() => ({ data: null })),
      getMetaStatus().catch(() => ({ data: null }))
    ]);
    setCaps(c.data);
    setStatus(s.data);
  };

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    load().catch(() => toast.error('Failed to load accounts')).finally(() => setLoading(false));
  }, [hydrated, hasAccess, router, session?.accessToken]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const meta = params.get('meta');
    if (!meta) return;
    if (meta === 'connected') {
      toast.success(`Meta connected — FB: ${params.get('facebook') || 0}, IG: ${params.get('instagram') || 0}, Ads: ${params.get('ads') || 0}`);
      const declined = (params.get('declined') || '').split(',').filter(Boolean);
      if (declined.length) toast.warning(`Not granted: ${declined.join(', ')}`);
      load();
    } else if (meta === 'error') {
      toast.error(params.get('message') || 'Meta connect failed', { duration: 8000 });
    }
    router.replace('/social/accounts');
  }, [router]);

  const connect = async (intent?: 'ads' | 'publish') => {
    setConnecting(true);
    try {
      const { data } = await getMetaConnectUrl(intent);
      if (!data?.authUrl) {
        toast.error('Connect URL missing');
        return;
      }
      window.location.href = data.authUrl;
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Failed to start Meta connect');
      setConnecting(false);
    }
  };

  const sync = async () => {
    setSyncing(true);
    try {
      const { data } = await syncMetaAccounts();
      toast.success(`Synced ${data.refreshed} · discovered ${data.discovered} · ads ${data.ads}`);
      if (data.errors?.length) toast.warning(data.errors.slice(0, 3).join(' · '));
      await load();
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const groups = {
    page: (caps?.accounts || []).filter((a: any) => a.kind === 'page'),
    instagram: (caps?.accounts || []).filter((a: any) => a.kind === 'instagram'),
    ads: (caps?.accounts || []).filter((a: any) => a.kind === 'ads'),
    user: (caps?.accounts || []).filter((a: any) => a.kind === 'user')
  };

  const Card = ({ a }: { a: any }) => (
    <div className="rounded-xl border bg-card p-4 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="font-medium">{a.accountName}</div>
          <div className="text-xs text-muted-foreground">{a.accountHandle || a.accountId}</div>
        </div>
        <PlatformTag platform={a.platform} extra={a.kind} />
      </div>
      <div className="flex flex-wrap gap-1 text-[11px]">
        {a.hasToken ? (
          <span className="rounded-full bg-emerald-500/15 text-emerald-700 px-2 py-0.5">Token attached</span>
        ) : (
          <span className="rounded-full bg-amber-500/15 text-amber-700 px-2 py-0.5">No token</span>
        )}
        {a.needsReconnect && <span className="rounded-full bg-amber-500/15 text-amber-800 px-2 py-0.5">Reconnect to attach</span>}
        {a.followerCount ? <span className="rounded-full bg-muted px-2 py-0.5">{a.followerCount} followers</span> : null}
      </div>
      <div className="text-xs text-muted-foreground">
        Last sync: {a.lastSyncedAt ? new Date(a.lastSyncedAt).toLocaleString() : 'never'}
        {a.tokenExpiresAt ? ` · token exp ${new Date(a.tokenExpiresAt).toLocaleDateString()}` : ''}
      </div>
    </div>
  );

  return (
    <SocialPage
      title="Social · Accounts"
      crumbs={[{ label: 'Social', href: '/social/dashboard' }, { label: 'Accounts' }]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <div className="space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold">Connections</h1>
            <p className="text-sm text-muted-foreground">
              Meta Graph {status?.graphVersion} · default scopes {status?.oauthScopes || '—'}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Default Connect does not ask for Pages/IG publish. Use Enable publishing for{' '}
              <code>pages_manage_posts</code> and <code>instagram_content_publish</code>.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button onClick={sync} disabled={syncing} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              <RefreshCw className="h-4 w-4" /> {syncing ? 'Syncing…' : 'Sync from Meta'}
            </button>
            <button onClick={() => connect()} disabled={connecting} className="inline-flex items-center gap-2 rounded-md bg-[#1877F2] px-3 py-2 text-sm text-white">
              <Facebook className="h-4 w-4" /> {connecting ? 'Redirecting…' : 'Connect / Reconnect Meta'}
            </button>
            <button onClick={() => connect('publish')} disabled={connecting} className="inline-flex items-center gap-2 rounded-md bg-[#1877F2] px-3 py-2 text-sm text-white">
              Enable publishing
            </button>
            <button onClick={() => connect('ads')} className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm">
              Connect ads_read
            </button>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          {(caps?.capabilities || []).map((c: any) => (
            <span
              key={c.key}
              className={`rounded-full px-2.5 py-1 text-xs ${c.granted ? 'bg-emerald-500/15 text-emerald-700' : 'bg-muted text-muted-foreground'}`}
              title={c.notes || ''}
            >
              {c.granted ? '✓' : '✕'} {c.label}
            </span>
          ))}
        </div>

        {!caps?.missingForPublish?.length ? null : (
          <PermissionLock
            title="Publishing is locked"
            message="Default Connect cannot ask for Pages/IG publish. Click Enable publishing — that uses classic Facebook Login (not Login for Business) and requests pages_manage_posts plus instagram_content_publish."
            missingPermission={caps?.missingForPublish?.[0]}
            product="Pages API + Instagram"
            onReconnect={() => connect('publish')}
            reconnectLabel="Enable publishing"
          />
        )}

        {!caps?.missingForAds?.length ? null : (
          <PermissionLock
            title="Ads not on this token"
            message="Enable Marketing API on the Meta app, then use Connect ads_read. Do not expect Page tokens to list ad accounts."
            missingPermission="ads_read"
            product="Marketing API"
            onReconnect={() => connect('ads')}
            reconnectLabel="Reconnect with ads_read"
          />
        )}

        <section>
          <h2 className="font-semibold mb-2">Facebook Pages</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.page.map((a: any) => <Card key={a.id} a={a} />)}
            {groups.page.length === 0 && <p className="text-sm text-muted-foreground">None connected.</p>}
          </div>
        </section>
        <section>
          <h2 className="font-semibold mb-2">Instagram</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.instagram.map((a: any) => <Card key={a.id} a={a} />)}
            {groups.instagram.length === 0 && <p className="text-sm text-muted-foreground">None connected.</p>}
          </div>
        </section>
        <section>
          <h2 className="font-semibold mb-2">Ad accounts</h2>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
            {groups.ads.map((a: any) => <Card key={a.id} a={a} />)}
            {groups.ads.length === 0 && <p className="text-sm text-muted-foreground">None — Marketing API / ads_read not on the token.</p>}
          </div>
        </section>
      </div>
    </SocialPage>
  );
}
