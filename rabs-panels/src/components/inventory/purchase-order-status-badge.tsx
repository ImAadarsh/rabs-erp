'use client';

const STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground border-border',
  submitted: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  confirmed: 'bg-indigo-500/10 text-indigo-600 border-indigo-500/20',
  partial_received: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  received: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  cancelled: 'bg-red-500/10 text-red-600 border-red-500/20'
};

export const PO_STATUS_LABELS: Record<string, string> = {
  draft: 'Draft',
  submitted: 'Submitted',
  confirmed: 'Approved',
  partial_received: 'Partially received',
  received: 'Received',
  cancelled: 'Cancelled'
};

export function PurchaseOrderStatusBadge({ status }: { status?: string | null }) {
  const s = status || 'draft';
  return (
    <span className={`whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold ${STYLES[s] ?? STYLES.draft}`}>
      {PO_STATUS_LABELS[s] ?? s.replace(/_/g, ' ')}
    </span>
  );
}
