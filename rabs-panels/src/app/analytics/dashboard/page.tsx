'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { listDashboards, listReportDefinitions, listScheduledReports, listDataExports } from '@/lib/api';
import { LineChart, FileText, CalendarClock, Download } from 'lucide-react';
import Link from 'next/link';

export default function AnalyticsDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState({
    dashboards: 0,
    reports: 0,
    scheduled: 0,
    exports: 0,
  });

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    (async () => {
      try {
        const [dashRes, repRes, schedRes, expRes] = await Promise.all([
          listDashboards(),
          listReportDefinitions(),
          listScheduledReports(),
          listDataExports()
        ]);

        setStats({
          dashboards: dashRes.data?.length || 0,
          reports: repRes.data?.length || 0,
          scheduled: schedRes.data?.length || 0,
          exports: expRes.data?.length || 0,
        });
      } catch (e: any) {
        console.error('Failed to load analytics stats:', e);
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
          <Header title="Analytics · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-muted-foreground animate-pulse">Loading...</div>
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
          <Header title="Analytics · Dashboard" />
          <main className="flex-1 overflow-auto p-4 md:p-6">
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <h2 className="text-2xl font-bold mb-2 text-destructive">Access Denied</h2>
                <p className="text-muted-foreground">You do not have permission to view the Analytics Dashboard.</p>
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
        <Header title="Analytics · Dashboard" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="space-y-6">
            <div>
              <h1 className="text-3xl font-bold mb-2">Analytics & Reporting Hub</h1>
              <p className="text-muted-foreground">Control center for business intelligence, data exports, and scheduled reports.</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard title="Dashboards Configured" value={stats.dashboards.toString()} icon={<LineChart className="h-5 w-5" />} hint="Interactive views" />
              <StatCard title="Report Definitions" value={stats.reports.toString()} icon={<FileText className="h-5 w-5" />} hint="Saved report structures" />
              <StatCard title="Scheduled Jobs" value={stats.scheduled.toString()} icon={<CalendarClock className="h-5 w-5" />} hint="Automated deliveries" />
              <StatCard title="Data Exports" value={stats.exports.toString()} icon={<Download className="h-5 w-5" />} hint="Bulk raw data extractions" />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
              <Link href="/analytics/reports" className="p-6 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors">
                <FileText className="h-8 w-8 mb-4 text-primary" />
                <h3 className="font-semibold mb-2">Report Library</h3>
                <p className="text-sm text-muted-foreground">Browse, create, and execute custom reports across all modules.</p>
              </Link>
              <Link href="/analytics/scheduled-reports" className="p-6 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors">
                <CalendarClock className="h-8 w-8 mb-4 text-primary" />
                <h3 className="font-semibold mb-2">Automation</h3>
                <p className="text-sm text-muted-foreground">Configure automated email deliveries of daily/weekly reports.</p>
              </Link>
              <Link href="/analytics/exports" className="p-6 bg-card rounded-lg border border-border hover:border-primary/50 transition-colors">
                <Download className="h-8 w-8 mb-4 text-primary" />
                <h3 className="font-semibold mb-2">Data Exports</h3>
                <p className="text-sm text-muted-foreground">Export large volumes of raw system data to CSV, Excel, or JSON.</p>
              </Link>
              <div className="p-6 bg-muted/50 rounded-lg border border-border cursor-not-allowed opacity-70">
                <LineChart className="h-8 w-8 mb-4 text-muted-foreground" />
                <h3 className="font-semibold mb-2">Custom Dashboards</h3>
                <p className="text-sm text-muted-foreground">Coming soon: Build drag-and-drop interactive visualizations.</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
