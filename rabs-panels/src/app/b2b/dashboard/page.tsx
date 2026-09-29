'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { getB2bDashboard, getMarketingDashboard } from '@/lib/api';
import { Package2, Store, ShoppingCart, DollarSign, Settings, Users, Share2 } from 'lucide-react';

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

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [res, mkt] = await Promise.all([
          getB2bDashboard(session.user.organizationId),
          getMarketingDashboard().catch(() => null)
        ]);
        setStats(res.data?.stats || stats);
        setPublishMode(res.data?.settings?.publishMode || 'all_active');
        const totals = mkt?.data?.totals;
        if (totals) {
          setAffiliateStats({
            b2bConversions: Number(totals.b2bConversions || 0),
            b2bRevenue: Number(totals.b2bRevenue || 0)
          });
        }
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

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
              Publish ERP products, manage retailers, and take B2B orders. Publish mode: {publishMode === 'all_active' ? 'all active catalog items' : 'mapped products only'}.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-5 gap-4">
            <StatCard title="ERP products" value={String(stats.catalogProducts)} hint="Active catalog items" icon={<Package2 size={18} />} />
            <StatCard title="On B2B portal" value={String(stats.publishedProducts)} hint="Visible to retailers" icon={<Store size={18} />} />
            <StatCard title="Retailers" value={String(stats.retailers)} hint="Portal logins" icon={<Users size={18} />} />
            <StatCard title="Open orders" value={String(stats.openOrders)} hint={`GMV £${Number(stats.gmv).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`} icon={<ShoppingCart size={18} />} />
            <Link href="/marketing/affiliates?channel=b2b">
              <StatCard
                title="B2B affiliate GMV"
                value={`£${Number(affiliateStats.b2bRevenue).toLocaleString('en-GB', { minimumFractionDigits: 2 })}`}
                hint={`${affiliateStats.b2bConversions} attributed conversion${affiliateStats.b2bConversions === 1 ? '' : 's'}`}
                icon={<Share2 size={18} />}
              />
            </Link>
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
              <p className="text-sm text-muted-foreground">Orders placed through the B2B website.</p>
            </Link>
            <Link href="/b2b/pricing" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
              <DollarSign className="mb-3" />
              <div className="font-semibold">Pricing</div>
              <p className="text-sm text-muted-foreground">Assign the wholesale price list used at checkout.</p>
            </Link>
            <Link href="/marketing/affiliates?channel=b2b" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
              <Share2 className="mb-3" />
              <div className="font-semibold">Affiliates & Referrals</div>
              <p className="text-sm text-muted-foreground">B2B portal clicks, conversions and partner performance in Marketing.</p>
            </Link>
          </div>
        </main>
      </div>
    </div>
  );
}
