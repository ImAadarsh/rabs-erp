'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { AtSign, Inbox, Megaphone, PenLine, Share2, Users } from 'lucide-react';
import { toast } from 'sonner';
import { SocialPage } from '@/components/social/social-page';
import { StatCard } from '@/components/stat-card';
import { PermissionLock } from '@/components/social/permission-lock';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  getMetaCapabilities,
  getMetaConnectUrl,
  getMetaInsights,
  listMetaInbox
} from '@/lib/api';

export default function SocialDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SOCIAL_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [caps, setCaps] = useState<any>(null);
  const [unread, setUnread] = useState(0);
  const [chart, setChart] = useState<any[]>([]);
  const [chartLabel, setChartLabel] = useState('');

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [capRes, inboxRes] = await Promise.all([
          getMetaCapabilities().catch(() => ({ data: null })),
          listMetaInbox().catch(() => ({ data: [], unreadTotal: 0 }))
        ]);
        setCaps(capRes.data);
        setUnread(inboxRes.unreadTotal || 0);
        const page = (capRes.data?.accounts || []).find((a: any) => a.kind === 'page' && a.hasToken);
        if (page?.id) {
          try {
            const ins = await getMetaInsights({ accountId: page.id, preset: 'last_28d' });
            const series = (ins.data?.series || []).find((s: any) => s.name === 'page_media_view') ||
              (ins.data?.series || []).find((s: any) => s.points?.length);
            if (series?.points?.length) {
              setChartLabel(`${page.accountName} · ${series.name}`);
              setChart(
                series.points.map((p: any) => ({
                  day: String(p.endTime || '').slice(0, 10),
                  value: p.value
                }))
              );
            }
          } catch {
            // no fake series
          }
        }
      } catch (e: any) {
        toast.error(e.response?.data?.error?.message || 'Failed to load social overview');
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  const accounts = caps?.accounts || [];
  const pages = accounts.filter((a: any) => a.kind === 'page');
  const ig = accounts.filter((a: any) => a.kind === 'instagram');
  const ads = accounts.filter((a: any) => a.kind === 'ads');
  const adsLocked = (caps?.missingForAds || []).length > 0;
  const publishLocked = (caps?.missingForPublish || []).length > 0;

  const connectPublish = async () => {
    try {
      const { data } = await getMetaConnectUrl('publish');
      if (data?.authUrl) window.location.href = data.authUrl;
      else toast.error('Connect URL missing');
    } catch (e: any) {
      toast.error(e.response?.data?.error?.message || 'Failed to start publishing connect');
    }
  };

  const capChips = useMemo(
    () =>
      (caps?.capabilities || []).map((c: any) => (
        <span
          key={c.key}
          className={`rounded-full px-2.5 py-1 text-xs ${
            c.granted ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'
          }`}
          title={c.notes || c.requiredPermissions?.join(', ')}
        >
          {c.granted ? '✓' : '✕'} {c.label}
        </span>
      )),
    [caps]
  );

  return (
    <SocialPage
      title="Social · Overview"
      crumbs={[{ label: 'Social' }, { label: 'Overview' }]}
      loading={!hydrated || loading}
      denied={!hasAccess}
    >
      <div className="space-y-6">
        <div>
          <h1 className="text-3xl font-bold mb-1">Social Media</h1>
          <p className="text-muted-foreground text-sm">
            Live Facebook + Instagram from connected Meta tokens — no placeholder metrics.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">{capChips}</div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/social/accounts">
            <StatCard title="Pages" value={String(pages.length)} icon={<AtSign className="h-5 w-5" />} hint="Facebook Pages" />
          </Link>
          <Link href="/social/accounts">
            <StatCard title="Instagram" value={String(ig.length)} icon={<Share2 className="h-5 w-5" />} hint="Professional accounts" />
          </Link>
          <Link href="/social/messages">
            <StatCard title="Unread threads" value={String(unread)} icon={<Inbox className="h-5 w-5" />} hint="Page inbox from Graph" />
          </Link>
          <Link href="/social/ads">
            <StatCard title="Ad accounts" value={String(ads.length)} icon={<Megaphone className="h-5 w-5" />} hint={adsLocked ? 'Permission missing' : 'Marketing API'} />
          </Link>
        </div>

        {chart.length > 0 ? (
          <div className="rounded-2xl border border-border bg-card p-4">
            <h3 className="font-semibold mb-4">{chartLabel || 'Page media views'}</h3>
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chart}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="day" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip />
                  <Area type="monotone" dataKey="value" stroke="#A31F24" fill="#A31F2433" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground">
            No insight series yet. Open Insights after a Page is connected with <code>pages_read_engagement</code>.
          </div>
        )}

        {publishLocked && (
          <PermissionLock
            title="Publishing is locked"
            message="Default Connect cannot ask for Pages/IG publish. Click Enable publishing — classic Facebook Login requests pages_manage_posts and instagram_content_publish (and related Instagram Graph perms). Do not use a Login for Business configuration for these names."
            missingPermission={caps?.missingForPublish?.[0]}
            product="Pages API + Instagram"
            onReconnect={connectPublish}
            reconnectLabel="Enable publishing"
          />
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          <Link href="/social/compose" className="p-6 bg-card rounded-lg border hover:border-primary/50">
            <h3 className="font-semibold mb-1 flex items-center gap-2"><PenLine className="h-4 w-4" /> Composer</h3>
            <p className="text-sm text-muted-foreground">Post to Pages and Instagram</p>
          </Link>
          <Link href="/social/posts" className="p-6 bg-card rounded-lg border hover:border-primary/50">
            <h3 className="font-semibold mb-1">Posts</h3>
            <p className="text-sm text-muted-foreground">Historical Graph feed, reels, filters</p>
          </Link>
          <Link href="/social/messages" className="p-6 bg-card rounded-lg border hover:border-primary/50">
            <h3 className="font-semibold mb-1">Inbox</h3>
            <p className="text-sm text-muted-foreground">Messenger threads with tags</p>
          </Link>
          <Link href="/social/creators" className="p-6 bg-card rounded-lg border hover:border-primary/50">
            <h3 className="font-semibold mb-1 flex items-center gap-2"><Users className="h-4 w-4" /> Creators</h3>
            <p className="text-sm text-muted-foreground">Influencer relationships</p>
          </Link>
        </div>
      </div>
    </SocialPage>
  );
}
