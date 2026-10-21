'use client';

const STYLES: Record<string, string> = {
  active: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20',
  inactive: 'bg-gray-500/10 text-gray-600 border-gray-500/20',
  maintenance: 'bg-amber-500/10 text-amber-700 border-amber-500/20',
  full: 'bg-blue-500/10 text-blue-700 border-blue-500/20'
};

/** Status pill for warehouses and bins (active / inactive / maintenance / full). */
export function LocationStatusBadge({ status, title }: { status?: string | null; title?: string }) {
  const s = status || 'active';
  return (
    <span
      title={title}
      className={`inline-flex whitespace-nowrap rounded-full border px-2.5 py-0.5 text-xs font-semibold capitalize ${STYLES[s] ?? STYLES.inactive}`}
    >
      {s}
    </span>
  );
}

/** Warehouses that may be picked for new stock operations. */
export function activeWarehouses<T extends { status?: string | null }>(warehouses: T[]): T[] {
  return warehouses.filter((w) => (w.status ?? 'active') === 'active');
}

/** Bins that may receive putaway / moves: the bin and its warehouse must both be active. */
export function activeBins<T extends { status?: string | null; warehouse?: { status?: string | null } | null }>(bins: T[]): T[] {
  return bins.filter((b) => (b.status ?? 'active') === 'active' && (b.warehouse?.status ?? 'active') === 'active');
}
