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
  getHrReportsSummary, listVisaExpiring, listEmployees, listLeaveRequests,
  listPayrollRuns, listTimeEntries, listComplianceAlerts,
} from '@/lib/api';
import { daysUntil, employeeName, flattenHrSummary, formatDate, formatMoney, hrApiError, isApiMissing, visaRiskClass } from '@/lib/hr-utils';
import { toast } from 'sonner';
import { AlertTriangle, BarChart3, Calendar, Clock, DollarSign, ShieldCheck, Users } from 'lucide-react';

export default function HrReportsPage() {
  const router = useRouter();
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'HR_MANAGER', 'HR_ADMIN', 'FINANCE']);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<any>(null);
  const [visa, setVisa] = useState<any[]>([]);
  const [fallback, setFallback] = useState(false);

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
          setFallback(true);
          const [emp, leave, payroll, time] = await Promise.all([
            listEmployees({ organizationId: orgId }),
            listLeaveRequests({}),
            listPayrollRuns({ organizationId: orgId }),
            listTimeEntries({}),
          ]);
          const employees = emp.data || [];
          const leaveRows = leave.data || [];
          const approvedLeave = leaveRows.filter((l: any) => l.status === 'approved');
          setSummary({
            headcount: employees.length,
            activeEmployees: employees.filter((e: any) => e.status === 'active').length,
            onLeave: employees.filter((e: any) => e.status === 'on_leave').length,
            pendingLeave: leaveRows.filter((l: any) => l.status === 'pending').length,
            approvedLeaveDays: approvedLeave.reduce((s: number, l: any) => s + (Number(l.totalDays) || 0), 0),
            payrollRuns: payroll.data?.length || 0,
            lastPayrollGross: payroll.data?.[0]?.totalGross,
            attendanceEntries: time.data?.length || 0,
            overtimeHours: (time.data || []).reduce((s: number, t: any) => s + (Number(t.overtimeHours) || 0), 0),
            visaAtRisk: 0,
          });
        }
        try {
          const v = await listVisaExpiring({ organizationId: orgId, withinDays: 90 });
          const rows = Array.isArray(v.data) ? v.data : [];
          setVisa(rows);
          setSummary((s: any) => ({ ...s, visaAtRisk: rows.length ?? s?.visaAtRisk }));
        } catch {
          try {
            await listComplianceAlerts({ organizationId: orgId });
          } catch { /* optional */ }
        }
      } catch (err) {
        toast.error(hrApiError(err, 'Failed to load reports'));
      } finally {
        setLoading(false);
      }
    })();
  }, [hydrated, hasAccess, router, session?.accessToken, session?.user?.organizationId]);

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col min-w-0 lg:ml-[280px]">
        <Header title="HR · Reports & Compliance" />
        <main className="p-6 md:p-8 space-y-6">
          {fallback && (
            <div className="flex items-start gap-3 rounded-xl border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700">
              <AlertTriangle size={18} className="mt-0.5 shrink-0" />
              <div className="text-sm">
                <div className="font-semibold">Summary API not live — derived metrics</div>
                <div className="text-xs mt-0.5 opacity-80">Full <code className="font-mono">GET /api/hr/reports/summary</code> will replace these counts.</div>
              </div>
            </div>
          )}

          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard title="Headcount" value={loading ? '…' : String(summary?.headcount ?? '—')} hint="All staff" icon={<Users size={20} />} />
            <StatCard title="Active" value={loading ? '…' : String(summary?.activeEmployees ?? '—')} hint={`${summary?.onLeave ?? 0} on leave`} icon={<Users size={20} />} />
            <StatCard title="Leave pending" value={loading ? '…' : String(summary?.pendingLeave ?? '—')} hint={`${summary?.approvedLeaveDays ?? '—'} approved days`} icon={<Calendar size={20} />} />
            <StatCard title="Visa risk" value={loading ? '…' : String(summary?.visaAtRisk ?? visa.length)} hint="Within 90 days" icon={<ShieldCheck size={20} />} />
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="glass-panel rounded-2xl border border-border/50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold mb-3"><DollarSign size={16} className="text-brand" /> Payroll summary</div>
              <div className="text-2xl font-bold">{summary?.payrollRuns ?? '—'} <span className="text-sm font-normal text-muted-foreground">runs</span></div>
              <div className="text-xs text-muted-foreground mt-1">
                Latest gross {formatMoney(summary?.lastPayrollGross ?? summary?.payrollGross)}
              </div>
              <Link href="/hr/payroll" className="text-xs text-brand hover:underline mt-3 inline-block">Open payroll</Link>
            </div>
            <div className="glass-panel rounded-2xl border border-border/50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold mb-3"><Clock size={16} className="text-brand" /> Attendance</div>
              <div className="text-2xl font-bold">{summary?.attendanceEntries ?? '—'}</div>
              <div className="text-xs text-muted-foreground mt-1">Overtime {summary?.overtimeHours ?? '—'}h</div>
              <Link href="/hr/attendance" className="text-xs text-brand hover:underline mt-3 inline-block">Open attendance</Link>
            </div>
            <div className="glass-panel rounded-2xl border border-border/50 p-5">
              <div className="flex items-center gap-2 text-sm font-semibold mb-3"><BarChart3 size={16} className="text-brand" /> Compliance</div>
              <div className="text-2xl font-bold text-brand">{visa.length}</div>
              <div className="text-xs text-muted-foreground mt-1">Visa reminders in board</div>
              <Link href="/hr/immigration" className="text-xs text-brand hover:underline mt-3 inline-block">Immigration board</Link>
            </div>
          </div>

          <section className="glass-panel rounded-2xl border border-border/50 overflow-hidden">
            <div className="px-5 py-4 border-b border-border/50 font-semibold text-sm">Visa risk detail</div>
            {visa.length === 0 && <div className="p-8 text-center text-sm text-muted-foreground">No visa risk rows loaded.</div>}
            {visa.map((row: any) => {
              const days = daysUntil(row.visaExpiry || row.expiryDate);
              return (
                <div key={row.id || `${row.employeeId}-${row.visaExpiry}`} className="px-5 py-3 border-b border-border/30 last:border-0 flex justify-between gap-3 text-sm">
                  <div>
                    <Link href={`/hr/employees/${row.employeeId || row.employee?.id}`} className="font-medium text-brand hover:underline">
                      {row.employeeName || employeeName(row.employee || row)}
                    </Link>
                    <div className="text-xs text-muted-foreground">{row.visaType || '—'}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-xs text-muted-foreground">{formatDate(row.visaExpiry || row.expiryDate)}</div>
                    <span className={`inline-flex mt-1 text-[10px] font-bold uppercase px-2 py-0.5 rounded-full ${visaRiskClass(days)}`}>
                      {days == null ? '—' : days < 0 ? 'Overdue' : `${days}d`}
                    </span>
                  </div>
                </div>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
