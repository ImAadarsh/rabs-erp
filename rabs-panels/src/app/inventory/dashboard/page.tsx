'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listWarehouses, listStockItems, listSuppliers, listPurchaseOrders } from '@/lib/api';
import { Warehouse, Package, ShoppingCart, TrendingUp, AlertTriangle, Boxes } from 'lucide-react';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

const mockChartData = [
  { name: 'Mon', inbound: 400, outbound: 240 },
  { name: 'Tue', inbound: 300, outbound: 139 },
  { name: 'Wed', inbound: 200, outbound: 980 },
  { name: 'Thu', inbound: 278, outbound: 390 },
  { name: 'Fri', inbound: 189, outbound: 480 },
  { name: 'Sat', inbound: 239, outbound: 380 },
  { name: 'Sun', inbound: 349, outbound: 430 }
];

export default function InventoryDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'WAREHOUSE_MANAGER']);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    totalWarehouses: 0,
    totalStockItems: 0,
    totalSuppliers: 0,
    activePurchaseOrders: 0,
    lowStockItems: 0,
    totalValue: 0
  });

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [warehousesRes, stockItemsRes, suppliersRes, purchaseOrdersRes] = await Promise.all([
          listWarehouses(),
          listStockItems(),
          listSuppliers(),
          listPurchaseOrders({ status: 'draft' })
        ]);

        const stockItems = stockItemsRes.data || [];
        const lowStock = stockItems.filter((item: any) => 
          item.quantityAvailable <= item.reorderPoint && item.quantityAvailable > 0
        ).length;

        setStats({
          totalWarehouses: warehousesRes.data?.length || 0,
          totalStockItems: stockItems.length,
          totalSuppliers: suppliersRes.data?.length || 0,
          activePurchaseOrders: purchaseOrdersRes.data?.length || 0,
          lowStockItems: lowStock,
          totalValue: stockItems.reduce((sum: number, item: any) => 
            sum + (item.quantityOnHand * (item.costPrice || 0)), 0
          )
        });
      } catch (e: any) {
        console.error('Failed to load inventory stats:', e);
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
          <Header title="Inventory · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground">Loading...</div>
            </div>
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
          <Header title="Inventory · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view this page.</p>
              </div>
            </div>
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Inventory · Dashboard" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Inventory Overview</h1>
              <p className="text-muted-foreground">Manage warehouses, stock, suppliers, and purchase orders</p>
            </div>

            <motion.div 
              className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
              initial="hidden"
              animate="show"
              variants={{
                hidden: { opacity: 0 },
                show: { opacity: 1, transition: { staggerChildren: 0.1 } }
              }}
            >
              <Link href="/inventory/warehouses">
                <StatCard
                  title="Warehouses"
                  value={stats.totalWarehouses.toString()}
                  icon={<Warehouse className="h-5 w-5" />}
                  hint="Total warehouses"
                />
              </Link>
              <Link href="/inventory/stock-items">
                <StatCard
                  title="Stock Items"
                  value={stats.totalStockItems.toString()}
                  icon={<Package className="h-5 w-5" />}
                  hint="Total stock items"
                />
              </Link>
              <Link href="/inventory/suppliers">
                <StatCard
                  title="Suppliers"
                  value={stats.totalSuppliers.toString()}
                  icon={<ShoppingCart className="h-5 w-5" />}
                  hint="Active suppliers"
                />
              </Link>
              <Link href="/inventory/purchase-orders">
                <StatCard
                  title="Active POs"
                  value={stats.activePurchaseOrders.toString()}
                  icon={<TrendingUp className="h-5 w-5" />}
                  hint="Draft purchase orders"
                />
              </Link>
              <StatCard
                title="Low Stock"
                value={stats.lowStockItems.toString()}
                icon={<AlertTriangle className="h-5 w-5" />}
                hint="Items below reorder point"
              />
              <StatCard
                title="Total Value"
                value={`£${stats.totalValue.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                icon={<Boxes className="h-5 w-5" />}
                hint="Inventory value at cost"
              />
            </motion.div>

            {/* Recharts Area */}
            <motion.div 
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.4 }}
              className="mt-8 p-6 rounded-2xl border border-border/50 bg-card/50 backdrop-blur-xl"
            >
              <div className="mb-6">
                <h2 className="text-lg font-semibold tracking-tight">Stock Movements</h2>
                <p className="text-sm text-muted-foreground">Rolling 7-day inbound vs outbound</p>
              </div>
              <div className="h-[350px] w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={mockChartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorInbound" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                      </linearGradient>
                      <linearGradient id="colorOutbound" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3}/>
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} dy={10} />
                    <YAxis axisLine={false} tickLine={false} tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--card))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                      itemStyle={{ color: 'hsl(var(--foreground))' }}
                    />
                    <Area type="monotone" dataKey="inbound" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorInbound)" />
                    <Area type="monotone" dataKey="outbound" stroke="#f59e0b" strokeWidth={3} fillOpacity={1} fill="url(#colorOutbound)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </motion.div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-6">
              <Link
                href="/inventory/warehouses"
                className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Warehouses</h3>
                <p className="text-sm text-muted-foreground relative">Manage warehouse locations and settings</p>
              </Link>
              <Link
                href="/inventory/stock-items"
                className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Stock Items</h3>
                <p className="text-sm text-muted-foreground relative">View and manage inventory levels</p>
              </Link>
              <Link
                href="/inventory/suppliers"
                className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Suppliers</h3>
                <p className="text-sm text-muted-foreground relative">Manage supplier information</p>
              </Link>
              <Link
                href="/inventory/purchase-orders"
                className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Purchase Orders</h3>
                <p className="text-sm text-muted-foreground relative">Create and track purchase orders</p>
              </Link>
              <Link
                href="/inventory/bins"
                className="group relative p-6 bg-card rounded-2xl border border-border/50 hover:border-primary/50 transition-all duration-300 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-br from-primary/5 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                <h3 className="font-semibold mb-2 relative">Bins</h3>
                <p className="text-sm text-muted-foreground relative">Manage storage bins and locations</p>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

