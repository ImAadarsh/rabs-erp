'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getMarketingDashboard } from '@/lib/api';
import { Users, Megaphone, Tag, Share2, MousePointerClick, ShoppingBag, PoundSterling } from 'lucide-react';
import Link from 'next/link';

export default function MarketingDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'MARKETING']);
  const [loading, setLoading] = useState(true);
  const [dash, setDash] = useState<any>(null);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const res = await getMarketingDashboard();
        setDash(res.data);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Marketing · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-40 text-muted-foreground">Loading...</div>
          </main>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="Marketing · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="text-center py-20">
              <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
              <p className="text-muted-foreground">You do not have permission to view this page.</p>
            </div>
          </main>
        </div>
      </div>
    );
  }

  const t = dash?.totals || {};
  const series = dash?.series || [];
  const maxClicks = Math.max(1, ...series.map((d: any) => d.clicks));

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Marketing · Dashboard" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Marketing Overview</h1>
              <p className="text-muted-foreground">Live segments, campaigns, coupons, and B2B affiliate performance</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Link href="/marketing/segments"><StatCard title="Segments" value={String(t.segments || 0)} icon={<Users className="h-5 w-5" />} hint="Customer segments" /></Link>
              <Link href="/marketing/campaigns"><StatCard title="Campaigns" value={String(t.campaigns || 0)} icon={<Megaphone className="h-5 w-5" />} hint="Marketing campaigns" /></Link>
              <Link href="/marketing/coupons"><StatCard title="Active coupons" value={String(t.activeCoupons || 0)} icon={<Tag className="h-5 w-5" />} hint={`${t.couponUsages || 0} redemptions`} /></Link>
              <Link href="/marketing/affiliates"><StatCard title="Active affiliates" value={String(t.activeAffiliates || 0)} icon={<Share2 className="h-5 w-5" />} hint={`${t.affiliates || 0} total`} /></Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Affiliate clicks" value={String(t.clicks || 0)} icon={<MousePointerClick className="h-5 w-5" />} hint="All channels" />
              <StatCard title="Conversions" value={String(t.conversions || 0)} icon={<ShoppingBag className="h-5 w-5" />} hint={`${t.b2bConversions || 0} via B2B portal`} />
              <StatCard title="Attributed revenue" value={`£${Number(t.totalRevenue || 0).toFixed(0)}`} icon={<PoundSterling className="h-5 w-5" />} hint={`B2B £${Number(t.b2bRevenue || 0).toFixed(0)}`} />
              <StatCard title="Commission owed" value={`£${Number(t.totalCommission || 0).toFixed(2)}`} icon={<PoundSterling className="h-5 w-5" />} hint="Affiliate totals" />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="p-5 bg-card rounded-lg border border-border">
                <h3 className="font-semibold mb-4">Clicks & conversions (14 days)</h3>
                <div className="flex items-end gap-1 h-40">
                  {series.map((d: any) => (
                    <div key={d.date} className="flex-1 flex flex-col items-center gap-1" title={`${d.date}: ${d.clicks} clicks, ${d.conversions} conv`}>
                      <div className="w-full bg-primary/20 rounded-t relative" style={{ height: `${(d.clicks / maxClicks) * 100}%`, minHeight: d.clicks ? 4 : 2 }}>
                        <div className="absolute bottom-0 left-0 right-0 bg-primary rounded-t" style={{ height: `${d.conversions ? Math.max(20, (d.conversions / Math.max(1, d.clicks)) * 100) : 0}%` }} />
                      </div>
                      <span className="text-[9px] text-muted-foreground rotate-0">{d.date.slice(5)}</span>
                    </div>
                  ))}
                </div>
                <p className="text-xs text-muted-foreground mt-3">Bars = clicks · filled = conversions · B2B conversions counted separately in stats</p>
              </div>

              <div className="p-5 bg-card rounded-lg border border-border">
                <h3 className="font-semibold mb-4">Top affiliates</h3>
                <div className="space-y-3">
                  {(dash?.topAffiliates || []).length === 0 && (
                    <p className="text-sm text-muted-foreground">No affiliates yet — create one under Affiliates.</p>
                  )}
                  {(dash?.topAffiliates || []).map((a: any) => (
                    <div key={a.id} className="flex items-center justify-between text-sm border-b border-border/50 pb-2">
                      <div>
                        <div className="font-medium">{a.contactName}</div>
                        <div className="text-xs text-muted-foreground font-mono">{a.affiliateCode} · {a.status}</div>
                      </div>
                      <div className="text-right text-xs">
                        <div>£{Number(a.totalRevenue || 0).toFixed(0)} rev</div>
                        <div className="text-muted-foreground">{a.totalConversions || 0} conv · {a.totalClicks || 0} clicks</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-5 bg-card rounded-lg border border-border">
              <h3 className="font-semibold mb-4">Recent campaign sends</h3>
              {(dash?.recentSends || []).length === 0 ? (
                <p className="text-sm text-muted-foreground">No sends yet — open a campaign and run Send.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="text-left text-muted-foreground border-b">
                        <th className="py-2">Send</th>
                        <th>Campaign</th>
                        <th>Status</th>
                        <th>Recipients</th>
                        <th>Delivered</th>
                        <th>Failed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(dash?.recentSends || []).map((s: any) => (
                        <tr key={s.id} className="border-b border-border/40">
                          <td className="py-2">{s.sendName}</td>
                          <td>{s.campaignName}</td>
                          <td>{s.status}</td>
                          <td>{s.recipientCount}</td>
                          <td>{s.deliveredCount}</td>
                          <td>{s.failedCount}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
