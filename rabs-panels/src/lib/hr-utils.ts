export function hrApiError(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as any;
  return (
    e?.response?.data?.error?.message ||
    e?.response?.data?.message ||
    e?.message ||
    fallback
  );
}

export function isApiMissing(err: unknown): boolean {
  const status = (err as any)?.response?.status;
  return status === 404 || status === 501;
}

export function employeeName(e?: {
  firstName?: string;
  lastName?: string;
  employeeNumber?: string;
  email?: string;
  employeeName?: string;
} | null): string {
  if (!e) return '—';
  if (typeof (e as any).employeeName === 'string' && (e as any).employeeName.trim()) {
    return (e as any).employeeName.trim();
  }
  const full = [e.firstName, e.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return e.employeeNumber || e.email || '—';
}

/** Flatten nested UK reports summary into dashboard-friendly scalars. */
export function flattenHrSummary(raw: any): Record<string, any> {
  if (!raw || typeof raw !== 'object') return {};
  const head = raw.headcount && typeof raw.headcount === 'object' ? raw.headcount : null;
  return {
    ...raw,
    headcount: head ? head.total ?? (Number(head.active || 0) + Number(head.onLeave || 0) + Number(head.terminated || 0)) : raw.headcount,
    activeEmployees: raw.activeEmployees ?? head?.active,
    onLeave: raw.onLeave ?? head?.onLeave,
    pendingLeave: raw.pendingLeave ?? raw.pendingLeaveRequests,
    visaAtRisk: raw.visaAtRisk ?? raw.compliance?.visasExpiringWithin90Days,
  };
}

export function formatMoney(amount?: number | null, currency = 'GBP'): string {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

export function formatDate(value?: string | Date | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

export function formatDateTime(value?: string | Date | null): string {
  if (!value) return '—';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function daysUntil(value?: string | Date | null): number | null {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(d);
  target.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - today.getTime()) / 86400000);
}

export function visaRiskClass(days: number | null): string {
  if (days == null) return 'bg-muted text-muted-foreground';
  if (days < 0) return 'bg-red-500/15 text-red-600';
  if (days <= 30) return 'bg-red-500/10 text-red-600';
  if (days <= 90) return 'bg-amber-500/10 text-amber-700';
  return 'bg-emerald-500/10 text-emerald-700';
}

export function statusBadgeClass(status?: string): string {
  const s = (status || '').toLowerCase();
  if (['active', 'approved', 'enrolled', 'verified', 'paid', 'hired', 'completed'].includes(s)) {
    return 'bg-emerald-500/10 text-emerald-700';
  }
  if (['pending', 'draft', 'eligible', 'interview', 'scheduled', 'calculated'].includes(s)) {
    return 'bg-amber-500/10 text-amber-700';
  }
  if (['rejected', 'expired', 'terminated', 'cancelled', 'lapsed'].includes(s)) {
    return 'bg-red-500/10 text-red-600';
  }
  if (['on_leave', 'deferred', 'offer', 'screening'].includes(s)) {
    return 'bg-sky-500/10 text-sky-700';
  }
  return 'bg-muted text-muted-foreground';
}

export const LEAVE_TYPES = [
  { value: 'vacation', label: 'Annual leave' },
  { value: 'sick', label: 'Sick' },
  { value: 'personal', label: 'Personal' },
  { value: 'maternity', label: 'Maternity' },
  { value: 'paternity', label: 'Paternity' },
  { value: 'bereavement', label: 'Bereavement' },
  { value: 'unpaid', label: 'Unpaid' },
  { value: 'other', label: 'Other' },
] as const;

export const APPLICANT_STAGES = [
  { value: 'applied', label: 'Applied' },
  { value: 'screening', label: 'Screening' },
  { value: 'interview', label: 'Interview' },
  { value: 'offer', label: 'Offer' },
  { value: 'hired', label: 'Hired' },
  { value: 'rejected', label: 'Rejected' },
] as const;

export const VISA_TYPES = [
  { value: 'british_citizen', label: 'British Citizen' },
  { value: 'settled', label: 'Settled status' },
  { value: 'pre_settled', label: 'Pre-settled' },
  { value: 'skilled_worker', label: 'Skilled Worker' },
  { value: 'student', label: 'Student' },
  { value: 'spouse', label: 'Spouse / Partner' },
  { value: 'other', label: 'Other' },
  { value: 'unknown', label: 'Unknown' },
] as const;
