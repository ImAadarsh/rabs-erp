export function crmApiError(err: unknown, fallback = 'Something went wrong'): string {
  const e = err as any;
  return (
    e?.response?.data?.error?.message ||
    e?.response?.data?.message ||
    e?.message ||
    fallback
  );
}

export function displayName(entity?: {
  firstName?: string;
  lastName?: string;
  companyName?: string;
  company?: string;
  name?: string;
  email?: string;
} | null): string {
  if (!entity) return '—';
  if (entity.name) return entity.name;
  const full = [entity.firstName, entity.lastName].filter(Boolean).join(' ').trim();
  if (full) return full;
  if (entity.companyName || entity.company) return entity.companyName || entity.company || '—';
  if (entity.email) return entity.email;
  return '—';
}

export function formatMoney(amount?: number | null, currency = 'GBP'): string {
  if (amount == null || Number.isNaN(Number(amount))) return '—';
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(Number(amount));
  } catch {
    return `${currency} ${Number(amount).toFixed(2)}`;
  }
}

export const LEAD_STATUSES = [
  { value: 'new', label: 'New' },
  { value: 'contacted', label: 'Contacted' },
  { value: 'qualified', label: 'Qualified' },
  { value: 'unqualified', label: 'Unqualified' },
  { value: 'converted', label: 'Converted' },
  { value: 'lost', label: 'Lost' },
] as const;

export const LEAD_SOURCES = [
  { value: 'website', label: 'Website' },
  { value: 'referral', label: 'Referral' },
  { value: 'cold_call', label: 'Cold Call' },
  { value: 'trade_show', label: 'Trade Show' },
  { value: 'email', label: 'Email' },
  { value: 'social', label: 'Social' },
  { value: 'partner', label: 'Partner' },
  { value: 'other', label: 'Other' },
] as const;

export const LEAD_PRIORITIES = [
  { value: 'low', label: 'Low' },
  { value: 'medium', label: 'Medium' },
  { value: 'high', label: 'High' },
  { value: 'urgent', label: 'Urgent' },
] as const;

export const ACTIVITY_TYPES = [
  { value: 'task', label: 'Task' },
  { value: 'call', label: 'Call' },
  { value: 'meeting', label: 'Meeting' },
  { value: 'note', label: 'Note' },
] as const;

export const PIPELINE_TYPES = [
  { value: 'onboarding', label: 'Retailer Onboarding' },
  { value: 'expansion', label: 'Account Expansion' },
  { value: 'credit', label: 'Credit & Terms' },
] as const;
