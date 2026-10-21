'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { DateRangeFilter, rangeForPreset, inRange, bucketsForRange, bucketKey, type DateRange } from '@/components/date-range-filter';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getB2bDashboard, listB2bOrders } from '@/lib/api';
import { allowedPagesFromSession, canAccessPath } from '@/lib/page-access';
import { Package2, Store, ShoppingCart, DollarSign, Settings, Users, Share2 } from 'lucide-react';
import {
  ComposedChart, Bar, Line, BarChart, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#A31F24', '#E5B84A', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#64748b'];
const tooltipStyle = { backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' };
const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const countsTowardRevenue = (o: any) => !['cancelled', 'refunded'].includes(o.status);

export default function B2bDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP']);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    catalogProducts: 0,
    publishedProducts: 0,
    retailers: 0,
    totalOrders: 0,
    openOrders: 0,
    gmv: 0
  });
  const [affiliateStats, setAffiliateStats] = useState({ b2bConversions: 0, b2bRevenue: 0 });
  const [publishMode, setPublishMode] = useState('all_active');
  const [orders, setOrders] = useState<any[]>([]);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('30d'));
  const canOpenAffiliates = useMemo(
    () => canAccessPath('/marketing/affiliates', allowedPagesFromSession(session)),
    [session]
  );

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const orgId = session.user.organizationId;
        const [res, ord] = await Promise.all([
          getB2bDashboard(orgId),
          listB2bOrders({ organizationId: orgId, limit: 200 }).catch(() => ({ data: [] as any[] }))
        ]);
        const dash = res.data?.stats;
        if (dash) {
          setStats(dash);
          setAffiliateStats({
            b2bConversions: Number(dash.b2bConversions || 0),
            b2bRevenue: Number(dash.b2bRevenue || 0)
          });
        }
        setPublishMode(res.data?.settings?.publishMode || 'all_active');
        setOrders(ord.data || []);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  const charts = useMemo(() => {
    const inWindow = orders.filter((o) => inRange(o.orderDate || o.createdAt, range));
    const buckets = bucketsForRange(range).map((b) => ({ ...b, orders: 0, revenue: 0 }));
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    const retailers = new Map<string, { name: string; revenue: number; orders: number }>();
    const statuses = new Map<string, number>();
    let revenue = 0;
    for (const o of inWindow) {
      const total = Number(o.total || 0);
      const bucket = byKey.get(bucketKey(o.orderDate || o.createdAt, range));
      if (bucket) {
        bucket.orders += 1;
        if (countsTowardRevenue(o)) bucket.revenue += total;
      }
      statuses.set(o.status, (statuses.get(o.status) || 0) + 1);
      if (!countsTowardRevenue(o)) continue;
      revenue += total;
      const name = o.customer?.companyName || o.customerEmail || 'Unknown';
      const r = retailers.get(name) || { name, revenue: 0, orders: 0 };
      r.revenue += total;
      r.orders += 1;
      retailers.set(name, r);
    }
    return {
      count: inWindow.length,
      revenue,
      aov: inWindow.length ? revenue / inWindow.length : 0,
      timeline: buckets.map((b) => ({ label: b.label, orders: b.orders, revenue: Number(b.revenue.toFixed(2)) })),
      topRetailers: Array.from(retailers.values())
        .sort((a, b) => b.revenue - a.revenue)
        .slice(0, 8)
        .map((r) => ({ ...r, revenue: Number(r.revenue.toFixed(2)) })),
      statusBreakdown: Array.from(statuses.entries()).map(([name, value]) => ({ name, value }))
    };
  }, [orders, range]);

  if (!hydrated || loading) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="B2B · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="text-muted-foreground">Loading...</div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="B2B Sale Channel" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Wholesale portal</h1>
            <p className="text-sm text-muted-foreground">
              Publish ERP products, manage retailers, and take B2B orders. Publish mode: {publishMode === 'all_active' ? 'all active catalog items' : 'selected products only'}.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard title="ERP products" value={String(stats.catalogProducts)} hint="Active catalog items" icon={<Package2 size={18} />} />
            <StatCard title="On B2B portal" value={String(stats.publishedProducts)} hint="Visible to retailers" icon={<Store size={18} />} />
            <StatCard title="Retailers" value={String(stats.retailers)} hint="Portal logins" icon={<Users size={18} />} />
            <StatCard title="Open orders" value={String(stats.openOrders)} hint={`GMV ${gbp(Number(stats.gmv))}`} icon={<ShoppingCart size={18} />} />
            {(() => {
              const card = (
                <StatCard
                  title="B2B affiliate GMV"
                  value={gbp(Number(affiliateStats.b2bRevenue))}
                  hint={`${affiliateStats.b2bConversions} attributed conversion${affiliateStats.b2bConversions === 1 ? '' : 's'}`}
                  icon={<Share2 size={18} />}
                />
              );
              return canOpenAffiliates ? <Link href="/marketing/affiliates?channel=b2b">{card}</Link> : card;
            })()}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold">Order performance</h2>
              <p className="text-xs text-muted-foreground">
                {charts.count} orders · {gbp(charts.revenue)} revenue · {gbp(charts.aov)} average order (excl. cancelled/refunded)
              </p>
            </div>
            <DateRangeFilter value={range} onChange={setRange} />
          </div>

          <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
            <div className="xl:col-span-2 p-5 rounded-2xl border border-border bg-card">
              <div className="font-semibold mb-3">Orders & revenue over time</div>
              <div className="h-[280px]">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={charts.timeline}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis yAxisId="left" stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
                    <YAxis yAxisId="right" orientation="right" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Legend />
                    <Bar yAxisId="left" dataKey="orders" name="Orders" fill="#E5B84A" radius={[6, 6, 0, 0]} />
                    <Line yAxisId="right" type="monotone" dataKey="revenue" name="Revenue (£)" stroke="#10b981" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="p-5 rounded-2xl border border-border bg-card">
              <div className="font-semibold mb-3">Order status</div>
              <div className="h-[280px]">
                {charts.statusBreakdown.length === 0 ? (
                  <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No orders in this period</div>
                ) : (
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={charts.statusBreakdown} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                        {charts.statusBreakdown.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                    </PieChart>
                  </ResponsiveContainer>
                )}
              </div>
            </div>
          </div>

          <div className="p-5 rounded-2xl border border-border bg-card">
            <div className="font-semibold mb-3">Top retailers by revenue</div>
            <div className="h-[280px]">
              {charts.topRetailers.length === 0 ? (
                <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No retailer revenue in this period</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={charts.topRetailers} layout="vertical" margin={{ left: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                    <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={140} />
                    <Tooltip contentStyle={tooltipStyle} formatter={(v: any, n: any) => (n === 'Revenue (£)' ? gbp(Number(v)) : v)} />
                    <Bar dataKey="revenue" name="Revenue (£)" fill="#A31F24" radius={[0, 6, 6, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Link href="/b2b/products" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
              <Package2 className="mb-3" />
              <div className="font-semibold">Products</div>
              <p className="text-sm text-muted-foreground">Choose which ERP SKUs appear on the wholesale site.</p>
            </Link>
            <Link href="/b2b/retailers" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
              <Store className="mb-3" />
              <div className="font-semibold">Retailers</div>
              <p className="text-sm text-muted-foreground">Create wholesale accounts, credit limits and logins.</p>
            </Link>
            <Link href="/b2b/settings" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
              <Settings className="mb-3" />
              <div className="font-semibold">Settings</div>
              <p className="text-sm text-muted-foreground">Enable the portal, default price list and warehouse.</p>
            </Link>
            <Link href="/b2b/orders" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
              <ShoppingCart className="mb-3" />
              <div className="font-semibold">Orders</div>
              <p className="text-sm text-muted-foreground">Orders placed through the B2B website or by staff.</p>
            </Link>
            <Link href="/b2b/pricing" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
              <DollarSign className="mb-3" />
              <div className="font-semibold">Pricing</div>
              <p className="text-sm text-muted-foreground">Assign the wholesale price list used at checkout.</p>
            </Link>
            {canOpenAffiliates && (
              <Link href="/marketing/affiliates?channel=b2b" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
                <Share2 className="mb-3" />
                <div className="font-semibold">Affiliates & Referrals</div>
                <p className="text-sm text-muted-foreground">B2B portal clicks, conversions and partner performance in Marketing.</p>
              </Link>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
