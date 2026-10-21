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
import { listFulfillmentShipments, listPickPackQueue } from '@/lib/api';
import { Box, MapPin, Package, Truck } from 'lucide-react';
import {
  BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

const COLORS = ['#A31F24', '#10b981', '#3b82f6', '#8b5cf6', '#ef4444', '#E5B84A', '#64748b', '#f97316'];
const tooltipStyle = { backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' };
const ACTIVE = ['created', 'label_ready', 'in_transit'];

export default function FulfillmentDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'SALES_REP', 'CUSTOMER_SERVICE', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [shipments, setShipments] = useState<any[]>([]);
  const [queue, setQueue] = useState<any[]>([]);
  const [range, setRange] = useState<DateRange>(() => rangeForPreset('30d'));
  const orgId = session?.user?.organizationId;

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    if (!orgId) return;
    Promise.all([
      listFulfillmentShipments({ organizationId: orgId }).catch(() => ({ data: [] as any[] })),
      listPickPackQueue(orgId).catch(() => ({ data: [] as any[] }))
    ])
      .then(([s, q]) => {
        setShipments(s.data || []);
        setQueue(q.data || []);
      })
      .finally(() => setLoading(false));
  }, [hydrated, hasAccess, session?.accessToken, router, orgId]);

  const view = useMemo(() => {
    const when = (s: any) => s.dispatchedAt || s.createdAt;
    const inWindow = shipments.filter((s) => inRange(when(s), range));
    const buckets = bucketsForRange(range).map((b) => ({ ...b, dispatched: 0, delivered: 0 }));
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    const carriers = new Map<string, number>();
    const statuses = new Map<string, number>();
    for (const s of inWindow) {
      const b = byKey.get(bucketKey(when(s), range));
      if (b && s.status !== 'failed' && s.status !== 'cancelled') b.dispatched += 1;
      carriers.set(s.carrier || 'Unknown', (carriers.get(s.carrier || 'Unknown') || 0) + 1);
      statuses.set(s.status, (statuses.get(s.status) || 0) + 1);
    }
    const deliveredInWindow = shipments.filter((s) => s.deliveredAt && s.dispatchedAt && inRange(s.deliveredAt, range));
    for (const s of deliveredInWindow) {
      const b = byKey.get(bucketKey(s.deliveredAt, range));
      if (b) b.delivered += 1;
    }
    const avgDays = deliveredInWindow.length
      ? deliveredInWindow.reduce((sum, s) => sum + (new Date(s.deliveredAt).getTime() - new Date(s.dispatchedAt).getTime()), 0) /
        deliveredInWindow.length / 86400000
      : null;
    return {
      shipped: inWindow.filter((s) => s.status !== 'failed' && s.status !== 'cancelled').length,
      delivered: deliveredInWindow.length,
      avgDays,
      timeline: buckets.map((b) => ({ label: b.label, dispatched: b.dispatched, delivered: b.delivered })),
      carriers: Array.from(carriers.entries()).map(([name, value]) => ({ name, value })),
      statuses: Array.from(statuses.entries()).map(([name, value]) => ({ name, value }))
    };
  }, [shipments, range]);

  const active = shipments.filter((s) => ACTIVE.includes(s.status)).length;
  const toPick = queue.filter((o) => o.stage === 'to_pick' || o.stage === 'picked').length;
  const packed = queue.filter((o) => o.stage === 'packed').length;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Fulfillment & 3PL · Dashboard" />
        <main className="flex-1 overflow-auto p-4 md:p-6 space-y-6">
          {loading ? <div className="text-muted-foreground">Loading...</div> : (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                <Link href="/fulfillment/shipments">
                  <StatCard title="Active shipments" value={String(active)} hint="Created or in transit" icon={<Truck size={18} />} />
                </Link>
                <Link href="/fulfillment/pick-pack">
                  <StatCard title="Pick/pack queue" value={String(toPick)} hint="Orders still to pick or pack" icon={<Package size={18} />} />
                </Link>
                <Link href="/fulfillment/pick-pack">
                  <StatCard title="Ready to ship" value={String(packed)} hint="Packed, awaiting shipment" icon={<Box size={18} />} />
                </Link>
                <StatCard
                  title="Avg delivery time"
                  value={view.avgDays == null ? '—' : `${view.avgDays.toFixed(1)} days`}
                  hint={view.avgDays == null ? 'No deliveries in period' : `${view.delivered} deliveries in period`}
                  icon={<MapPin size={18} />}
                />
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold">Shipping activity</h2>
                  <p className="text-xs text-muted-foreground">{view.shipped} shipments dispatched · {view.delivered} delivered in the selected period</p>
                </div>
                <DateRangeFilter value={range} onChange={setRange} />
              </div>

              <div className="p-5 rounded-2xl border border-border bg-card">
                <div className="font-semibold mb-3">Dispatched vs delivered</div>
                <div className="h-[280px]">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={view.timeline}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="label" stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <YAxis allowDecimals={false} stroke="hsl(var(--muted-foreground))" fontSize={11} />
                      <Tooltip contentStyle={tooltipStyle} />
                      <Legend />
                      <Bar dataKey="dispatched" name="Dispatched" fill="#A31F24" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="delivered" name="Delivered" fill="#10b981" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {([['Shipments by carrier', view.carriers], ['Shipment status', view.statuses]] as const).map(([title, data]) => (
                  <div key={title} className="p-5 rounded-2xl border border-border bg-card">
                    <div className="font-semibold mb-3">{title}</div>
                    <div className="h-[260px]">
                      {data.length === 0 ? (
                        <div className="h-full flex items-center justify-center text-sm text-muted-foreground">No shipments in this period</div>
                      ) : (
                        <ResponsiveContainer width="100%" height="100%">
                          <PieChart>
                            <Pie data={data as any[]} dataKey="value" nameKey="name" innerRadius={55} outerRadius={95} paddingAngle={2}>
                              {data.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                            </Pie>
                            <Tooltip contentStyle={tooltipStyle} />
                            <Legend />
                          </PieChart>
                        </ResponsiveContainer>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <Link href="/fulfillment/pick-pack" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
                  <Package className="mb-3" />
                  <div className="font-semibold">Pick & Pack</div>
                  <p className="text-sm text-muted-foreground">Pick and pack confirmed orders.</p>
                </Link>
                <Link href="/fulfillment/shipments" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
                  <Truck className="mb-3" />
                  <div className="font-semibold">Shipments</div>
                  <p className="text-sm text-muted-foreground">Dispatch with DHL or any carrier.</p>
                </Link>
                <Link href="/fulfillment/tracking" className="p-5 rounded-2xl border border-border bg-card hover:border-primary/40 transition-colors">
                  <MapPin className="mb-3" />
                  <div className="font-semibold">Tracking</div>
                  <p className="text-sm text-muted-foreground">Track parcels by carrier and tracking number.</p>
                </Link>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
