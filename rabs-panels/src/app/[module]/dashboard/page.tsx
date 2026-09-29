'use client';
import { useParams, useRouter } from 'next/navigation';
import { modules } from '@/data/modules';
import { useEffect, useState } from 'react';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { getSession } from '@/lib/auth';
import { StatCard } from '@/components/stat-card';
import { listUsers, listRoles, listAuditLogs, listOrganizations, listBusinessUnits, listLocations, listApiKeys, listCatalogItems, listVariants, listPriceLists, listTaxCodes } from '@/lib/api';
import { Users, Shield, Key, FileText, UserCog, TrendingUp, Activity, Building2, Briefcase, MapPin, Package2, Tag, DollarSign, Receipt, Truck, Package, Settings, Share2 } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const COLORS = ['#E3070F', '#F2545A', '#FA969A', '#9E050B', '#BE060D'];

export default function ModuleDashboardPage() {
  const router = useRouter();
  const params = useParams<{ module: string }>();
  const mod = modules.find((m) => m.slug === params.module);
  const [stats, setStats] = useState({
    totalUsers: 0,
    totalAdmins: 0,
    totalRoles: 0,
    apiKeys: 0,
    auditLogs: 0,
    totalOrganizations: 0,
    activeOrganizations: 0,
    totalBusinessUnits: 0,
    activeBusinessUnits: 0,
    totalLocations: 0,
    activeLocations: 0,
    // Catalog stats
    totalCatalogItems: 0,
    activeCatalogItems: 0,
    totalVariants: 0,
    activeVariants: 0,
    totalPriceLists: 0,
    activePriceLists: 0,
    totalTaxCodes: 0
  });
  const [chartData, setChartData] = useState({
    userGrowth: [] as any[],
    usersByRole: [] as any[],
    activityByDay: [] as any[],
    statusDistribution: [] as any[]
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const s = getSession();
    if (!s?.accessToken) router.replace('/login');
  }, [router]);

  useEffect(() => {
    if (params.module === 'catalog') {
      (async () => {
        try {
          const s = getSession();
          const [itemsRes, variantsRes, priceListsRes, taxCodesRes] = await Promise.all([
            listCatalogItems({ organizationId: s?.user?.organizationId }).catch(() => ({ data: [] })),
            listVariants().catch(() => ({ data: [] })),
            listPriceLists({ organizationId: s?.user?.organizationId }).catch(() => ({ data: [] })),
            listTaxCodes({ organizationId: s?.user?.organizationId }).catch(() => ({ data: [] }))
          ]);

          const items = itemsRes.data || [];
          const variants = variantsRes.data || [];
          const priceLists = priceListsRes.data || [];
          const taxCodes = taxCodesRes.data || [];

          const activeItems = items.filter((item: any) => item.status === 'active').length;
          const activeVariants = variants.filter((v: any) => v.status === 'active').length;
          const activePriceLists = priceLists.filter((pl: any) => pl.status === 'active').length;

          setStats({
            totalCatalogItems: items.length,
            activeCatalogItems: activeItems,
            totalVariants: variants.length,
            activeVariants: activeVariants,
            totalPriceLists: priceLists.length,
            activePriceLists: activePriceLists,
            totalTaxCodes: taxCodes.length,
            // IAM stats (not used for catalog)
            totalUsers: 0,
            totalAdmins: 0,
            totalRoles: 0,
            apiKeys: 0,
            auditLogs: 0,
            totalOrganizations: 0,
            activeOrganizations: 0,
            totalBusinessUnits: 0,
            activeBusinessUnits: 0,
            totalLocations: 0,
            activeLocations: 0
          });

          // Generate catalog growth data (last 6 months)
          const now = new Date();
          const last6Months = Array.from({ length: 6 }, (_, i) => {
            const date = new Date(now);
            date.setMonth(date.getMonth() - (5 - i));
            date.setDate(1);
            date.setHours(0, 0, 0, 0);
            return date;
          });

          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const catalogGrowth = last6Months.map(date => {
            const monthName = monthNames[date.getMonth()];
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            monthStart.setHours(0, 0, 0, 0);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            monthEnd.setHours(23, 59, 59, 999);

            const itemsInMonth = items.filter((item: any) => {
              const dateValue = item.createdAt || item.created_at;
              if (!dateValue) return false;
              try {
                const itemDate = new Date(dateValue);
                if (isNaN(itemDate.getTime())) return false;
                const normalizedItemDate = new Date(itemDate);
                normalizedItemDate.setHours(0, 0, 0, 0);
                return normalizedItemDate >= monthStart && normalizedItemDate <= monthEnd;
              } catch {
                return false;
              }
            }).length;

            const activeInMonth = items.filter((item: any) => {
              const dateValue = item.createdAt || item.created_at;
              if (!dateValue) return false;
              try {
                const itemDate = new Date(dateValue);
                if (isNaN(itemDate.getTime())) return false;
                const normalizedItemDate = new Date(itemDate);
                normalizedItemDate.setHours(0, 0, 0, 0);
                return normalizedItemDate >= monthStart && 
                       normalizedItemDate <= monthEnd && 
                       item.status === 'active';
              } catch {
                return false;
              }
            }).length;

            return {
              month: monthName,
              users: itemsInMonth,
              active: activeInMonth
            };
          });

          // Status distribution
          const statusCount: any = {};
          items.forEach((item: any) => {
            const status = item.status || 'unknown';
            statusCount[status] = (statusCount[status] || 0) + 1;
          });
          const statusDistribution = Object.entries(statusCount).map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value
          }));

          // Category distribution
          const categoryCount: any = {};
          items.forEach((item: any) => {
            const category = item.category || 'Uncategorized';
            categoryCount[category] = (categoryCount[category] || 0) + 1;
          });
          const categoryDistribution = Object.entries(categoryCount).slice(0, 5).map(([name, value]) => ({
            name,
            value
          }));

          setChartData({
            userGrowth: catalogGrowth.length > 0 ? catalogGrowth : last6Months.map((date) => ({
              month: monthNames[date.getMonth()],
              users: 0,
              active: 0
            })),
            usersByRole: categoryDistribution.length > 0 ? categoryDistribution : [{ name: 'No Data', value: 0 }],
            activityByDay: [],
            statusDistribution: statusDistribution.length > 0 ? statusDistribution : [{ name: 'No Data', value: 0 }]
          });

        } catch (error) {
          console.error('Failed to load catalog stats:', error);
        } finally {
          setLoading(false);
        }
      })();
    } else if (params.module === 'iam') {
      (async () => {
        try {
          const [usersRes, rolesRes, auditRes, organizationsRes, businessUnitsRes, locationsRes, apiKeysRes] = await Promise.all([
            listUsers(),
            listRoles(),
            listAuditLogs(200).catch(() => ({ data: [] })), // Fetch more logs for better weekly data
            listOrganizations().catch(() => ({ data: [] })),
            listBusinessUnits().catch(() => ({ data: [] })),
            listLocations().catch(() => ({ data: [] })),
            listApiKeys().catch(() => ({ data: [] }))
          ]);

          const users = usersRes.data || [];
          const roles = rolesRes.data || [];
          const audits = auditRes.data || [];
          const organizations = organizationsRes.data || [];
          const businessUnits = businessUnitsRes.data || [];
          const locations = locationsRes.data || [];
          const apiKeys = apiKeysRes.data || [];

          const admins = users.filter((u: any) =>
            u.roles?.some((r: any) => r.code?.toLowerCase().includes('admin')) ||
            u.email?.includes('admin')
          ).length;

          const activeOrgs = organizations.filter((o: any) => 
            o.status === 'active'
          ).length;

          const activeBusinessUnits = businessUnits.filter((bu: any) => 
            bu.status === 'active'
          ).length;

          const activeLocations = locations.filter((l: any) => 
            l.status === 'active'
          ).length;

          setStats({
            totalUsers: users.length,
            totalAdmins: admins,
            totalRoles: roles.length,
            apiKeys: apiKeys.length,
            auditLogs: audits.length,
            totalOrganizations: organizations.length,
            activeOrganizations: activeOrgs,
            totalBusinessUnits: businessUnits.length,
            activeBusinessUnits: activeBusinessUnits,
            totalLocations: locations.length,
            activeLocations: activeLocations,
            // Catalog stats (not used for IAM)
            totalCatalogItems: 0,
            activeCatalogItems: 0,
            totalVariants: 0,
            activeVariants: 0,
            totalPriceLists: 0,
            activePriceLists: 0,
            totalTaxCodes: 0
          });

          // Generate user growth data (last 6 months) - Based on actual user creation dates if available
          const now = new Date();
          const last6Months = Array.from({ length: 6 }, (_, i) => {
            const date = new Date(now);
            date.setMonth(date.getMonth() - (5 - i));
            date.setDate(1); // Start of month
            date.setHours(0, 0, 0, 0);
            return date;
          });

          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const userGrowth = last6Months.map(date => {
            const monthName = monthNames[date.getMonth()];
            const monthStart = new Date(date.getFullYear(), date.getMonth(), 1);
            monthStart.setHours(0, 0, 0, 0);
            const monthEnd = new Date(date.getFullYear(), date.getMonth() + 1, 0);
            monthEnd.setHours(23, 59, 59, 999);

            // Count users created in this month (not cumulative)
            const usersInMonth = users.filter((u: any) => {
              const dateValue = u.createdAt || u.created_at;
              if (!dateValue) return false;
              
              try {
                const userDate = new Date(dateValue);
                if (isNaN(userDate.getTime())) return false;
                
                // Normalize to start of day for comparison
                const normalizedUserDate = new Date(userDate);
                normalizedUserDate.setHours(0, 0, 0, 0);
                const normalizedMonthStart = new Date(monthStart);
                normalizedMonthStart.setHours(0, 0, 0, 0);
                const normalizedMonthEnd = new Date(monthEnd);
                normalizedMonthEnd.setHours(23, 59, 59, 999);
                
                return normalizedUserDate >= normalizedMonthStart && normalizedUserDate <= normalizedMonthEnd;
              } catch {
                return false;
              }
            }).length;

            // Count active users created in this month
            const activeInMonth = users.filter((u: any) => {
              const dateValue = u.createdAt || u.created_at;
              if (!dateValue) return false;
              
              try {
                const userDate = new Date(dateValue);
                if (isNaN(userDate.getTime())) return false;
                
                const normalizedUserDate = new Date(userDate);
                normalizedUserDate.setHours(0, 0, 0, 0);
                const normalizedMonthStart = new Date(monthStart);
                normalizedMonthStart.setHours(0, 0, 0, 0);
                const normalizedMonthEnd = new Date(monthEnd);
                normalizedMonthEnd.setHours(23, 59, 59, 999);
                
                return normalizedUserDate >= normalizedMonthStart && 
                       normalizedUserDate <= normalizedMonthEnd && 
                       (u.status === 'active' || u.status === undefined);
              } catch {
                return false;
              }
            }).length;

            return {
              month: monthName,
              users: usersInMonth,
              active: activeInMonth
            };
          });

          // Users by role distribution
          const roleCount: any = {};
          users.forEach((u: any) => {
            const role = u.roles?.[0]?.name || 'No Role';
            roleCount[role] = (roleCount[role] || 0) + 1;
          });
          const usersByRole = Object.entries(roleCount).map(([name, value]) => ({
            name,
            value
          }));

          // Activity by day (last 7 days) - Real data from audit logs
          const last7Days = Array.from({ length: 7 }, (_, i) => {
            const date = new Date(now);
            date.setDate(date.getDate() - (6 - i));
            date.setHours(0, 0, 0, 0); // Start of day
            return date;
          });

          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
          const activityByDay = last7Days.map(date => {
            const dayName = dayNames[date.getDay()];
            const dateStr = date.toISOString().split('T')[0];
            
            // Set start and end of day for comparison
            const dayStart = new Date(date);
            dayStart.setHours(0, 0, 0, 0);
            const dayEnd = new Date(date);
            dayEnd.setHours(23, 59, 59, 999);
            
            // Filter audit logs for this day (handle both createdAt and created_at)
            const dayLogs = audits.filter((log: any) => {
              const logDateValue = log.createdAt || log.created_at;
              if (!logDateValue) return false;
              
              try {
                const logDate = new Date(logDateValue);
                if (isNaN(logDate.getTime())) return false;
                
                // Normalize log date to start of day for comparison
                const normalizedLogDate = new Date(logDate);
                
                // Check if log is within this day (00:00:00 to 23:59:59)
                return normalizedLogDate >= dayStart && normalizedLogDate <= dayEnd;
              } catch {
                return false;
              }
            });

            // Count logins (auth.login, auth.google actions)
            const logins = dayLogs.filter((log: any) => {
              const action = log.action || '';
              return action.includes('auth.login') || action.includes('auth.google') || action.includes('auth.googleCallback');
            }).length;

            // Count other actions (all non-login actions)
            const actions = dayLogs.filter((log: any) => {
              const action = log.action || '';
              return !action.includes('auth.login') && 
                     !action.includes('auth.google') && 
                     !action.includes('auth.googleCallback');
            }).length;

            return {
              day: dayName,
              date: dateStr,
              logins,
              actions
            };
          });

          // Status distribution
          const statusCount: any = {};
          users.forEach((u: any) => {
            const status = u.status || 'unknown';
            statusCount[status] = (statusCount[status] || 0) + 1;
          });
          const statusDistribution = Object.entries(statusCount).map(([name, value]) => ({
            name: name.charAt(0).toUpperCase() + name.slice(1),
            value
          }));

          // Ensure we always have data for charts (prevent empty arrays that break rendering)
          setChartData({
            userGrowth: userGrowth.length > 0 ? userGrowth : last6Months.map((date, i) => ({
              month: monthNames[date.getMonth()],
              users: 0,
              active: 0
            })),
            usersByRole: usersByRole.length > 0 ? usersByRole : [{ name: 'No Data', value: 0 }],
            activityByDay: activityByDay.length > 0 ? activityByDay : last7Days.map((date, i) => ({
              day: dayNames[date.getDay()],
              date: date.toISOString().split('T')[0],
              logins: 0,
              actions: 0
            })),
            statusDistribution: statusDistribution.length > 0 ? statusDistribution : [{ name: 'No Data', value: 0 }]
          });

        } catch (error) {
          console.error('Failed to load stats:', error);
        } finally {
          setLoading(false);
        }
      })();
    } else {
      setLoading(false);
    }
  }, [params.module]);

  if (!mod) {
    if (typeof window !== 'undefined') router.replace('/modules');
    return null;
  }

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col lg:ml-[280px]">
        <Header title={`${mod.name} · Dashboard`} />
        <main className="p-4 md:p-6 space-y-6">
          {params.module === 'iam' ? (
            <>
              {/* Stats Cards */}
              <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                <StatCard
                  title="Total Users"
                  value={loading ? '...' : stats.totalUsers.toString()}
                  hint="Active accounts"
                  icon={<Users size={20} />}
                />
                <StatCard
                  title="Total Admins"
                  value={loading ? '...' : stats.totalAdmins.toString()}
                  hint="Admin users"
                  icon={<UserCog size={20} />}
                />
                <StatCard
                  title="Total Roles"
                  value={loading ? '...' : stats.totalRoles.toString()}
                  hint="Defined roles"
                  icon={<Shield size={20} />}
                />
                <StatCard
                  title="API Keys"
                  value={loading ? '...' : stats.apiKeys.toString()}
                  hint="Active keys"
                  icon={<Key size={20} />}
                />
                <StatCard
                  title="Audit Logs"
                  value={loading ? '...' : stats.auditLogs.toString()}
                  hint="Total entries"
                  icon={<FileText size={20} />}
                />
                <StatCard
                  title="Active Organizations"
                  value={loading ? '...' : stats.activeOrganizations.toString()}
                  hint="Active organizations"
                  icon={<Building2 size={20} />}
                />
                <StatCard
                  title="Active Business Units"
                  value={loading ? '...' : stats.activeBusinessUnits.toString()}
                  hint="Active business units"
                  icon={<Briefcase size={20} />}
                />
                <StatCard
                  title="Active Locations"
                  value={loading ? '...' : stats.activeLocations.toString()}
                  hint="Active locations"
                  icon={<MapPin size={20} />}
                />
              </section>

              {/* Quick Actions */}
              <section className="grid gap-4 grid-cols-1">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Quick Actions</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <a href="/iam/users" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Users size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Manage Users</div>
                      <div className="text-xs text-muted-foreground mt-1">View and edit users</div>
                    </a>
                    <a href="/iam/roles" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Shield size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Manage Roles</div>
                      <div className="text-xs text-muted-foreground mt-1">Configure permissions</div>
                    </a>
                    <a href="/iam/api-keys" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Key size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">API Keys</div>
                      <div className="text-xs text-muted-foreground mt-1">Manage access keys</div>
                    </a>
                    <a href="/iam/audit-logs" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <FileText size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Audit Logs</div>
                      <div className="text-xs text-muted-foreground mt-1">View activity logs</div>
                    </a>
                  </div>
                </div>
              </section>

              {/* Charts Section */}
              <section className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                {/* User Growth Chart */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp size={20} className="text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">User Growth</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={chartData.userGrowth}>
                      <defs>
                        <linearGradient id="colorUsers" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E3070F" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#E3070F" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Area type="monotone" dataKey="users" stroke="#E3070F" fillOpacity={1} fill="url(#colorUsers)" strokeWidth={2} />
                      <Area type="monotone" dataKey="active" stroke="#F2545A" fillOpacity={0.5} fill="#F2545A" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Activity by Day */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Activity size={20} className="text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Weekly Activity</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData.activityByDay}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Legend />
                      <Bar dataKey="logins" fill="#E3070F" radius={[8, 8, 0, 0]} />
                      <Bar dataKey="actions" fill="#F2545A" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                {/* Users by Role */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Shield size={20} className="text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Users by Role</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={chartData.usersByRole}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => percent !== undefined ? `${name}: ${(percent * 100).toFixed(0)}%` : name}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {chartData.usersByRole.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Status Distribution */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Users size={20} className="text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">User Status</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData.statusDistribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={80} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="value" fill="#E3070F" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          ) : params.module === 'catalog' ? (
            <>
              {/* Stats Cards */}
              <section className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
                <StatCard
                  title="Total Products"
                  value={loading ? '...' : stats.totalCatalogItems.toString()}
                  hint="Catalog items"
                  icon={<Package2 size={20} />}
                />
                <StatCard
                  title="Active Products"
                  value={loading ? '...' : stats.activeCatalogItems.toString()}
                  hint="Active items"
                  icon={<Package2 size={20} />}
                />
                <StatCard
                  title="Total Variants"
                  value={loading ? '...' : stats.totalVariants.toString()}
                  hint="Product variants"
                  icon={<Tag size={20} />}
                />
                <StatCard
                  title="Active Variants"
                  value={loading ? '...' : stats.activeVariants.toString()}
                  hint="Active variants"
                  icon={<Tag size={20} />}
                />
                <StatCard
                  title="Price Lists"
                  value={loading ? '...' : stats.totalPriceLists.toString()}
                  hint="Pricing tiers"
                  icon={<DollarSign size={20} />}
                />
                <StatCard
                  title="Tax Codes"
                  value={loading ? '...' : stats.totalTaxCodes.toString()}
                  hint="Tax configurations"
                  icon={<Receipt size={20} />}
                />
              </section>

              {/* Quick Actions */}
              <section className="grid gap-4 grid-cols-1">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Quick Actions</div>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    <a href="/catalog/items" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Package2 size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Catalog Items</div>
                      <div className="text-xs text-muted-foreground mt-1">Manage products</div>
                    </a>
                    <a href="/catalog/variants" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Tag size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Variants</div>
                      <div className="text-xs text-muted-foreground mt-1">Manage variants</div>
                    </a>
                    <a href="/catalog/price-lists" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <DollarSign size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Price Lists</div>
                      <div className="text-xs text-muted-foreground mt-1">Manage pricing</div>
                    </a>
                    <a href="/catalog/tax-codes" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Receipt size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Tax Codes</div>
                      <div className="text-xs text-muted-foreground mt-1">Manage taxes</div>
                    </a>
                  </div>
                </div>
              </section>

              {/* Charts Section */}
              <section className="grid gap-4 grid-cols-1 lg:grid-cols-2">
                {/* Catalog Growth Chart */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <TrendingUp size={20} className="text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Product Growth</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <AreaChart data={chartData.userGrowth}>
                      <defs>
                        <linearGradient id="colorCatalog" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#E3070F" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#E3070F" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis dataKey="month" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Area type="monotone" dataKey="users" stroke="#E3070F" fillOpacity={1} fill="url(#colorCatalog)" strokeWidth={2} />
                      <Area type="monotone" dataKey="active" stroke="#F2545A" fillOpacity={0.5} fill="#F2545A" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Category Distribution */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Package2 size={20} className="text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">By Category</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <PieChart>
                      <Pie
                        data={chartData.usersByRole}
                        cx="50%"
                        cy="50%"
                        labelLine={false}
                        label={({ name, percent }) => percent !== undefined ? `${name}: ${(percent * 100).toFixed(0)}%` : name}
                        outerRadius={80}
                        fill="#8884d8"
                        dataKey="value"
                      >
                        {chartData.usersByRole.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                        ))}
                      </Pie>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>

                {/* Status Distribution */}
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="flex items-center gap-2 mb-6">
                    <Package2 size={20} className="text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-wider text-foreground">Product Status</h3>
                  </div>
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={chartData.statusDistribution} layout="vertical">
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />
                      <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                      <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={12} width={80} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '8px'
                        }}
                      />
                      <Bar dataKey="value" fill="#E3070F" radius={[0, 8, 8, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </section>
            </>
          ) : params.module === 'fulfillment' ? (
            <>
              <section className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <StatCard title="Active Shipments" value="24" hint="In transit" icon={<Truck size={20} />} />
                <StatCard title="Pick/Pack Queue" value="12" hint="Pending orders" icon={<Package size={20} />} />
                <StatCard title="Avg Delivery Time" value="2.4 days" hint="Last 30 days" icon={<MapPin size={20} />} />
              </section>

              <section className="grid gap-4 grid-cols-1 mt-6">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Quick Actions</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <a href="/fulfillment/pick-pack" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Package size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Pick & Pack</div>
                      <div className="text-xs text-muted-foreground mt-1">Manage processing</div>
                    </a>
                    <a href="/fulfillment/shipments" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Truck size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Shipments</div>
                      <div className="text-xs text-muted-foreground mt-1">Manage dispatches</div>
                    </a>
                    <a href="/fulfillment/tracking" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <MapPin size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Tracking</div>
                      <div className="text-xs text-muted-foreground mt-1">Live parcel tracker</div>
                    </a>
                  </div>
                </div>
              </section>
            </>
          ) : params.module === 'system' ? (
            <>
              <section className="grid gap-4 grid-cols-1 sm:grid-cols-3">
                <StatCard title="System Version" value="v1.4.2" hint="Latest stable" icon={<Settings size={20} />} />
                <StatCard title="Active Webhooks" value="8" hint="Connected integrations" icon={<Share2 size={20} />} />
                <StatCard title="Storage Used" value="42 GB" hint="Database & Assets" icon={<FileText size={20} />} />
              </section>

              <section className="grid gap-4 grid-cols-1 mt-6">
                <div className="rounded-2xl border border-border bg-card p-6">
                  <div className="text-sm font-medium text-muted-foreground mb-4 uppercase tracking-wider">Quick Actions</div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <a href="/system/settings" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Settings size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Settings</div>
                      <div className="text-xs text-muted-foreground mt-1">Global platform config</div>
                    </a>
                    <a href="/system/templates" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <FileText size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Templates</div>
                      <div className="text-xs text-muted-foreground mt-1">Email, SMS, & PDF</div>
                    </a>
                    <a href="/system/webhooks" className="p-4 rounded-xl border border-border hover:border-primary/30 hover:bg-primary/5 transition-all group">
                      <Share2 size={20} className="text-primary mb-2" />
                      <div className="font-medium text-sm">Webhooks</div>
                      <div className="text-xs text-muted-foreground mt-1">Third-party callbacks</div>
                    </a>
                  </div>
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-4">
                <StatCard title="Key Metric 1" value="—" hint="Live KPI" />
                <StatCard title="Key Metric 2" value="—" hint="Live KPI" />
                <StatCard title="Key Metric 3" value="—" hint="Live KPI" />
                <StatCard title="Key Metric 4" value="—" hint="Live KPI" />
              </section>

              <section className="grid gap-4 grid-cols-1 lg:grid-cols-3">
                <div className="lg:col-span-2 relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-6">
                  <div className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Overview</div>
                  <div className="text-foreground">Coming soon: charts and trends for {mod.name}.</div>
                </div>
                <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm p-6">
                  <div className="text-sm font-medium text-muted-foreground mb-3 uppercase tracking-wider">Quick Actions</div>
                  <ul className="space-y-2 text-foreground">
                    <li>Configure module settings</li>
                    <li>Import initial data</li>
                    <li>View recent activity</li>
                  </ul>
                </div>
              </section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
