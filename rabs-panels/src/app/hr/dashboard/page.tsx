'use client';
import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ColumnDef } from '@tanstack/react-table';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { StatCard } from '@/components/stat-card';
import { RichDataTable } from '@/components/rich-data-table';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { useApiAccess } from '@/hooks/use-api-access';
import {
  listEmployees, listLeaveRequests, listPayrollRuns, listTimeEntries,
  getHrReportsSummary, listVisaBoard, listAllComplianceAlerts,
} from '@/lib/api';
import {
  employeeName, flattenHrSummary, formatDate, hrApiError, isApiMissing, visaRiskClass, daysUntil,
  statusBadgeClass as hrStatusBadgeClass,
} from '@/lib/hr-utils';

function severityClass(severity?: string): string {
  if (severity === 'critical') return 'bg-red-500/10 text-red-600';
  if (severity === 'warning') return 'bg-amber-500/10 text-amber-700';
  return 'bg-sky-500/10 text-sky-700';
}
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
  const { can } = useApiAccess();
  const canCreateEmployee = can('POST', '/api/hr/employees');
  const canPostJob = can('POST', '/api/hr/job-postings');
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [visaRisk, setVisaRisk] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);
  const [fallbackReady, setFallbackReady] = useState(false);

  const visaColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        id: 'employee',
        header: 'Employee',
        accessorFn: (r) => r.employeeName || employeeName(r.employee || r),
        cell: ({ row, getValue }) =>
          row.original.employeeId ? (
            <Link href={`/hr/employees/${row.original.employeeId}`} className="font-medium text-brand hover:underline">
              {String(getValue() || '—')}
            </Link>
          ) : (
            <span className="font-medium">{String(getValue() || '—')}</span>
          ),
      },
      { accessorKey: 'visaType', header: 'Visa type', cell: ({ row }) => row.original.visaType || '—' },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => (
          <span className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${hrStatusBadgeClass(row.original.status)}`}>
            {String(row.original.status || '—').replace(/_/g, ' ')}
          </span>
        ),
      },
      {
        id: 'expiry',
        header: 'Expiry date',
        accessorFn: (r) => String(r.visaExpiry || r.expiryDate || '').slice(0, 10),
        cell: ({ getValue }) => formatDate(getValue() as string),
      },
      {
        id: 'daysLeft',
        header: 'Days left',
        accessorFn: (r) => daysUntil(r.visaExpiry || r.expiryDate) ?? Number.MAX_SAFE_INTEGER,
        cell: ({ row }) => {
          const days = daysUntil(row.original.visaExpiry || row.original.expiryDate);
          return (
            <span className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${visaRiskClass(days)}`}>
              {days == null ? '—' : days < 0 ? `Expired ${Math.abs(days)}d ago` : days === 0 ? 'Today' : `${days}d`}
            </span>
          );
        },
      },
    ],
    []
  );

  const reminderColumns = useMemo<ColumnDef<any>[]>(
    () => [
      {
        accessorKey: 'title',
        header: 'Reminder',
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{row.original.title || row.original.message || row.original.alertType}</div>
            {row.original.message && row.original.title ? <div className="text-xs text-muted-foreground truncate max-w-[420px]">{row.original.message}</div> : null}
          </div>
        ),
      },
      {
        id: 'date',
        header: 'Date',
        accessorFn: (r) => String(r.dueDate || r.createdAt || '').slice(0, 10),
        cell: ({ getValue }) => formatDate(getValue() as string),
      },
      {
        accessorKey: 'severity',
        header: 'Severity',
        cell: ({ row }) => (
          <span className={`inline-flex text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${severityClass(row.original.severity)}`}>
            {row.original.severity || 'info'}
          </span>
        ),
      },
      { accessorKey: 'alertType', header: 'Type', cell: ({ row }) => <span className="capitalize">{String(row.original.alertType || '—').replace(/_/g, ' ')}</span> },
      {
        id: 'link',
        header: '',
        enableSorting: false,
        cell: ({ row }) =>
          row.original.employeeId ? (
            <Link href={`/hr/employees/${row.original.employeeId}`} className="text-xs font-semibold text-brand hover:underline whitespace-nowrap">
              {row.original.employee ? `${employeeName(row.original.employee)} →` : 'Open employee →'}
            </Link>
          ) : (
            <Link href="/hr/reports" className="text-xs text-muted-foreground hover:underline">Reports →</Link>
          ),
      },
    ],
    []
  );

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
          const v = await listVisaBoard({ organizationId: orgId, withinDays: 90 });
          setVisaRisk(v.data);
        } catch { /* optional until UK API live */ }

        try {
          const a = await listAllComplianceAlerts({ organizationId: orgId, status: 'open' });
          setAlerts(a.data);
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
              {canCreateEmployee && (
                <Link href="/hr/employees" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-brand hover:bg-brand-600 text-white text-sm font-medium shadow-lg shadow-brand/20">
                  <Users size={14} /> Create employee
                </Link>
              )}
              <Link href="/hr/leave" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium">
                <Calendar size={14} /> Leave
              </Link>
              {canPostJob && (
                <Link href="/hr/recruitment" className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border border-border bg-card text-sm font-medium">
                  <Briefcase size={14} /> Post job
                </Link>
              )}
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

          <section className="glass-panel rounded-2xl border border-border/50 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <ShieldCheck size={16} className="text-brand" /> Visa expiry board
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Expired visas and those expiring in the next 90 days ({visaRisk.length})</p>
              </div>
              <Link href="/hr/immigration" className="text-xs text-brand hover:underline">Open immigration</Link>
            </div>
            <RichDataTable columns={visaColumns} data={visaRisk} initialSorting={[{ id: 'daysLeft', desc: false }]} searchPlaceholder="Search employees or visa types…" />
          </section>

          <section className="glass-panel rounded-2xl border border-border/50 p-5 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="font-semibold flex items-center gap-2">
                  <AlertTriangle size={16} className="text-brand" /> Reminders
                </h3>
                <p className="text-xs text-muted-foreground mt-0.5">Open compliance reminders ({alerts.length})</p>
              </div>
              <Link href="/hr/reports" className="text-xs text-brand hover:underline">Reports</Link>
            </div>
            <RichDataTable columns={reminderColumns} data={alerts} initialSorting={[{ id: 'date', desc: false }]} searchPlaceholder="Search reminders…" />
          </section>
        </main>
      </div>
    </div>
  );
}
