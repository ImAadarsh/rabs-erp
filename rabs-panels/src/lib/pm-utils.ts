export function pmApiError(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as any;
  return (
    e?.response?.data?.error?.message ||
    e?.response?.data?.message ||
    e?.message ||
    fallback
  );
}

export function userLabel(u?: {
  firstName?: string;
  lastName?: string;
  email?: string;
  name?: string;
} | null): string {
  if (!u) return '—';
  if (u.name) return u.name;
  const full = [u.firstName, u.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  return u.email || '—';
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

export const PROJECT_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'active', label: 'Active' },
  { value: 'on_hold', label: 'On Hold' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const TASK_STATUSES = [
  { value: 'todo', label: 'To Do' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'blocked', label: 'Blocked' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const TASK_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;

export const WORK_ORDER_STATUSES = [
  { value: 'draft', label: 'Draft' },
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const MILESTONE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'achieved', label: 'Achieved' },
  { value: 'missed', label: 'Missed' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const DELIVERABLE_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'done', label: 'Done' },
  { value: 'cancelled', label: 'Cancelled' },
] as const;

export const MEMBER_ROLES = [
  { value: 'owner', label: 'Owner' },
  { value: 'manager', label: 'Manager' },
  { value: 'member', label: 'Member' },
  { value: 'viewer', label: 'Viewer' },
] as const;

export function statusBadgeClass(status?: string): string {
  switch (String(status || '').toLowerCase()) {
    case 'active':
    case 'open':
    case 'in_progress':
    case 'achieved':
    case 'delivered':
    case 'accepted':
    case 'done':
    case 'completed':
      return 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
    case 'draft':
    case 'todo':
    case 'pending':
      return 'bg-brand/10 text-brand border-brand/25';
    case 'blocked':
    case 'on_hold':
    case 'missed':
      return 'bg-orange-500/10 text-orange-600 border-orange-500/20';
    case 'cancelled':
    case 'urgent':
    case 'high':
      return 'bg-rose-500/10 text-rose-600 border-rose-500/20';
    default:
      return 'bg-muted/40 text-muted-foreground border-border';
  }
}

export function progressBarColor(pct?: number | null): string {
  const n = Number(pct) || 0;
  if (n >= 100) return 'bg-emerald-500';
  if (n >= 60) return 'bg-brand';
  if (n >= 30) return 'bg-blue-500';
  return 'bg-muted-foreground/40';
}
