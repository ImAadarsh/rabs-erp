'use client';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import {
  listEmployees, listLeaveRequests, listPayrollRuns, listTimeEntries,
  getHrReportsSummary, listVisaExpiring, listComplianceAlerts,
} from '@/lib/api';
import { employeeName, flattenHrSummary, formatDate, hrApiError, isApiMissing, visaRiskClass, daysUntil } from '@/lib/hr-utils';
import {
  Users, Calendar, Clock, DollarSign, AlertTriangle, ShieldCheck,
  FileText, Briefcase, UserCheck, ClipboardList, PiggyBank, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';

const QUICK_LINKS = [
  { href: '/hr/employees', label: 'Employees', icon: Users, hint: 'Records & 360' },
  { href: '/hr/immigration', label: 'Immigration & RTW', icon: ShieldCheck, hint: 'Visa & compliance' },
  { href: '/hr/leave', label: 'Leave', icon: Calendar, hint: 'Request & approve' },
  { href: '/hr/attendance', label: 'Attendance', icon: Clock, hint: 'Hours & overtime' },
  { href: '/hr/payroll', label: 'Payroll', icon: DollarSign, hint: 'Runs & payslips' },
  { href: '/hr/pension', label: 'Pension', icon: PiggyBank, hint: 'Auto-enrolment' },
  { href: '/hr/documents', label: 'Documents', icon: FileText, hint: 'Contracts & RTW' },
  { href: '/hr/recruitment', label: 'Recruitment', icon: Briefcase, hint: 'Jobs & applicants' },
  { href: '/hr/onboarding', label: 'Onboarding', icon: ClipboardList, hint: 'Checklists' },
  { href: '/hr/self-service', label: 'Self-service', icon: UserCheck, hint: 'My HR' },
  { href: '/hr/reports', label: 'Reports', icon: BarChart3, hint: 'Compliance' },
];

export default function HRDashboard() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [visaRisk, setVisaRisk] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [fallbackReady, setFallbackReady] = useState(false);

  useEffect(() => {
    if (!hydrated || !hasAccess) return;
    if (!session?.accessToken) {
      router.replace('/login');
      return;
    }
    const orgId = session?.user?.organizationId;
    (async () => {
      try {
        try {
          const res = await getHrReportsSummary({ organizationId: orgId });
          setSummary(flattenHrSummary(res.data || {}));
        } catch (err) {
          if (!isApiMissing(err)) throw err;
          const [emp, leave, payroll, time] = await Promise.all([
            listEmployees({ organizationId: orgId }),
            listLeaveRequests({ status: 'pending' }),
            listPayrollRuns({ organizationId: orgId }),
            listTimeEntries({}),
          ]);
          const employees = emp.data || [];
          setSummary({
            headcount: employees.length,
            activeEmployees: employees.filter((e: any) => e.status === 'active').length,
            pendingLeave: leave.data?.length || 0,
            payrollRuns: payroll.data?.length || 0,
            attendanceEntries: time.data?.length || 0,
            visaAtRisk: 0,
          });
          setFallbackReady(true);
        }

        try {
          const v = await listVisaExpiring({ organizationId: orgId, withinDays: 90, limit: 8 });
          setVisaRisk(Array.isArray(v.data) ? v.data : []);
        } catch { /* optional until UK API live */ }

        try {
          const a = await listComplianceAlerts({ organizationId: orgId, limit: 8 });
          setAlerts(a.data || []);
        } catch { /* optional */ }
      } catch (e) {
        toast.error(hrApiError(e, 'Failed to load HR dashboard'));
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
          <Header title="HR · Dashboard" />
          <main className="flex-1 p-6 text-muted-foreground">Loading…</main>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="min-h-screen app-surface">
        <Sidebar />
        <div className="flex flex-col overflow-hidden lg:ml-[280px]">
          <Header title="HR · Dashboard" />
          <main className="flex-1 p-6">
            <h2 className="text-xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground mt-1">You do not have permission to view HR.</p>
          </main>
        </div>
      </div>
    );
  }

  const headcount = summary?.headcount ?? summary?.totalEmployees ?? '—';
  const active = summary?.activeEmployees ?? '—';
  const pendingLeave = summary?.pendingLeave ?? summary?.pendingLeaveRequests ?? '—';
  const visaAtRisk = summary?.visaAtRisk ?? visaRisk.length ?? '—';

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Dashboard" />
        <main className="p-6 md:p-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="text-2xl font-bold tracking-tight">UK HR</h1>
              <p className="text-sm text-muted-foreground mt-0.5">People, leave, payroll &amp; compliance</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Link href="/hr/employees" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20">
                <Users size={14} /> Create employee
              </Link>
              <Link href="/hr/leave" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium">
                <Calendar size={14} /> Leave
              </Link>
              <Link href="/hr/recruitment" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium">
                <Briefcase size={14} /> Post job
              </Link>
            </div>
          </div>

          {fallbackReady && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 dark:text-amber-400">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">UK HR summary API not deployed yet</div>
                <div className="text-xs mt-0.5 opacity-80">
                  Showing counts from existing <code className="font-mono">/api/hr/*</code> resources. Full reports arrive with <code className="font-mono">GET /api/hr/reports/summary</code>.
                </div>
              </div>
            </div>
          )}

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Headcount" value={String(headcount)} hint="All employees" icon={<Users size={20} />} />
            <StatCard title="Active" value={String(active)} hint="Currently employed" icon={<UserCheck size={20} />} />
            <StatCard title="Pending leave" value={String(pendingLeave)} hint="Awaiting approval" icon={<Calendar size={20} />} />
            <StatCard title="Visa risk (90d)" value={String(visaAtRisk)} hint="Expiring soon" icon={<AlertTriangle size={20} />} />
          </div>

          <div>
            <h2 className="text-sm font-bold uppercase tracking-[0.14em] text-muted-foreground mb-3">Modules</h2>
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-3 xl:grid-cols-4">
              {QUICK_LINKS.map((link) => {
                const Icon = link.icon;
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    className="glass-panel rounded-2xl border border-border/50 p-3.5 text-left hover:border-brand/45 hover:shadow-sm transition group"
                  >
                    <div className="p-2 rounded-lg bg-brand/10 text-brand w-fit mb-2.5 group-hover:scale-105 transition">
                      <Icon size={18} />
                    </div>
                    <div className="font-semibold text-sm text-foreground">{link.label}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{link.hint}</div>
                  </Link>
                );
              })}
            </div>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <section className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <ShieldCheck size={16} className="text-brand" /> Visa expiry board
                </h3>
                <Link href="/hr/immigration" className="text-xs text-brand hover:underline">Open</Link>
              </div>
              <div className="divide-y divide-border/40">
                {visaRisk.length === 0 && (
                  <div className="px-5 py-8 text-sm text-muted-foreground text-center">
                    No visa risks loaded — open Immigration once the compliance API is live.
                  </div>
                )}
                {visaRisk.map((row: any) => {
                  const expiry = row.visaExpiry || row.expiryDate;
                  const days = daysUntil(expiry);
                  return (
                    <div key={row.id || row.employeeId} className="px-5 py-3 flex items-center justify-between gap-3">
                      <div>
                        <div className="font-medium text-sm">{row.employeeName || employeeName(row.employee || row)}</div>
                        <div className="text-xs text-muted-foreground">{row.visaType || row.status || '—'}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-xs text-muted-foreground">{formatDate(expiry)}</div>
                        <span className={`inline-flex mt-1 text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${visaRiskClass(days)}`}>
                          {days == null ? '—' : days < 0 ? `${Math.abs(days)}d overdue` : `${days}d`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
              <div className="px-5 py-4 border-b border-border/50 flex items-center justify-between">
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="text-brand" /> Reminders
                </h3>
                <Link href="/hr/reports" className="text-xs text-brand hover:underline">Reports</Link>
              </div>
              <div className="divide-y divide-border/40">
                {alerts.length === 0 && (
                  <div className="px-5 py-8 text-sm text-muted-foreground text-center">
                    No compliance reminders yet.
                  </div>
                )}
                {alerts.map((a: any) => (
                  <div key={a.id} className="px-5 py-3">
                    <div className="font-medium text-sm">{a.title || a.message || a.type}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {formatDate(a.dueAt || a.createdAt)} · {a.severity || a.status || 'open'}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
