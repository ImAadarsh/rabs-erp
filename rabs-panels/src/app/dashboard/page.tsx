'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { DollarSign, ShoppingBag, Users, MessageSquare } from 'lucide-react';
import { useSession } from '@/hooks/use-session';
import { useApiAccess } from '@/hooks/use-api-access';
import { rangeForPreset, inRange, bucketsForRange, bucketKey } from '@/components/date-range-filter';
import { listOrders, listTickets, listUserOptions } from '@/lib/api';
import { allowedPagesFromSession, canAccessPath } from '@/lib/page-access';

const gbp = (n: number) => `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const countsTowardRevenue = (o: any) => !['cancelled', 'refunded'].includes(o.status);
const OPEN_TICKET = ['new', 'open', 'pending_customer', 'pending_internal'];

export default function DashboardPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { can, ready } = useApiAccess();
  const range = useMemo(() => rangeForPreset('30d'), []);
  const [orders, setOrders] = useState<any[] | null>(null);
  const [openTickets, setOpenTickets] = useState<number | null>(null);
  const [activeUsers, setActiveUsers] = useState<number | null>(null);

  const canOrders = can('GET', '/api/orders/orders');
  const canTickets = can('GET', '/api/crm/tickets');

  useEffect(() => {
    if (hydrated && !session?.accessToken) router.replace('/login');
  }, [hydrated, session?.accessToken, router]);

  useEffect(() => {
    if (!hydrated || !session?.accessToken || !ready) return;
    const organizationId = session.user.organizationId;
    if (canOrders) {
      listOrders({ organizationId, dateFrom: range.from })
        .then((r) => setOrders(r.data || []))
        .catch(() => setOrders(null));
    }
    if (canTickets) {
      listTickets({ organizationId })
        .then((r) => setOpenTickets((r.data || []).filter((t: any) => OPEN_TICKET.includes(String(t.status))).length))
        .catch(() => setOpenTickets(null));
    }
    listUserOptions()
      .then((r) => setActiveUsers((r.data || []).length))
      .catch(() => setActiveUsers(null));
  }, [hydrated, session?.accessToken, session?.user?.organizationId, ready, canOrders, canTickets, range]);

  const view = useMemo(() => {
    if (!orders) return null;
    const inWindow = orders.filter((o) => inRange(o.orderDate || o.createdAt, range));
    const buckets = bucketsForRange(range).map((b) => ({ ...b, revenue: 0, orders: 0 }));
    const byKey = new Map(buckets.map((b) => [b.key, b]));
    let revenue = 0;
    for (const o of inWindow) {
      const b = byKey.get(bucketKey(o.orderDate || o.createdAt, range));
      if (b) b.orders += 1;
      if (countsTowardRevenue(o)) {
        const total = Number(o.total || 0);
        revenue += total;
        if (b) b.revenue += total;
      }
    }
    return {
      revenue,
      count: inWindow.length,
      timeline: buckets.map((b) => ({ name: b.label, revenue: Number(b.revenue.toFixed(2)), orders: b.orders }))
    };
  }, [orders, range]);

  const allowedPages = useMemo(() => allowedPagesFromSession(session), [session]);
  const linkIfAllowed = (href: string) => (canAccessPath(href, allowedPages) ? href : undefined);
  const cards = [
    view && { label: 'Revenue (last 30 days)', value: gbp(view.revenue), icon: <DollarSign size={20} />, href: linkIfAllowed('/orders/dashboard') },
    view && { label: 'Orders (last 30 days)', value: view.count.toLocaleString('en-GB'), icon: <ShoppingBag size={20} />, href: linkIfAllowed('/orders/orders') },
    activeUsers != null && { label: 'Active users', value: activeUsers.toLocaleString('en-GB'), icon: <Users size={20} /> },
    openTickets != null && { label: 'Open support tickets', value: openTickets.toLocaleString('en-GB'), icon: <MessageSquare size={20} />, href: linkIfAllowed('/crm/tickets') },
  ].filter(Boolean) as { label: string; value: string; icon: React.ReactNode; href?: string }[];

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="Dashboard" />
        <main className="p-6 md:p-8 space-y-6 flex-1 overflow-auto">
          <motion.div
            className="grid gap-6 grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
            initial="hidden"
            animate="show"
            variants={{
              hidden: { opacity: 0 },
              show: { opacity: 1, transition: { staggerChildren: 0.1 } }
            }}
          >
            {cards.map((c) => (
              c.href ? (
                <Link key={c.label} href={c.href}><StatCard label={c.label} value={c.value} icon={c.icon} /></Link>
              ) : (
                <StatCard key={c.label} label={c.label} value={c.value} icon={c.icon} />
              )
            ))}
          </motion.div>

          {ready && cards.length === 0 && (
            <div className="p-6 rounded-2xl border border-border/50 bg-card/50 text-sm text-muted-foreground">
              Open a module from <Link href="/modules" className="underline">Modules</Link> to see the figures for your role.
            </div>
          )}

          {view && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-8 p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl"
            >
              <div className="mb-6">
                <h2 className="text-lg font-semibold tracking-tight">Revenue Overview</h2>
                <p className="text-sm text-muted-foreground">Order revenue over the last 30 days (excludes cancelled and refunded orders)</p>
              </div>
              <div className="h-[400px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={view.timeline} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#A31F24" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#A31F24" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `£${value}`} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                      formatter={(v: any) => gbp(Number(v))}
                    />
                    <Area type="monotone" dataKey="revenue" stroke="#A31F24" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>
          )}
        </main>
      </div>
    </div>
  );
}

function StatCard({ label, value, icon }: { label: string; value: string; icon: React.ReactNode }) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -5 }}
      className="relative group h-full"
    >
      <div className="relative h-full p-6 rounded-2xl border border-border/50 bg-card hover:border-primary/30 transition-all duration-300 overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
        <div className="relative space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <div className="p-2 rounded-lg bg-muted group-hover:bg-primary/10 transition-colors duration-300">
              <div className="text-muted-foreground group-hover:text-primary transition-colors duration-300">
                {icon}
              </div>
            </div>
          </div>
          <div className="text-3xl font-bold text-foreground tracking-tight">
            {value}
          </div>
        </div>
        <div className="absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full bg-primary transition-all duration-500" />
      </div>
    </motion.div>
  );
}
