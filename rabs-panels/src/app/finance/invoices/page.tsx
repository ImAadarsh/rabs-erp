'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSession } from '@/hooks/use-session';
import { useRoleCheck } from '@/hooks/use-role-check';
import { Sidebar } from '@/components/sidebar';
import { Header } from '@/components/header';
import { RichDataTable } from '@/components/rich-data-table';
import { FilterBar, type FilterField } from '@/components/filter-bar';
import {
  listInvoices,
  listUninvoicedOrders,
  generateInvoices,
  listOrderSyncConnections,
  type OrderSyncConnection
} from '@/lib/api';
import { Receipt, Eye, RefreshCw, FilePlus2, Store, Monitor } from 'lucide-react';
import { ColumnDef } from '@tanstack/react-table';
import { toast } from 'sonner';

type InvoiceRow = {
  id: string;
  invoiceNumber: string;
  invoiceDate?: string;
  dueDate?: string | null;
  currency?: string;
  total?: number | string;
  paidAmount?: number | string;
  status?: string;
  customerName?: string | null;
  customer?: {
    firstName?: string | null;
    lastName?: string | null;
    companyName?: string | null;
    email?: string | null;
  } | null;
  order?: {
    id?: string;
    orderNumber?: string;
    channel?: string;
    channelConnection?: { id: string; name: string; storeUrl?: string | null } | null;
  } | null;
};

const CHANNEL_LABELS: Record<string, string> = {
  pos: 'POS / EPOS',
  woocommerce: 'WooCommerce',
  shopify: 'Shopify',
  amazon: 'Amazon',
  ebay: 'eBay',
  etsy: 'Etsy',
  tiktok: 'TikTok',
  wix: 'Wix',
  b2b_portal: 'B2B Portal',
  phone: 'Phone',
  email: 'Email',
  other: 'Other'
};

const badge = (variant: string) => {
  const base = 'px-2.5 py-0.5 rounded-full text-xs font-semibold whitespace-nowrap border ';
  if (variant === 'success') return base + 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20';
  if (variant === 'destructive') return base + 'bg-red-500/10 text-red-600 border-red-500/20';
  if (variant === 'warning') return base + 'bg-yellow-500/10 text-yellow-600 border-yellow-500/20';
  if (variant === 'default') return base + 'bg-primary/10 text-primary border-primary/20';
  return base + 'bg-muted text-muted-foreground border-border';
};

function money(amount: number | string | undefined, currency = 'GBP') {
  const n = Number(amount ?? 0);
  try {
    return new Intl.NumberFormat('en-GB', { style: 'currency', currency }).format(n);
  } catch {
    return `${currency} ${n.toFixed(2)}`;
  }
}

function customerLabel(row: InvoiceRow) {
  return (
    row.customerName ||
    row.customer?.companyName ||
    [row.customer?.firstName, row.customer?.lastName].filter(Boolean).join(' ') ||
    row.customer?.email ||
    '—'
  );
}

