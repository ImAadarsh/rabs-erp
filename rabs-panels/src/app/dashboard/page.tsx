'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { getSession } from '@/lib/auth';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const data = [
  { name: 'Jan', revenue: 4000, orders: 240 },
  { name: 'Feb', revenue: 3000, orders: 139 },
  { name: 'Mar', revenue: 2000, orders: 980 },
  { name: 'Apr', revenue: 2780, orders: 390 },
  { name: 'May', revenue: 1890, orders: 480 },
  { name: 'Jun', revenue: 2390, orders: 380 },
  { name: 'Jul', revenue: 3490, orders: 430 }
];

export default function DashboardPage() {
  const router = useRouter();
  useEffect(() => {
    const s = getSession();
    if (!s?.accessToken) router.replace('/login');
  }, [router]);

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
          <StatCard
            label="Total Revenue"
            value="£42,593.00"
            trend="+12.5%"
            trendUp={true}
            icon={<DollarSign size={20} />}
            delay={0}
          />
          <StatCard
            label="Orders"
            value="1,240"
            trend="+4.3%"
            trendUp={true}
            icon={<ShoppingBag size={20} />}
            delay={100}
          />
          <StatCard
            label="Active Users"
            value="843"
            trend="+8.1%"
            trendUp={true}
            icon={<Users size={20} />}
            delay={200}
          />
          <StatCard
            label="Pending Support"
            value="12"
            trend="-2.4%"
            trendUp={false} // Good for support tickets to be down? Or maybe trendUp means "increase". Let's say decrease is good.
            icon={<MessageSquare size={20} />}
            delay={300}
          />
          </motion.div>

          {/* Chart Section */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.4 }}
            className="mt-8 p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl"
          >
            <div className="mb-6">
              <h2 className="text-lg font-semibold tracking-tight">Revenue Overview</h2>
              <p className="text-sm text-muted-foreground">Monthly revenue mapped alongside order volume</p>
            </div>
            <div className="h-[400px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#A31F24" stopOpacity={0.3}/>
                      <stop offset="95%" stopColor="#A31F24" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                  <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} tickFormatter={(value) => `$${value}`} />
                  <Tooltip 
                    contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    itemStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area type="monotone" dataKey="revenue" stroke="#A31F24" strokeWidth={3} fillOpacity={1} fill="url(#colorRevenue)" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </motion.div>
        </main>
      </div>
    </div>
  );
}

import { DollarSign, ShoppingBag, Users, MessageSquare, TrendingUp, TrendingDown } from 'lucide-react';

function StatCard({ label, value, trend, trendUp, icon }: any) {
  return (
    <motion.div
      variants={{ hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0 } }}
      whileHover={{ y: -5 }}
      className="relative group h-full"
    >
      <div className="relative h-full p-6 rounded-2xl border border-border/50 bg-card hover:border-primary/30 transition-all duration-300 overflow-hidden">
        {/* Subtle gradient overlay */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

        {/* Content */}
        <div className="relative space-y-4">
          {/* Header */}
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

          {/* Value */}
          <div>
            <div className="text-3xl font-bold text-foreground tracking-tight">
              {value}
            </div>
          </div>

          {/* Trend */}
          <div className="flex items-center gap-1.5">
            <div className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium ${trendUp
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                : 'bg-rose-500/10 text-rose-600 dark:text-rose-400'
              }`}>
              {trendUp ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
              <span>{trend}</span>
            </div>
            <span className="text-xs text-muted-foreground">vs last month</span>
          </div>
        </div>

        {/* Bottom accent line */}
        <div className={`absolute bottom-0 left-0 h-0.5 w-0 group-hover:w-full transition-all duration-500 ${trendUp ? 'bg-emerald-500' : 'bg-rose-500'
          }`} />
      </div>
    </motion.div>
  );
}