export default function InvoicesPage() {
  const { session, hydrated } = useSession();
  const { hasAccess } = useRoleCheck(['ADMIN', 'SUPER_ADMIN', 'FINANCE']);
  const [data, setData] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [filters, setFilters] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [summary, setSummary] = useState({
    count: 0,
    totalInvoiced: 0,
    totalPaid: 0,
    totalOutstanding: 0,
    overdueCount: 0
  });
  const [uninvoiced, setUninvoiced] = useState<{
    count: number;
    byChannel: Array<{ channel: string; store: string | null; count: number; value: number }>;
  } | null>(null);
  const [connections, setConnections] = useState<OrderSyncConnection[]>([]);

  const orgId = session?.user?.organizationId;

  const loadData = useCallback(async () => {
    if (!orgId) return;
    try {
      setLoading(true);
      const [res, pending] = await Promise.all([
        listInvoices(orgId, { search: search || undefined, ...filters }),
        listUninvoicedOrders(orgId).catch(() => null)
      ]);
      setData(res.data || []);
      setSummary({
        count: res.summary?.count ?? res.data?.length ?? 0,
        totalInvoiced: res.summary?.totalInvoiced ?? 0,
        totalPaid: res.summary?.totalPaid ?? 0,
        totalOutstanding: res.summary?.totalOutstanding ?? 0,
        overdueCount: res.summary?.overdueCount ?? 0
      });
      if (pending?.data) {
        setUninvoiced({ count: pending.data.count, byChannel: pending.data.byChannel });
      }
    } catch {
      toast.error('Failed to load invoices');
    } finally {
      setLoading(false);
    }
  }, [orgId, search, filters]);

  useEffect(() => {
    if (hydrated && hasAccess && orgId) void loadData();
  }, [hydrated, hasAccess, orgId, loadData]);

  useEffect(() => {
    if (!hydrated || !hasAccess || !orgId) return;
    listOrderSyncConnections({ organizationId: orgId })
      .then((res) => setConnections(res.data || []))
      .catch(() => {});
  }, [hydrated, hasAccess, orgId]);

  async function onGenerate() {
    if (!orgId || generating) return;
    try {
      setGenerating(true);
      const res = await generateInvoices({ organizationId: orgId });
      if (res.data.created === 0) {
        toast.message('All channel orders already have invoices');
      } else {
        toast.success(`Created ${res.data.created} invoice(s) in unified format`);
      }
      if (res.data.skipped?.length) {
        toast.message(`Skipped ${res.data.skipped.length} (already invoiced)`);
      }
      await loadData();
    } catch (e: any) {
      toast.error(e?.response?.data?.error?.message || e?.message || 'Failed to generate invoices');
    } finally {
      setGenerating(false);
    }
  }

  const filterFields = useMemo<FilterField[]>(
    () => [
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        primary: true,
        options: [
          'draft',
          'sent',
          'viewed',
          'partially_paid',
          'paid',
          'overdue',
          'cancelled',
          'written_off'
        ].map((v) => ({ value: v, label: v.replace(/_/g, ' ') }))
      },
      {
        key: 'channel',
        label: 'Channel',
        type: 'select',
        primary: true,
        options: Object.entries(CHANNEL_LABELS).map(([value, label]) => ({ value, label }))
      },
      {
        key: 'connectionId',
        label: 'Store / Till',
        type: 'select',
        primary: true,
        options: connections.map((c) => ({
          value: c.id,
          label: `${c.kind === 'pos' ? 'POS' : 'Web'} · ${c.name}`
        }))
      },
      {
        key: 'outstanding',
        label: 'Balance',
        type: 'select',
        primary: true,
        options: [{ value: 'true', label: 'Outstanding only' }]
      },
      { key: 'dateFrom', label: 'Invoice from', type: 'date' },
      { key: 'dateTo', label: 'Invoice to', type: 'date' },
      { key: 'minAmount', label: 'Min total', type: 'number', placeholder: '0.00' },
      { key: 'maxAmount', label: 'Max total', type: 'number', placeholder: '0.00' },
      {
        key: 'currency',
        label: 'Currency',
        type: 'select',
        options: ['GBP', 'USD', 'EUR'].map((v) => ({ value: v, label: v }))
      },
      {
        key: 'sortBy',
        label: 'Sort by',
        type: 'select',
        options: [
          { value: 'invoiceDate', label: 'Invoice date' },
          { value: 'total', label: 'Total' },
          { value: 'dueDate', label: 'Due date' },
          { value: 'invoiceNumber', label: 'Invoice number' }
        ]
      },
      {
        key: 'sortDir',
        label: 'Sort direction',
        type: 'select',
        options: [
          { value: 'DESC', label: 'Descending' },
          { value: 'ASC', label: 'Ascending' }
        ]
      }
    ],
    [connections]
  );

  const columns = useMemo<ColumnDef<InvoiceRow>[]>(
    () => [
      {
        accessorKey: 'invoiceNumber',
        header: 'Invoice #',
        cell: ({ row }) => (
          <Link
            href={`/finance/invoices/${row.original.id}`}
            className="font-semibold text-primary hover:underline"
          >
            {row.original.invoiceNumber}
          </Link>
        )
      },
      {
        id: 'customer',
        header: 'Customer',
        accessorFn: (r) => customerLabel(r),
        cell: ({ row }) => (
          <div className="min-w-0">
            <div className="font-medium">{customerLabel(row.original)}</div>
            {row.original.customer?.email && (
              <div className="truncate text-xs text-muted-foreground">
                {row.original.customer.email}
              </div>
            )}
          </div>
        )
      },
      {
        id: 'order',
        header: 'Order',
        accessorFn: (r) => r.order?.orderNumber ?? '',
        cell: ({ row }) =>
          row.original.order?.orderNumber ? (
            <Link
              href={`/orders/orders/${row.original.order.id}`}
              className="text-sm hover:underline"
            >
              {row.original.order.orderNumber}
            </Link>
          ) : (
            <span className="text-muted-foreground">—</span>
          )
      },
      {
        id: 'channel',
        header: 'Channel',
        accessorFn: (r) => r.order?.channel ?? '',
        cell: ({ row }) => {
          const ch = row.original.order?.channel;
          if (!ch) return <span className="text-muted-foreground">—</span>;
          return (
            <span className="whitespace-nowrap rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
              {CHANNEL_LABELS[ch] ?? ch}
            </span>
          );
        }
      },
      {
        id: 'store',
        header: 'Store / Source',
        accessorFn: (r) => r.order?.channelConnection?.name ?? '',
        cell: ({ row }) => {
          const conn = row.original.order?.channelConnection;
          if (!conn) return <span className="text-muted-foreground">—</span>;
          const isPos = row.original.order?.channel === 'pos';
          return (
            <div className="flex items-center gap-2">
              {isPos ? (
                <Store size={14} className="shrink-0 text-muted-foreground" />
              ) : (
                <Monitor size={14} className="shrink-0 text-muted-foreground" />
              )}
              <span className="font-medium">{conn.name}</span>
            </div>
          );
        }
      },
      {
        accessorKey: 'invoiceDate',
        header: 'Date',
        cell: ({ row }) => (
          <span className="whitespace-nowrap">
            {row.original.invoiceDate
              ? new Date(row.original.invoiceDate).toLocaleDateString('en-GB')
              : '—'}
          </span>
        )
      },
      {
        accessorKey: 'total',
        header: 'Total',
        cell: ({ row }) => (
          <span className="whitespace-nowrap font-semibold">
            {money(row.original.total, row.original.currency)}
          </span>
        )
      },
      {
        id: 'balance',
        header: 'Balance',
        accessorFn: (r) => Number(r.total ?? 0) - Number(r.paidAmount ?? 0),
        cell: ({ row }) => {
          const bal = Number(row.original.total ?? 0) - Number(row.original.paidAmount ?? 0);
          return (
            <span
              className={`whitespace-nowrap tabular-nums ${bal > 0.009 ? 'text-red-600' : 'text-emerald-600'}`}
            >
              {money(bal, row.original.currency)}
            </span>
          );
        }
      },
      {
        accessorKey: 'status',
        header: 'Status',
        cell: ({ row }) => {
          const s = row.original.status || 'draft';
          let v = 'secondary';
          if (s === 'paid') v = 'success';
          else if (s === 'overdue' || s === 'cancelled' || s === 'written_off') v = 'destructive';
          else if (s === 'sent' || s === 'viewed') v = 'default';
          else if (s === 'partially_paid') v = 'warning';
          return <span className={badge(v) + ' capitalize'}>{s.replace(/_/g, ' ')}</span>;
        }
      },
      {
        id: 'actions',
        header: '',
        enableSorting: false,
        cell: ({ row }) => (
          <Link
            href={`/finance/invoices/${row.original.id}`}
            className="inline-flex rounded-lg p-2 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            title="View / print invoice"
          >
            <Eye size={16} />
          </Link>
        )
      }
    ],
    []
  );

  if (!hydrated || !hasAccess) return null;

  return (
    <div className="min-h-screen app-surface">
      <Sidebar />
      <div className="flex flex-col overflow-hidden lg:ml-[280px]">
        <Header title="Finance · Invoices" />
        <main className="flex-1 overflow-auto p-4 md:p-6">
          <div className="flex w-full flex-col gap-6">
            <div className="flex flex-col justify-between gap-4 rounded-2xl border border-border bg-card p-6 shadow-sm md:flex-row md:items-center">
              <div>
                <h1 className="flex items-center gap-3 text-2xl font-bold">
                  <div className="rounded-xl bg-primary/10 p-2 text-primary">
                    <Receipt size={24} />
                  </div>
                  Invoices
                </h1>
                <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
                  Unified invoices for POS tills and linked websites — one format for every channel.
                </p>
              </div>
              {uninvoiced && uninvoiced.count > 0 && (
                <div className="rounded-xl border border-brand/30 bg-brand/10 px-4 py-3 text-sm">
                  <div className="font-semibold text-brand-700">
                    {uninvoiced.count} order{uninvoiced.count === 1 ? '' : 's'} ready to invoice
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    {uninvoiced.byChannel
                      .slice(0, 3)
                      .map((c) => `${c.store || CHANNEL_LABELS[c.channel] || c.channel}: ${c.count}`)
                      .join(' · ')}
                  </div>
                </div>
              )}
            </div>

            <FilterBar
              fields={filterFields}
              values={filters}
              onChange={setFilters}
              searchValue={search}
              onSearchChange={setSearch}
              searchPlaceholder="Invoice #, order #, customer, email…"
              loading={loading}
              stats={[
                { label: 'Invoices', value: String(summary.count) },
                {
                  label: 'Invoiced',
                  value: summary.totalInvoiced.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP'
                  })
                },
                {
                  label: 'Paid',
                  value: summary.totalPaid.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP'
                  })
                },
                {
                  label: 'Outstanding',
                  value: summary.totalOutstanding.toLocaleString('en-GB', {
                    style: 'currency',
                    currency: 'GBP'
                  })
                },
                ...(summary.overdueCount
                  ? [{ label: 'Overdue', value: String(summary.overdueCount) }]
                  : [])
              ]}
              actions={
                <>
                  <button
                    onClick={() => void loadData()}
                    disabled={loading || generating}
                    className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-2 text-sm hover:bg-muted disabled:opacity-50"
                  >
                    <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                  <button
                    onClick={() => void onGenerate()}
                    disabled={generating || (uninvoiced?.count ?? 0) === 0}
                    className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-medium text-white hover:bg-brand-600 disabled:opacity-50"
                  >
                    <FilePlus2 className={`h-4 w-4 ${generating ? 'animate-pulse' : ''}`} />
                    {generating
                      ? 'Generating…'
                      : uninvoiced?.count
                        ? `Generate ${uninvoiced.count} invoice${uninvoiced.count === 1 ? '' : 's'}`
                        : 'Generate invoices'}
                  </button>
                </>
              }
            />

            {loading ? (
              <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
                Loading invoices…
              </div>
            ) : (
              <div className="rounded-2xl border border-border bg-card p-2 shadow-sm">
                <RichDataTable columns={columns} data={data} hideSearch />
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
